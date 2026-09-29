package com.booking.api;

import com.booking.dto.response.AppointmentResponse;
import com.booking.dto.response.CouponValidateResponse;
import com.booking.dto.response.CreateOrderResponse;
import com.booking.dto.response.PaymentResponse;
import com.booking.entity.AuditLog;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.User;
import com.booking.enums.*;
import com.booking.payment.RazorpayGateway;
import com.booking.repository.AppointmentRepository;
import com.booking.repository.AuditLogRepository;
import com.booking.repository.CouponRepository;
import com.booking.repository.NotificationRepository;
import com.booking.repository.PaymentRepository;
import com.booking.service.AppointmentService;
import com.booking.service.SchedulerJobs;
import com.booking.support.IntegrationTestBase;
import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Booking creation through the API: roles, payment methods, coupons, deposits, online mode, expiry, races. */
class BookingFlowApiTest extends IntegrationTestBase {

    private static final String REF_PATTERN = "BK-300107-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}";

    @Autowired private CouponRepository couponRepository;
    @Autowired private PaymentRepository paymentRepository;
    @Autowired private AppointmentRepository appointmentRepository;
    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private AppointmentService appointmentService;
    @Autowired private SchedulerJobs schedulerJobs;
    @Autowired private RazorpayGateway razorpayGateway;

    private Provider provider;
    private DomainService service;
    private User customer;
    private String customerToken;
    private LocalDate day;

    @BeforeEach
    void setUp() {
        provider = data.provider();
        data.openAllWeek(provider, LocalTime.of(9, 0), LocalTime.of(17, 0));
        service = data.service(provider, "Consultation", 30, 0, 1000);
        customer = data.customer();
        customerToken = auth.token(customer);
        day = inDays(2);
    }

    private Map<String, Object> body(String time, PaymentMethod method) {
        return bookingBody(provider.getId(), service.getId(), day, time, method);
    }

