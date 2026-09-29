package com.booking.service;

import com.booking.dto.request.VerifyPaymentRequest;
import com.booking.dto.response.CreateOrderResponse;
import com.booking.dto.response.EarningsResponse;
import com.booking.dto.response.PaymentResponse;
import com.booking.entity.Appointment;
import com.booking.entity.Payment;
import com.booking.enums.*;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
import com.booking.payment.RazorpayGateway;
import com.booking.repository.AppointmentRepository;
import com.booking.repository.PaymentRepository;
import com.booking.security.SecurityUtils;
import com.booking.util.BookingUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/** Online payments, deposits, refunds and payment history (FR-37..40). */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final AppointmentRepository appointmentRepository;
    private final RazorpayGateway gateway;
    private final NotificationService notificationService;
    private final ProviderService providerService;
    private final AuditService auditService;
    private final DtoMapper mapper;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    @Value("${app.payments.currency:INR}")
    private String currency;

    @Transactional
    public CreateOrderResponse createOrder(Long appointmentId) {
        Appointment a = ownedByCustomer(appointmentId);
        Payment p = payable(a);
        if (p.getOrderId() == null) {
            var order = gateway.createOrder(a.getBookingRef(), toMinor(p.getAmount()), p.getCurrency());
            p.setOrderId(order.orderId());
        }
        return new CreateOrderResponse(a.getId(), a.getBookingRef(), p.getAmount(), toMinor(p.getAmount()), p.getCurrency(),
                p.getOrderId(), gateway.publicKey(), !gateway.isLive(), a.getCustomer().getName(), a.getCustomer().getEmail(),
                a.getCustomer().getPhone(), a.getService().getName() + " - " + a.getProvider().getBusinessName()
                + (p.getOption() == PaymentOption.DEPOSIT ? " (deposit)" : ""), a.getPaymentDueAt());
    }

    /** Called by the browser after Razorpay checkout; the signature proves the payment happened. */
    @Transactional
    public PaymentResponse verify(VerifyPaymentRequest req) {
        Appointment a = ownedByCustomer(req.appointmentId());
        Payment p = paymentRepository.findByAppointmentId(a.getId())
                .orElseThrow(() -> ApiException.notFound("Payment not found"));
        if (p.getStatus() == PaymentStatus.SUCCESS) {
            return mapper.payment(p);
        }
        if (p.getOrderId() == null || !p.getOrderId().equals(req.razorpayOrderId())) {
            throw ApiException.badRequest("Order does not match this booking");
        }
        if (!gateway.verifySignature(req.razorpayOrderId(), req.razorpayPaymentId(), req.razorpaySignature())) {
            auditService.record("PAYMENT_SIGNATURE_INVALID", "Payment", p.getId(), "order " + req.razorpayOrderId());
            throw ApiException.badRequest("Payment verification failed");
        }
        markPaid(p, req.razorpayPaymentId());
        return mapper.payment(p);
    }

    /** Development only: completes the simulated checkout (server-side signature). */
    @Transactional
    public PaymentResponse completeDemo(Long appointmentId) {
        Appointment a = ownedByCustomer(appointmentId);
        Payment p = payable(a);
        if (p.getOrderId() == null) {
            createOrder(appointmentId);
        }
        String paymentId = "pay_demo_" + BookingUtils.randomString(14);
        return verify(new VerifyPaymentRequest(appointmentId, p.getOrderId(), paymentId,
                gateway.demoSignature(p.getOrderId(), paymentId)));
    }

    /** Razorpay webhook: payment.captured / payment.failed keep us in sync if the browser never returns. */
    @Transactional
    public void webhook(String body, String signature) {
        if (!gateway.verifyWebhook(body, signature)) {
            throw ApiException.unauthorized("Invalid webhook signature");
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            String event = root.path("event").asText();
            JsonNode entity = root.path("payload").path("payment").path("entity");
            String orderId = entity.path("order_id").asText(null);
            if (orderId == null) return;
            paymentRepository.findByOrderId(orderId).ifPresent(p -> {
                if ("payment.captured".equals(event) && p.getStatus() == PaymentStatus.PENDING
                        && p.getAppointment().getStatus() != AppointmentStatus.CANCELLED) {
                    markPaid(p, entity.path("id").asText());
                } else if ("payment.failed".equals(event)) {
                    auditService.record(null, null, "SYSTEM", "PAYMENT_FAILED", "Payment", p.getId(),
                            entity.path("error_description").asText(""));
                }
            });
        } catch (Exception e) {
            log.warn("Webhook processing failed: {}", e.getMessage());
        }
    }

    private void markPaid(Payment p, String paymentId) {
        Appointment a = p.getAppointment();
        p.setStatus(PaymentStatus.SUCCESS);
        p.setTransactionId(paymentId);
        p.setPaidAt(LocalDateTime.now(clock));
        if (p.getInvoiceNumber() == null) p.setInvoiceNumber(BookingUtils.generateInvoiceNumber(LocalDate.now(clock)));
        a.setPaymentStatus(PaymentStatus.SUCCESS);
        a.setPaymentDueAt(null);
        boolean confirm = a.getProvider().isAutoConfirm() && a.getStatus() == AppointmentStatus.PENDING;
        if (confirm) a.setStatus(AppointmentStatus.CONFIRMED);
        auditService.record(a.getCustomer().getId(), a.getCustomer().getEmail(), "CUSTOMER", "PAYMENT_SUCCESS", "Payment",
                p.getId(), a.getBookingRef() + " " + p.getCurrency() + " " + p.getAmount() + " txn " + paymentId);
        notificationService.paymentReceived(a, p.getAmount(), p.getCurrency());
        if (confirm) notificationService.bookingConfirmed(a);
    }

    /**
     * Refunds a percentage of what was paid online (FR-39). Returns the refunded amount.
     * Called from the cancellation flow inside its transaction.
     */
    @Transactional
    public double refund(Appointment a, int percent, String reason) {
        Payment p = paymentRepository.findByAppointmentId(a.getId()).orElse(null);
        if (p == null || p.getMethod() != PaymentMethod.RAZORPAY
                || (p.getStatus() != PaymentStatus.SUCCESS && p.getStatus() != PaymentStatus.PARTIALLY_REFUNDED)) {
            return 0;
        }
        double refundable = BookingUtils.money(p.getAmount() - p.getRefundAmount());
        double amount = BookingUtils.money(refundable * Math.max(0, Math.min(100, percent)) / 100.0);
        if (amount <= 0) {
            return 0;
        }
        var refund = gateway.refund(p.getTransactionId(), toMinor(amount));
        p.setRefundId(refund.refundId());
        p.setRefundAmount(BookingUtils.money(p.getRefundAmount() + amount));
        p.setRefundedAt(LocalDateTime.now(clock));
        p.setStatus(p.getRefundAmount() + 0.001 >= p.getAmount() ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED);
        a.setPaymentStatus(p.getStatus());
        auditService.record("PAYMENT_REFUNDED", "Payment", p.getId(),
                a.getBookingRef() + " refunded " + amount + " (" + percent + "%) " + (reason == null ? "" : reason));
        return amount;
    }

    /** Provider records money collected at the venue (pay-at-venue or deposit balance). */
    @Transactional
    public PaymentResponse markCollected(Long appointmentId) {
        Long providerId = providerService.current().getId();
        Appointment a = appointmentRepository.findById(appointmentId)
                .filter(x -> x.getProvider().getId().equals(providerId))
                .orElseThrow(() -> ApiException.notFound("Appointment not found"));
        if (a.getStatus() == AppointmentStatus.CANCELLED) {
            throw ApiException.badRequest("Appointment is cancelled");
        }
        Payment p = paymentRepository.findByAppointmentId(a.getId()).orElseThrow(() -> ApiException.notFound("Payment not found"));
        if (p.getBalanceDue() <= 0) {
            throw ApiException.badRequest("Nothing left to collect");
        }
        p.setAmount(BookingUtils.money(p.getAmount() + p.getBalanceDue()));
        p.setBalanceDue(0);
        p.setStatus(PaymentStatus.SUCCESS);
        if (p.getPaidAt() == null) p.setPaidAt(LocalDateTime.now(clock));
        if (p.getTransactionId() == null) p.setTransactionId("venue_" + BookingUtils.randomString(12));
        if (p.getInvoiceNumber() == null) p.setInvoiceNumber(BookingUtils.generateInvoiceNumber(LocalDate.now(clock)));
        a.setPaymentStatus(PaymentStatus.SUCCESS);
        auditService.record("PAYMENT_COLLECTED_AT_VENUE", "Payment", p.getId(), a.getBookingRef());
        return mapper.payment(p);
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> history() {
        return paymentRepository.findHistoryForCustomer(SecurityUtils.currentUserId()).stream().map(mapper::payment).toList();
    }

    @Transactional(readOnly = true)
    public EarningsResponse earnings() {
        List<Payment> payments = paymentRepository.findHistoryForProvider(providerService.current().getId());
        double online = 0, venue = 0, due = 0, refunded = 0;
        for (Payment p : payments) {
            refunded += p.getRefundAmount();
            if (p.getAppointment().getStatus() != AppointmentStatus.CANCELLED) due += p.getBalanceDue();
            if (p.getStatus() == PaymentStatus.SUCCESS || p.getStatus() == PaymentStatus.PARTIALLY_REFUNDED
                    || p.getStatus() == PaymentStatus.REFUNDED) {
                if (p.getMethod() == PaymentMethod.RAZORPAY) online += p.getAmount();
                else venue += p.getAmount();
            }
        }
        return new EarningsResponse(BookingUtils.money(online + venue - refunded), BookingUtils.money(online),
                BookingUtils.money(due), BookingUtils.money(refunded), payments.stream().map(mapper::payment).toList());
    }

    private Payment payable(Appointment a) {
        if (a.getStatus() == AppointmentStatus.CANCELLED) {
            throw ApiException.badRequest("This booking was cancelled" + (a.getCancelReason() == null ? "" : ": " + a.getCancelReason()));
        }
        Payment p = paymentRepository.findByAppointmentId(a.getId()).orElseThrow(() -> ApiException.notFound("Payment not found"));
        if (p.getMethod() != PaymentMethod.RAZORPAY) {
            throw ApiException.badRequest("This booking is paid at the venue");
        }
        if (p.getStatus() != PaymentStatus.PENDING) {
            throw ApiException.badRequest("This booking is already paid");
        }
        if (a.getPaymentDueAt() != null && a.getPaymentDueAt().isBefore(clock.instant())) {
            throw ApiException.badRequest("The payment window has expired and the slot was released. Please book again.");
        }
        return p;
    }

    private Appointment ownedByCustomer(Long appointmentId) {
        return appointmentRepository.findById(appointmentId)
                .filter(a -> a.getCustomer().getId().equals(SecurityUtils.currentUserId()))
                .orElseThrow(() -> ApiException.notFound("Appointment not found"));
    }

    static long toMinor(double amount) {
        return Math.round(amount * 100);
    }
}
