package com.booking.service;

import com.booking.dto.request.VerifyPaymentRequest;
import com.booking.dto.response.CreateOrderResponse;
import com.booking.dto.response.MessageResponse;
import com.booking.dto.response.PaymentResponse;
import com.booking.entity.Appointment;
import com.booking.entity.Payment;
import com.booking.enums.PaymentMethod;
import com.booking.enums.PaymentStatus;
import com.booking.exception.ApiException;
import com.booking.repository.AppointmentRepository;
import com.booking.repository.PaymentRepository;
import com.booking.security.SecurityUtils;
import com.booking.util.BookingUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final AppointmentRepository appointmentRepository;
    private final NotificationService notificationService;

    @Value("${app.razorpay.key-id:rzp_test_demo}")
    private String razorpayKeyId;

    @Value("${app.razorpay.key-secret:demo}")
    private String razorpayKeySecret;

    @Transactional
    public CreateOrderResponse createOrder(Long appointmentId) {
        Appointment a = ownedAppointment(appointmentId);
        Payment payment = paymentRepository.findByAppointmentId(appointmentId)
                .filter(p -> p.getStatus() == PaymentStatus.PENDING)
                .orElseGet(() -> {
                    Payment np = Payment.builder()
                            .appointment(a)
                            .amount(a.getFinalAmount())
                            .method(a.getPayment() != null ? a.getPayment().getMethod() : PaymentMethod.RAZORPAY)
                            .status(PaymentStatus.PENDING)
                            .build();
                    return paymentRepository.save(np);
                });
        if (payment.getOrderId() == null) {
            payment.setOrderId(BookingUtils.generateOrderId());
            paymentRepository.save(payment);
        }
        boolean demo = razorpayKeyId.contains("test_demo") || razorpayKeySecret.equals("demo");
        return new CreateOrderResponse(a.getId(), a.getBookingRef(), a.getFinalAmount(),
                payment.getOrderId(), "INR", demo ? null : razorpayKeyId, demo);
    }

    @Transactional
    public PaymentResponse verify(VerifyPaymentRequest req) {
        Appointment a = appointmentRepository.findById(req.appointmentId())
                .orElseThrow(() -> ApiException.notFound("Appointment not found"));
        if (!a.getCustomer().getId().equals(SecurityUtils.currentUserId())) {
            throw ApiException.forbidden("Not your appointment");
        }
        Payment payment = paymentRepository.findByAppointmentId(a.getId())
                .orElseThrow(() -> ApiException.notFound("Payment record not found"));

        payment.setMethod(req.method());
        if (req.method() == PaymentMethod.PAY_AT_VENUE && req.paidAtVenue() != null && req.paidAtVenue()) {
            payment.setStatus(PaymentStatus.SUCCESS);
            payment.setTxnId(BookingUtils.generateTxnId());
            payment.setPaidAt(LocalDateTime.now());
        } else {
            payment.setStatus(PaymentStatus.SUCCESS);
            payment.setTxnId(req.txnId() != null ? req.txnId() : BookingUtils.generateTxnId());
            payment.setRazorpayPaymentId(req.razorpayPaymentId());
            payment.setPaidAt(LocalDateTime.now());
        }
        payment.setOrderId(req.orderId());
        paymentRepository.save(payment);

        if (a.getStatus() == com.booking.enums.AppointmentStatus.PENDING
                || a.getStatus() == com.booking.enums.AppointmentStatus.RESCHEDULED) {
            a.setStatus(com.booking.enums.AppointmentStatus.CONFIRMED);
            appointmentRepository.save(a);
        }
        log.info("[PAYMENT] appointment={} txn={} amount={} status=SUCCESS",
                a.getBookingRef(), payment.getTxnId(), payment.getAmount());
        notificationService.bookingConfirmed(a);
        return toResponse(payment);
    }

    @Transactional
    public PaymentResponse markFailed(Long appointmentId) {
        Appointment a = ownedAppointment(appointmentId);
        Payment payment = paymentRepository.findByAppointmentId(appointmentId)
                .orElseThrow(() -> ApiException.notFound("Payment record not found"));
        payment.setStatus(PaymentStatus.FAILED);
        paymentRepository.save(payment);
        if (a.getStatus() == com.booking.enums.AppointmentStatus.PENDING) {
            a.setStatus(com.booking.enums.AppointmentStatus.CANCELLED);
            a.setCancelReason("Payment failed");
            appointmentRepository.save(a);
        }
        return toResponse(payment);
    }

    @Transactional(readOnly = true)
    public List<PaymentResponse> history() {
        return paymentRepository.findByAppointmentCustomerIdOrderByAppointmentDateDesc(SecurityUtils.currentUserId())
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public MessageResponse refund(Long appointmentId) {
        Payment p = paymentRepository.findByAppointmentId(appointmentId)
                .orElseThrow(() -> ApiException.notFound("Payment not found"));
        if (p.getStatus() != PaymentStatus.SUCCESS) {
            throw ApiException.badRequest("Only successful payments can be refunded");
        }
        p.setStatus(PaymentStatus.REFUNDED);
        p.setRefundId(BookingUtils.generateRefundId());
        paymentRepository.save(p);
        notificationService.notifyUser(p.getAppointment().getCustomer().getId(), "Refund processed",
                "Your refund of " + p.getAmount() + " for booking " + p.getAppointment().getBookingRef() + " has been processed.", com.booking.enums.NotifType.PAYMENT);
        return new MessageResponse("Refund initiated successfully");
    }

    private Appointment ownedAppointment(Long appointmentId) {
        Appointment a = appointmentRepository.findById(appointmentId)
                .orElseThrow(() -> ApiException.notFound("Appointment not found"));
        if (!a.getCustomer().getId().equals(SecurityUtils.currentUserId())) {
            throw ApiException.forbidden("Not your appointment");
        }
        return a;
    }

    public PaymentResponse toResponse(Payment p) {
        return new PaymentResponse(p.getId(), p.getAppointment().getId(), p.getAppointment().getBookingRef(),
                p.getAmount(), p.getMethod(), p.getStatus(), p.getOrderId(), p.getTxnId(),
                p.getRefundId(), p.getPaidAt());
    }
}