    private List<String> notificationTitles(User user) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(user.getId(), PageRequest.of(0, 100)).stream()
                .map(n -> n.getTitle()).toList();
    }

    private List<AuditLog> audit(String action) {
        return auditLogRepository.findAll().stream().filter(a -> a.getAction().equals(action)).toList();
    }

    private int couponUses(String code) {
        return couponRepository.findByCodeIgnoreCase(code).orElseThrow().getUsedCount();
    }

    // ------------------------------------------------------------------ roles & verification

    @Test
    void bookingRequiresASignedInCustomer() throws Exception {
        post("/api/appointments", null, body("10:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isUnauthorized());
        post("/api/appointments", auth.token(provider.getUser()), body("10:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isForbidden());
        post("/api/appointments", auth.token(data.admin()), body("10:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isForbidden());
    }

    @Test
    void unverifiedCustomerCannotBook() throws Exception {
        String token = auth.token(data.unverifiedCustomer());

        post("/api/appointments", token, body("10:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Please verify your e-mail address before booking"));
        assertThat(appointmentRepository.count()).isZero();
    }

    @Test
    void invalidBookingRequestsAreRejected() throws Exception {
        post("/api/appointments", customerToken, Map.of("providerId", provider.getId()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.serviceId").exists())
                .andExpect(jsonPath("$.errors.paymentMethod").exists());
        post("/api/appointments", customerToken,
                bookingBody(999_999L, service.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isNotFound());
        post("/api/appointments", customerToken,
                bookingBody(provider.getId(), service.getId(), inDays(-1), "10:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Cannot book a date in the past"));
        post("/api/appointments", customerToken,
                bookingBody(provider.getId(), service.getId(), inDays(45), "10:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Bookings open up to 30 days in advance"));
        post("/api/appointments", customerToken, body("10:05", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isConflict());
    }

    // ------------------------------------------------------------------ pay at venue

    @Test
    void payAtVenueBookingIsConfirmedImmediately() throws Exception {
        Map<String, Object> req = body("10:00", PaymentMethod.PAY_AT_VENUE);
        req.put("notes", "First visit");
        AppointmentResponse a = book(customerToken, req);

        assertThat(a.bookingRef()).matches(REF_PATTERN);
        assertThat(a.status()).isEqualTo(AppointmentStatus.CONFIRMED);
        assertThat(a.paymentStatus()).isEqualTo(PaymentStatus.PENDING);
        assertThat(a.paymentDueAt()).isNull();
        assertThat(a.mode()).isEqualTo(ServiceMode.IN_PERSON);
        assertThat(a.meetingLink()).isNull();
        assertThat(a.date()).isEqualTo(day);
        assertThat(a.startTime()).isEqualTo(LocalTime.of(10, 0));
        assertThat(a.endTime()).isEqualTo(LocalTime.of(10, 30));
        assertThat(a.startAt()).isEqualTo(Instant.parse("2030-01-09T10:00:00Z"));
        assertThat(a.timezone()).isEqualTo("UTC");
        assertThat(a.notes()).isEqualTo("First visit");
        assertThat(a.amount()).isEqualTo(1000);
        assertThat(a.finalAmount()).isEqualTo(1000);
        assertThat(a.customerEmail()).as("customers do not get contact details of themselves echoed").isNull();
        assertThat(a.payment().method()).isEqualTo(PaymentMethod.PAY_AT_VENUE);
        assertThat(a.payment().option()).isEqualTo(PaymentOption.PAY_AT_VENUE);
        assertThat(a.payment().amount()).isZero();
        assertThat(a.payment().balanceDue()).isEqualTo(1000);
        assertThat(a.actions().canCancel()).isTrue();
        assertThat(a.actions().canReschedule()).isTrue();
        assertThat(a.actions().canPay()).isFalse();
        assertThat(a.actions().canConfirm()).isFalse();

        assertThat(notificationTitles(customer)).contains("Booking confirmed");
        assertThat(notificationTitles(provider.getUser())).contains("New booking " + a.bookingRef());
        verify(emailSender, atLeastOnce()).send(eq(customer.getEmail()), eq("Booking confirmed"), contains(a.bookingRef()), any(), any());
        verify(emailSender, atLeastOnce()).send(eq(provider.getUser().getEmail()), eq("New booking " + a.bookingRef()),
                contains("Notes: First visit"), any(), any());
        verify(smsSender, atLeastOnce()).send(eq(customer.getPhone()), contains(a.bookingRef()));
        assertThat(audit("APPOINTMENT_BOOKED")).hasSize(1);

        // the provider sees the customer's contact details
        AppointmentResponse providerView = getAppointment(a.id(), auth.token(provider.getUser()));
        assertThat(providerView.customerEmail()).isEqualTo(customer.getEmail());
    }

    @Test
    void providerWithoutAutoConfirmLeavesBookingPending() throws Exception {
        data.updateProvider(provider.getId(), p -> p.setAutoConfirm(false));

        AppointmentResponse a = book(customerToken, body("10:00", PaymentMethod.PAY_AT_VENUE));

        assertThat(a.status()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(notificationTitles(customer)).contains("Booking received");
        AppointmentResponse providerView = getAppointment(a.id(), auth.token(provider.getUser()));
        assertThat(providerView.actions().canConfirm()).isTrue();
        assertThat(providerView.actions().canReject()).isTrue();
    }

    // ------------------------------------------------------------------ online payment (demo gateway)

    @Test
    void onlinePaymentKeepsBookingPendingUntilPaidThenConfirms() throws Exception {
        AppointmentResponse a = book(customerToken, body("10:00", PaymentMethod.RAZORPAY));

        assertThat(a.status()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(a.paymentStatus()).isEqualTo(PaymentStatus.PENDING);
        assertThat(a.paymentDueAt()).isEqualTo(clock.instant().plus(Duration.ofMinutes(10)));
        assertThat(a.actions().canPay()).isTrue();
        assertThat(a.payment().method()).isEqualTo(PaymentMethod.RAZORPAY);
        assertThat(a.payment().option()).isEqualTo(PaymentOption.FULL);
        assertThat(a.payment().amount()).isEqualTo(1000);
        assertThat(a.payment().balanceDue()).isZero();
        assertThat(notificationTitles(customer)).contains("Complete your payment");
        assertThat(notificationTitles(provider.getUser())).contains("New booking " + a.bookingRef() + " (awaiting payment)");

        CreateOrderResponse order = read(mvc.perform(MockMvcRequestBuilders.post("/api/payments/create-order")
                .param("appointmentId", a.id().toString())
                .header("Authorization", "Bearer " + customerToken)).andExpect(status().isOk()), CreateOrderResponse.class);
        assertThat(order.orderId()).startsWith("order_demo_");
        assertThat(order.amount()).isEqualTo(1000);
        assertThat(order.amountMinor()).isEqualTo(100_000);
        assertThat(order.currency()).isEqualTo("INR");
        assertThat(order.demoMode()).isTrue();
        assertThat(order.keyId()).isNull();
        assertThat(order.bookingRef()).isEqualTo(a.bookingRef());
        assertThat(order.expiresAt()).isEqualTo(a.paymentDueAt());
        assertThat(order.description()).isEqualTo("Consultation - " + provider.getBusinessName());

        // creating the order again re-uses it
        CreateOrderResponse again = read(mvc.perform(MockMvcRequestBuilders.post("/api/payments/create-order")
                .param("appointmentId", a.id().toString())
                .header("Authorization", "Bearer " + customerToken)), CreateOrderResponse.class);
        assertThat(again.orderId()).isEqualTo(order.orderId());

        PaymentResponse paid = read(mvc.perform(MockMvcRequestBuilders.post("/api/payments/demo/complete")
                .param("appointmentId", a.id().toString())
                .header("Authorization", "Bearer " + customerToken)).andExpect(status().isOk()), PaymentResponse.class);
        assertThat(paid.status()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(paid.invoiceNumber()).matches("INV-300107-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}");
        assertThat(paid.transactionId()).startsWith("pay_demo_");
        assertThat(paid.paidAt()).isNotNull();

        AppointmentResponse after = getAppointment(a.id(), customerToken);
        assertThat(after.status()).isEqualTo(AppointmentStatus.CONFIRMED);
        assertThat(after.paymentStatus()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(after.paymentDueAt()).isNull();
        assertThat(after.actions().canPay()).isFalse();
        assertThat(notificationTitles(customer)).contains("Payment received", "Booking confirmed");
        assertThat(audit("PAYMENT_SUCCESS")).hasSize(1);

        List<PaymentResponse> history = read(get("/api/payments/history", customerToken).andExpect(status().isOk()),
                new TypeReference<>() { });
        assertThat(history).extracting(PaymentResponse::appointmentId).containsExactly(a.id());

        // paying twice is refused, verifying again is idempotent
        mvc.perform(MockMvcRequestBuilders.post("/api/payments/demo/complete").param("appointmentId", a.id().toString())
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This booking is already paid"));
        post("/api/payments/verify", customerToken, Map.of("appointmentId", a.id(), "razorpayOrderId", order.orderId(),
                "razorpayPaymentId", "pay_other", "razorpaySignature", "whatever"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"));
    }

    @Test
    void verifyAcceptsAValidGatewaySignature() throws Exception {
        AppointmentResponse a = book(customerToken, body("10:00", PaymentMethod.RAZORPAY));
        CreateOrderResponse order = read(mvc.perform(MockMvcRequestBuilders.post("/api/payments/create-order")
                .param("appointmentId", a.id().toString())
                .header("Authorization", "Bearer " + customerToken)), CreateOrderResponse.class);

        String signature = razorpayGateway.demoSignature(order.orderId(), "pay_manual_1");
        post("/api/payments/verify", customerToken, Map.of("appointmentId", a.id(), "razorpayOrderId", order.orderId(),
                "razorpayPaymentId", "pay_manual_1", "razorpaySignature", signature))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.transactionId").value("pay_manual_1"));
        assertThat(getAppointment(a.id(), customerToken).status()).isEqualTo(AppointmentStatus.CONFIRMED);
    }

    @Test
    void verifyWithBadSignatureOrForeignOrderIsRejected() throws Exception {
        AppointmentResponse a = book(customerToken, body("10:00", PaymentMethod.RAZORPAY));
        // no order yet
        post("/api/payments/verify", customerToken, Map.of("appointmentId", a.id(), "razorpayOrderId", "order_x",
                "razorpayPaymentId", "pay_x", "razorpaySignature", "sig"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Order does not match this booking"));
        CreateOrderResponse order = read(mvc.perform(MockMvcRequestBuilders.post("/api/payments/create-order")
                .param("appointmentId", a.id().toString())
                .header("Authorization", "Bearer " + customerToken)), CreateOrderResponse.class);

        post("/api/payments/verify", customerToken, Map.of("appointmentId", a.id(), "razorpayOrderId", order.orderId(),
                "razorpayPaymentId", "pay_fake", "razorpaySignature", "deadbeef"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Payment verification failed"));
        post("/api/payments/verify", customerToken, Map.of("appointmentId", a.id(), "razorpayOrderId", "order_other",
                "razorpayPaymentId", "pay_fake", "razorpaySignature", "deadbeef"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Order does not match this booking"));
        // another customer cannot even see the booking
        post("/api/payments/verify", auth.token(data.customer()), Map.of("appointmentId", a.id(),
                "razorpayOrderId", order.orderId(), "razorpayPaymentId", "p", "razorpaySignature", "s"))
                .andExpect(status().isNotFound());

        AppointmentResponse after = getAppointment(a.id(), customerToken);
        assertThat(after.status()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(after.paymentStatus()).isEqualTo(PaymentStatus.PENDING);
    }

    @Test
    @Disabled("BUG: PaymentService.verify (src/main/java/com/booking/service/PaymentService.java:64-77) records the "
            + "PAYMENT_SIGNATURE_INVALID audit entry and then throws ApiException inside the same @Transactional "
            + "method, so the transaction rolls back and the audit row is never persisted. Tampered payment "
            + "confirmations leave no audit trail. Fix: noRollbackFor = ApiException.class or REQUIRES_NEW for the audit write.")
    void invalidPaymentSignatureIsRecordedInTheAuditLog() throws Exception {
        AppointmentResponse a = book(customerToken, body("10:00", PaymentMethod.RAZORPAY));
        CreateOrderResponse order = read(mvc.perform(MockMvcRequestBuilders.post("/api/payments/create-order")
                .param("appointmentId", a.id().toString())
                .header("Authorization", "Bearer " + customerToken)), CreateOrderResponse.class);

        post("/api/payments/verify", customerToken, Map.of("appointmentId", a.id(), "razorpayOrderId", order.orderId(),
                "razorpayPaymentId", "pay_fake", "razorpaySignature", "deadbeef"))
                .andExpect(status().isBadRequest());

        assertThat(audit("PAYMENT_SIGNATURE_INVALID")).hasSize(1);
    }

    @Test
    void razorpayWebhookConfirmsPaymentWhenSignedCorrectly() throws Exception {
        AppointmentResponse a = book(customerToken, body("10:00", PaymentMethod.RAZORPAY));
        CreateOrderResponse order = read(mvc.perform(MockMvcRequestBuilders.post("/api/payments/create-order")
                .param("appointmentId", a.id().toString())
                .header("Authorization", "Bearer " + customerToken)), CreateOrderResponse.class);
        String captured = "{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"pay_wh_1\","
                + "\"order_id\":\"" + order.orderId() + "\"}}}}";

        webhook(captured, "not-the-signature").andExpect(status().isUnauthorized());
        webhook(captured, null).andExpect(status().isUnauthorized());
        assertThat(getAppointment(a.id(), customerToken).paymentStatus()).isEqualTo(PaymentStatus.PENDING);

        webhook(captured, sign(captured)).andExpect(status().isOk()).andExpect(jsonPath("$.message").value("ok"));

        AppointmentResponse after = getAppointment(a.id(), customerToken);
        assertThat(after.status()).isEqualTo(AppointmentStatus.CONFIRMED);
        assertThat(after.paymentStatus()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(after.payment().transactionId()).isEqualTo("pay_wh_1");

        // failures are audited; unknown orders, missing ids and garbage are ignored
        String failed = "{\"event\":\"payment.failed\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"pay_wh_2\","
                + "\"order_id\":\"" + order.orderId() + "\",\"error_description\":\"Card declined\"}}}}";
        webhook(failed, sign(failed)).andExpect(status().isOk());
        assertThat(audit("PAYMENT_FAILED")).extracting(AuditLog::getDetails).containsExactly("Card declined");
        String unknown = "{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"p\",\"order_id\":\"order_nope\"}}}}";
        webhook(unknown, sign(unknown)).andExpect(status().isOk());
        String noOrder = "{\"event\":\"payment.captured\",\"payload\":{}}";
        webhook(noOrder, sign(noOrder)).andExpect(status().isOk());
        webhook("not json", sign("not json")).andExpect(status().isOk());
    }

    private org.springframework.test.web.servlet.ResultActions webhook(String body, String signature) throws Exception {
        var req = MockMvcRequestBuilders.post("/api/payments/webhook").contentType(MediaType.APPLICATION_JSON).content(body);
        if (signature != null) {
            req.header("X-Razorpay-Signature", signature);
        }
        return mvc.perform(req);
    }

    private static String sign(String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec("test-webhook-secret".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
    }

    // ------------------------------------------------------------------ double booking

    @Test
    void doubleBookingOfTheSameSlotIsRejected() throws Exception {
        book(customerToken, body("10:00", PaymentMethod.PAY_AT_VENUE));

        post("/api/appointments", auth.token(data.customer()), body("10:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Sorry, this slot was just taken. Please choose another time."));
        // an unpaid online booking also occupies the slot
        post("/api/appointments", auth.token(data.customer()), body("11:00", PaymentMethod.RAZORPAY))
                .andExpect(status().isCreated());
        post("/api/appointments", auth.token(data.customer()), body("11:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isConflict());
    }

    @Test
    void concurrentBookingsOfTheSameSlotLetExactlyOneSucceed() throws Exception {
        int threads = 8;
        List<String> tokens = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            tokens.add(auth.token(data.customer()));
        }
        String json = objectMapper.writeValueAsString(body("14:00", PaymentMethod.PAY_AT_VENUE));
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (String token : tokens) {
                futures.add(pool.submit(() -> {
                    start.await();
                    return mvc.perform(MockMvcRequestBuilders.post("/api/appointments").contentType(MediaType.APPLICATION_JSON).content(json)
                            .header("Authorization", "Bearer " + token)).andReturn().getResponse().getStatus();
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : futures) {
                statuses.add(f.get(60, TimeUnit.SECONDS));
            }

            assertThat(statuses).filteredOn(s -> s == 201).hasSize(1);
            assertThat(statuses).filteredOn(s -> s == 409).hasSize(threads - 1);
        } finally {
            pool.shutdownNow();
        }
        assertThat(appointmentRepository.count()).isEqualTo(1);
        assertThat(paymentRepository.count()).isEqualTo(1);
    }

    // ------------------------------------------------------------------ coupons

    @Test
    void couponIsOnlyConsumedByBookingAndHonoursTheLimits() throws Exception {
        data.coupon("SAVE10", DiscountType.PERCENT, 10, c -> { c.setMinOrder(500); c.setPerUserLimit(1); });

        CouponValidateResponse preview = read(get("/api/coupons/validate?code=save10&amount=1000", null)
                .andExpect(status().isOk()), CouponValidateResponse.class);
        assertThat(preview.valid()).isTrue();
        assertThat(preview.code()).isEqualTo("SAVE10");
        assertThat(preview.discount()).isEqualTo(100);
        assertThat(preview.finalAmount()).isEqualTo(900);
        get("/api/coupons/validate?code=SAVE10&amount=1000", customerToken).andExpect(status().isOk());
        assertThat(couponUses("SAVE10")).as("validation is side-effect free").isZero();

        Map<String, Object> req = body("10:00", PaymentMethod.PAY_AT_VENUE);
        req.put("couponCode", "save10");
        AppointmentResponse a = book(customerToken, req);
        assertThat(a.couponCode()).isEqualTo("SAVE10");
        assertThat(a.discount()).isEqualTo(100);
        assertThat(a.finalAmount()).isEqualTo(900);
        assertThat(a.payment().balanceDue()).isEqualTo(900);
        assertThat(couponUses("SAVE10")).isEqualTo(1);

        // per-user limit: the same customer cannot use it again (neither preview nor booking)
        get("/api/coupons/validate?code=SAVE10&amount=1000", customerToken)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("You have already used this coupon"));
        Map<String, Object> again = body("11:00", PaymentMethod.PAY_AT_VENUE);
        again.put("couponCode", "SAVE10");
        post("/api/appointments", customerToken, again)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("You have already used this coupon"));
        assertThat(couponUses("SAVE10")).isEqualTo(1);
        assertThat(appointmentRepository.count()).isEqualTo(1);

        // another customer may
        book(auth.token(data.customer()), again);
        assertThat(couponUses("SAVE10")).isEqualTo(2);

        // minimum order value
        get("/api/coupons/validate?code=SAVE10&amount=400", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Minimum order value for this coupon is 500.0"));
    }

    @Test
    void couponMinimumOrderIsEnforcedAtBooking() throws Exception {
        data.coupon("BIGSPENDER", DiscountType.FLAT, 200, c -> c.setMinOrder(5000));
        Map<String, Object> req = body("10:00", PaymentMethod.PAY_AT_VENUE);
        req.put("couponCode", "BIGSPENDER");

        post("/api/appointments", customerToken, req)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Minimum order value for this coupon is 5000.0"));
        assertThat(couponUses("BIGSPENDER")).isZero();
    }

    @Test
    void couponValidityRulesAreChecked() throws Exception {
        data.coupon("ONCE", DiscountType.FLAT, 50, c -> c.setUsageLimit(1));
        data.coupon("OFF", DiscountType.FLAT, 50, c -> c.setActive(false));
        data.coupon("OLD", DiscountType.FLAT, 50, c -> c.setValidTo(LocalDate.now().minusDays(1)));
        data.coupon("SOON", DiscountType.FLAT, 50, c -> c.setValidFrom(LocalDate.now().plusDays(5)));
        data.coupon("HALF", DiscountType.PERCENT, 50, c -> c.setMaxDiscount(300));

        Map<String, Object> first = body("10:00", PaymentMethod.PAY_AT_VENUE);
        first.put("couponCode", "ONCE");
        book(customerToken, first);
        Map<String, Object> second = body("11:00", PaymentMethod.PAY_AT_VENUE);
        second.put("couponCode", "ONCE");
        post("/api/appointments", auth.token(data.customer()), second)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This coupon has reached its usage limit"));

        get("/api/coupons/validate?code=OFF&amount=1000", null).andExpect(jsonPath("$.message").value("This coupon is no longer active"));
        get("/api/coupons/validate?code=OLD&amount=1000", null).andExpect(jsonPath("$.message").value("This coupon has expired"));
        get("/api/coupons/validate?code=SOON&amount=1000", null).andExpect(jsonPath("$.message").value("This coupon is not valid yet"));
        get("/api/coupons/validate?code=NOPE&amount=1000", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid coupon code"));
        get("/api/coupons/validate?code=HALF&amount=1000", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.discount").value(300.0))
                .andExpect(jsonPath("$.finalAmount").value(700.0));
    }

    @Test
    void fullyDiscountedBookingIsFreeAndConfirmedEvenForOnlinePayment() throws Exception {
        data.coupon("FREEBIE", DiscountType.FLAT, 5000, c -> { });
        Map<String, Object> req = body("10:00", PaymentMethod.RAZORPAY);
        req.put("couponCode", "FREEBIE");

        AppointmentResponse a = book(customerToken, req);

        assertThat(a.discount()).isEqualTo(1000);
        assertThat(a.finalAmount()).isZero();
        assertThat(a.status()).isEqualTo(AppointmentStatus.CONFIRMED);
        assertThat(a.paymentStatus()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(a.paymentDueAt()).isNull();
        assertThat(a.payment().status()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(a.payment().method()).isEqualTo(PaymentMethod.PAY_AT_VENUE);
        assertThat(a.payment().option()).isEqualTo(PaymentOption.FULL);
        assertThat(a.payment().paidAt()).isNotNull();
    }

    // ------------------------------------------------------------------ deposits

    @Test
    void depositIsOnlyOfferedWhenTheServiceAllowsIt() throws Exception {
        Map<String, Object> req = body("10:00", PaymentMethod.RAZORPAY);
        req.put("paymentOption", "DEPOSIT");
        post("/api/appointments", customerToken, req)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This service does not accept deposits"));

        DomainService withDeposit = data.service(provider, "Implant", 60, 0, 1000, s -> s.setDepositPercent(30));
        Map<String, Object> dep = bookingBody(provider.getId(), withDeposit.getId(), day, "12:00", PaymentMethod.RAZORPAY);
        dep.put("paymentOption", "DEPOSIT");
        AppointmentResponse a = book(customerToken, dep);
        assertThat(a.payment().option()).isEqualTo(PaymentOption.DEPOSIT);
        assertThat(a.payment().amount()).isEqualTo(300);
        assertThat(a.payment().balanceDue()).isEqualTo(700);

        CreateOrderResponse order = read(mvc.perform(MockMvcRequestBuilders.post("/api/payments/create-order")
                .param("appointmentId", a.id().toString())
                .header("Authorization", "Bearer " + customerToken)), CreateOrderResponse.class);
        assertThat(order.amount()).isEqualTo(300);
        assertThat(order.description()).endsWith("(deposit)");
        mvc.perform(MockMvcRequestBuilders.post("/api/payments/demo/complete").param("appointmentId", a.id().toString())
                .header("Authorization", "Bearer " + customerToken)).andExpect(status().isOk());

        // the provider collects the rest at the venue
        PaymentResponse collected = read(post("/api/provider/appointments/" + a.id() + "/collect",
                auth.token(provider.getUser()), null).andExpect(status().isOk()), PaymentResponse.class);
        assertThat(collected.amount()).isEqualTo(1000);
        assertThat(collected.balanceDue()).isZero();
        post("/api/provider/appointments/" + a.id() + "/collect", auth.token(provider.getUser()), null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Nothing left to collect"));

        // pay-at-venue ignores a requested deposit
        Map<String, Object> venue = bookingBody(provider.getId(), withDeposit.getId(), day, "14:00", PaymentMethod.PAY_AT_VENUE);
        venue.put("paymentOption", "DEPOSIT");
        assertThat(book(customerToken, venue).payment().option()).isEqualTo(PaymentOption.PAY_AT_VENUE);
    }

    // ------------------------------------------------------------------ online consultations

    @Test
    void onlineServiceGetsAMeetingLinkAndMustBePaidOnline() throws Exception {
        DomainService video = data.service(provider, "Video consult", 30, 0, 800, s -> s.setMode(ServiceMode.ONLINE));

        post("/api/appointments", customerToken,
                bookingBody(provider.getId(), video.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Online consultations must be paid online"));
        Map<String, Object> inPerson = bookingBody(provider.getId(), video.getId(), day, "10:00", PaymentMethod.RAZORPAY);
        inPerson.put("mode", "IN_PERSON");
        post("/api/appointments", customerToken, inPerson)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This service is only available online"));

        AppointmentResponse a = book(customerToken,
                bookingBody(provider.getId(), video.getId(), day, "10:00", PaymentMethod.RAZORPAY));
        assertThat(a.mode()).isEqualTo(ServiceMode.ONLINE);
        assertThat(a.meetingLink()).startsWith("https://meet.jit.si/").contains(a.bookingRef());

        String ics = get("/api/appointments/{id}/ics", customerToken, a.id()).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(ics).contains("LOCATION:" + a.meetingLink() + "\r\n");
        assertThat(ics).contains("URL:" + a.meetingLink() + "\r\n");
    }

    @Test
    void serviceModeResolution() throws Exception {
        Map<String, Object> online = body("10:00", PaymentMethod.RAZORPAY);
        online.put("mode", "ONLINE");
        post("/api/appointments", customerToken, online)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This service is only available in person"));

        DomainService both = data.service(provider, "Follow-up", 30, 0, 500, s -> s.setMode(ServiceMode.BOTH));
        AppointmentResponse defaulted = book(customerToken,
                bookingBody(provider.getId(), both.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE));
        assertThat(defaulted.mode()).isEqualTo(ServiceMode.IN_PERSON);
        assertThat(defaulted.meetingLink()).isNull();

        Map<String, Object> remote = bookingBody(provider.getId(), both.getId(), day, "11:00", PaymentMethod.RAZORPAY);
        remote.put("mode", "ONLINE");
        AppointmentResponse onlineBooking = book(customerToken, remote);
        assertThat(onlineBooking.mode()).isEqualTo(ServiceMode.ONLINE);
        assertThat(onlineBooking.meetingLink()).isNotBlank();
    }

    // ------------------------------------------------------------------ unpaid expiry

    @Test
    void unpaidOnlineBookingsExpireAndReleaseTheirSlot() throws Exception {
        data.coupon("WELCOME", DiscountType.PERCENT, 10, c -> { });
        Map<String, Object> req = body("10:00", PaymentMethod.RAZORPAY);
        req.put("couponCode", "WELCOME");
        AppointmentResponse a = book(customerToken, req);
        assertThat(couponUses("WELCOME")).isEqualTo(1);
        assertThat(slotAt(slots(provider.getId(), service.getId(), day, null), "10:00").status())
                .isEqualTo(SlotStatus.BOOKED);

        clock.advance(Duration.ofMinutes(5));
        assertThat(appointmentService.expireUnpaid()).isZero();

        clock.advance(Duration.ofMinutes(6));
        mvc.perform(MockMvcRequestBuilders.post("/api/payments/create-order").param("appointmentId", a.id().toString())
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The payment window has expired and the slot was released. Please book again."));

        schedulerJobs.releaseExpired();

        AppointmentResponse after = getAppointment(a.id(), customerToken);
        assertThat(after.status()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(after.cancelledBy()).isEqualTo(ActorType.SYSTEM);
        assertThat(after.cancelReason()).isEqualTo("Payment not completed in time");
        assertThat(after.paymentStatus()).isEqualTo(PaymentStatus.FAILED);
        assertThat(after.paymentDueAt()).isNull();
        assertThat(after.payment().status()).isEqualTo(PaymentStatus.FAILED);
        assertThat(after.payment().balanceDue()).isZero();
        assertThat(couponUses("WELCOME")).as("the coupon use is given back").isZero();
        assertThat(slotAt(slots(provider.getId(), service.getId(), day, null), "10:00").status())
                .isEqualTo(SlotStatus.AVAILABLE);
        assertThat(audit("APPOINTMENT_CANCELLED")).extracting(AuditLog::getActorRole).containsExactly("SYSTEM");
        assertThat(notificationTitles(customer)).contains("Booking cancelled");

        mvc.perform(MockMvcRequestBuilders.post("/api/payments/demo/complete").param("appointmentId", a.id().toString())
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This booking was cancelled: Payment not completed in time"));
        // someone else can now take the slot
        book(auth.token(data.customer()), body("10:00", PaymentMethod.PAY_AT_VENUE));
        assertThat(appointmentService.expireUnpaid()).isZero();
    }

    @Test
    void payAtVenueBookingsCannotBePaidOnline() throws Exception {
        AppointmentResponse a = book(customerToken, body("10:00", PaymentMethod.PAY_AT_VENUE));

        mvc.perform(MockMvcRequestBuilders.post("/api/payments/create-order").param("appointmentId", a.id().toString())
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This booking is paid at the venue"));
        mvc.perform(MockMvcRequestBuilders.post("/api/payments/create-order").param("appointmentId", "999999")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------ listing

    @Test
    void customerDashboardScopesAndLookupByReference() throws Exception {
        AppointmentResponse upcoming = book(customerToken, body("10:00", PaymentMethod.PAY_AT_VENUE));
        AppointmentResponse cancelled = book(customerToken, body("11:00", PaymentMethod.PAY_AT_VENUE));
        put("/api/appointments/" + cancelled.id() + "/cancel", customerToken, Map.of("reason", "Busy"))
                .andExpect(status().isOk());

        assertThat(ids("upcoming")).containsExactly(upcoming.id());
        assertThat(ids("cancelled")).containsExactly(cancelled.id());
        assertThat(ids("past")).isEmpty();
        assertThat(ids("all")).containsExactlyInAnyOrder(upcoming.id(), cancelled.id());
        assertThat(ids("unknown-scope")).hasSize(2);

        clock.setInstant(Instant.parse("2030-01-09T12:00:00Z"));
        assertThat(ids("upcoming")).isEmpty();
        assertThat(ids("past")).containsExactly(upcoming.id());

        get("/api/appointments/ref/{ref}", customerToken, upcoming.bookingRef())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(upcoming.id()));
        get("/api/appointments/ref/{ref}", customerToken, "BK-000000-XXXXXX").andExpect(status().isNotFound());
        get("/api/appointments/ref/{ref}", auth.token(data.customer()), upcoming.bookingRef()).andExpect(status().isNotFound());
    }

    private List<Long> ids(String scope) throws Exception {
        List<AppointmentResponse> list = read(get("/api/appointments/my?scope=" + scope, customerToken)
                .andExpect(status().isOk()), new TypeReference<>() { });
        return list.stream().map(AppointmentResponse::id).toList();
    }
}
