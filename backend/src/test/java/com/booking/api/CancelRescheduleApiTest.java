package com.booking.api;

import com.booking.dto.response.AppointmentResponse;
import com.booking.dto.response.CancellationPreviewResponse;
import com.booking.dto.response.EarningsResponse;
import com.booking.entity.AuditLog;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.User;
import com.booking.enums.*;
import com.booking.repository.AuditLogRepository;
import com.booking.repository.NotificationRepository;
import com.booking.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Cancellation (policy, refunds, preview, provider rejection) and rescheduling (slot move, limits, cut-off). */
class CancelRescheduleApiTest extends IntegrationTestBase {

    @Autowired private NotificationRepository notificationRepository;
    @Autowired private AuditLogRepository auditLogRepository;

    private Provider provider;
    private DomainService service;
    private User customer;
    private String customerToken;
    private String providerToken;
    private LocalDate day;

    @BeforeEach
    void setUp() {
        provider = data.provider();
        data.openAllWeek(provider, LocalTime.of(9, 0), LocalTime.of(17, 0));
        service = data.service(provider, "Consultation", 30, 0, 1000);
        customer = data.customer();
        customerToken = auth.token(customer);
        providerToken = auth.token(provider.getUser());
        day = inDays(2); // 2030-01-09, bookings at 10:00 start at 2030-01-09T10:00Z
    }

    private AppointmentResponse bookAt(String time, PaymentMethod method) throws Exception {
        return book(customerToken, provider.getId(), service.getId(), day, time, method);
    }

    private AppointmentResponse paidBookingAt(String time) throws Exception {
        AppointmentResponse a = bookAt(time, PaymentMethod.RAZORPAY);
        mvc.perform(MockMvcRequestBuilders.post("/api/payments/demo/complete").param("appointmentId", a.id().toString())
                .header("Authorization", "Bearer " + customerToken)).andExpect(status().isOk());
        return getAppointment(a.id(), customerToken);
    }

    private CancellationPreviewResponse preview(Long id, String token) throws Exception {
        return read(get("/api/appointments/{id}/cancellation-preview", token, id).andExpect(status().isOk()),
                CancellationPreviewResponse.class);
    }

    private List<String> notificationMessages(User user) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(user.getId(), PageRequest.of(0, 100)).stream()
                .map(n -> n.getTitle() + " | " + n.getMessage()).toList();
    }

    private Map<String, Object> reschedule(LocalDate date, String time) {
        return Map.of("date", date.toString(), "startTime", time);
    }

    // ------------------------------------------------------------------ cancellation

    @Test
    void customerCancellationRequiresAReasonAndFreesTheSlot() throws Exception {
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);

        put("/api/appointments/" + a.id() + "/cancel", customerToken, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Please tell us why you are cancelling"));
        put("/api/appointments/" + a.id() + "/cancel", customerToken, Map.of("reason", "   "))
                .andExpect(status().isBadRequest());
        delete("/api/appointments/" + a.id(), customerToken).andExpect(status().isBadRequest());

        AppointmentResponse cancelled = read(put("/api/appointments/" + a.id() + "/cancel", customerToken,
                Map.of("reason", "Feeling better")).andExpect(status().isOk()), AppointmentResponse.class);

        assertThat(cancelled.status()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(cancelled.cancelledBy()).isEqualTo(ActorType.CUSTOMER);
        assertThat(cancelled.cancelReason()).isEqualTo("Feeling better");
        assertThat(cancelled.cancelledAt()).isEqualTo(clock.instant());
        assertThat(cancelled.paymentStatus()).isEqualTo(PaymentStatus.FAILED); // nothing was paid
        assertThat(cancelled.actions().canCancel()).isFalse();
        assertThat(slotAt(slots(provider.getId(), service.getId(), day, null), "10:00").status())
                .isEqualTo(SlotStatus.AVAILABLE);
        assertThat(notificationMessages(provider.getUser()))
                .anyMatch(m -> m.startsWith("Booking cancelled " + a.bookingRef()) && m.contains("Reason: Feeling better"));

        put("/api/appointments/" + a.id() + "/cancel", customerToken, Map.of("reason", "Again"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Only upcoming bookings can be cancelled"));
    }

    @Test
    void cancelViaDeleteWithReasonParameter() throws Exception {
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);

        mvc.perform(MockMvcRequestBuilders.delete("/api/appointments/" + a.id()).param("reason", "Travelling")
                        .header("Authorization", "Bearer " + customerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.cancelReason").value("Travelling"));
    }

    @Test
    void freeCancellationRefundsTheFullOnlinePayment() throws Exception {
        AppointmentResponse a = paidBookingAt("10:00");

        CancellationPreviewResponse p = preview(a.id(), customerToken);
        assertThat(p.allowed()).isTrue();
        assertThat(p.refundPercent()).isEqualTo(100);
        assertThat(p.paidAmount()).isEqualTo(1000);
        assertThat(p.refundAmount()).isEqualTo(1000);
        assertThat(p.cutoffHours()).isEqualTo(24);
        assertThat(p.cutoffAt()).isEqualTo(Instant.parse("2030-01-08T10:00:00Z"));
        assertThat(p.message()).startsWith("Free cancellation");

        AppointmentResponse cancelled = read(put("/api/appointments/" + a.id() + "/cancel", customerToken,
                Map.of("reason", "Plans changed")).andExpect(status().isOk()), AppointmentResponse.class);

        assertThat(cancelled.paymentStatus()).isEqualTo(PaymentStatus.REFUNDED);
        assertThat(cancelled.payment().status()).isEqualTo(PaymentStatus.REFUNDED);
        assertThat(cancelled.payment().refundAmount()).isEqualTo(1000);
        assertThat(cancelled.payment().refundId()).startsWith("rfnd_demo_");
        assertThat(cancelled.payment().refundedAt()).isNotNull();
        assertThat(notificationMessages(customer)).anyMatch(m -> m.contains("A refund of 1000.00 has been initiated."));
        assertThat(auditLogRepository.findAll()).extracting(AuditLog::getAction).contains("PAYMENT_REFUNDED");

        // nothing more to refund afterwards
        CancellationPreviewResponse after = preview(a.id(), customerToken);
        assertThat(after.allowed()).isFalse();
        assertThat(after.paidAmount()).isZero();
    }

    @Test
    void lateCancellationRefundsThePolicyPercentage() throws Exception {
        AppointmentResponse a = paidBookingAt("10:00");
        clock.setInstant(Instant.parse("2030-01-09T08:00:00Z")); // 2 hours before the start

        CancellationPreviewResponse p = preview(a.id(), customerToken);
        assertThat(p.allowed()).isTrue();
        assertThat(p.refundPercent()).isEqualTo(50);
        assertThat(p.refundAmount()).isEqualTo(500);
        assertThat(p.message()).isEqualTo("Late cancellation (within 24h of the start) - 50% refund of any online payment");

        AppointmentResponse cancelled = read(put("/api/appointments/" + a.id() + "/cancel", customerToken,
                Map.of("reason", "Stuck in traffic")).andExpect(status().isOk()), AppointmentResponse.class);
        assertThat(cancelled.paymentStatus()).isEqualTo(PaymentStatus.PARTIALLY_REFUNDED);
        assertThat(cancelled.payment().refundAmount()).isEqualTo(500);

        EarningsResponse earnings = read(get("/api/provider/earnings", providerToken).andExpect(status().isOk()),
                EarningsResponse.class);
        assertThat(earnings.onlineCollected()).isEqualTo(1000);
        assertThat(earnings.refunded()).isEqualTo(500);
        assertThat(earnings.totalCollected()).isEqualTo(500);
        assertThat(earnings.payments()).hasSize(1);
    }

    @Test
    void cancellationPolicyUsesTheProvidersSettings() throws Exception {
        data.updateProvider(provider.getId(), p -> { p.setCancellationCutoffHours(48); p.setLateCancelRefundPercent(0); });
        AppointmentResponse a = paidBookingAt("10:00"); // 48h minus 0 -> exactly at the cut-off: late

        CancellationPreviewResponse p = preview(a.id(), customerToken);
        assertThat(p.refundPercent()).isZero();
        assertThat(p.refundAmount()).isZero();
        assertThat(p.cutoffHours()).isEqualTo(48);

        AppointmentResponse cancelled = read(put("/api/appointments/" + a.id() + "/cancel", customerToken,
                Map.of("reason", "No longer needed")).andExpect(status().isOk()), AppointmentResponse.class);
        assertThat(cancelled.paymentStatus()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(cancelled.payment().refundAmount()).isZero();
    }

    @Test
    void cancellationAfterTheStartIsRefused() throws Exception {
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);
        clock.setInstant(Instant.parse("2030-01-09T10:05:00Z"));

        CancellationPreviewResponse p = preview(a.id(), customerToken);
        assertThat(p.allowed()).isFalse();
        assertThat(p.message()).isEqualTo("The appointment has already started");
        put("/api/appointments/" + a.id() + "/cancel", customerToken, Map.of("reason", "Late"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The appointment has already started"));
    }

    @Test
    void providerRejectionAlwaysRefundsInFull() throws Exception {
        data.updateProvider(provider.getId(), p -> p.setAutoConfirm(false));
        AppointmentResponse a = paidBookingAt("10:00");
        assertThat(a.status()).isEqualTo(AppointmentStatus.PENDING);
        assertThat(a.paymentStatus()).isEqualTo(PaymentStatus.SUCCESS);
        clock.setInstant(Instant.parse("2030-01-09T08:00:00Z")); // inside the customer's late window

        put("/api/appointments/" + a.id() + "/status", providerToken, Map.of("status", "CANCELLED"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("A reason is required when rejecting or cancelling"));
        CancellationPreviewResponse p = preview(a.id(), providerToken);
        assertThat(p.refundPercent()).isEqualTo(100);

        AppointmentResponse rejected = read(put("/api/appointments/" + a.id() + "/status", providerToken,
                Map.of("status", "CANCELLED", "reason", "Doctor unavailable")).andExpect(status().isOk()),
                AppointmentResponse.class);

        assertThat(rejected.status()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(rejected.cancelledBy()).isEqualTo(ActorType.PROVIDER);
        assertThat(rejected.cancelReason()).isEqualTo("Doctor unavailable");
        assertThat(rejected.paymentStatus()).isEqualTo(PaymentStatus.REFUNDED);
        assertThat(rejected.payment().refundAmount()).isEqualTo(1000);
        assertThat(notificationMessages(customer)).anyMatch(m -> m.startsWith("Booking cancelled")
                && m.contains("was cancelled by " + provider.getBusinessName()) && m.contains("Reason: Doctor unavailable"));

        put("/api/appointments/" + a.id() + "/status", providerToken, Map.of("status", "CANCELLED", "reason", "x"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Only upcoming bookings can be rejected or cancelled"));
    }

    @Test
    void adminCanCancelAnyBookingWithAFullRefund() throws Exception {
        AppointmentResponse a = paidBookingAt("10:00");
        clock.setInstant(Instant.parse("2030-01-09T09:00:00Z"));

        AppointmentResponse res = read(put("/api/appointments/" + a.id() + "/cancel", auth.token(data.admin()), null)
                .andExpect(status().isOk()), AppointmentResponse.class);

        assertThat(res.status()).isEqualTo(AppointmentStatus.CANCELLED);
        assertThat(res.cancelledBy()).isEqualTo(ActorType.ADMIN);
        assertThat(res.payment().refundAmount()).isEqualTo(1000);
    }

    // ------------------------------------------------------------------ reschedule

    @Test
    void rescheduleMovesTheBookingAndFreesTheOldSlot() throws Exception {
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);

        AppointmentResponse moved = read(patch("/api/appointments/" + a.id() + "/reschedule", customerToken,
                Map.of("date", day.toString(), "startTime", "11:00", "reason", "Clash")).andExpect(status().isOk()),
                AppointmentResponse.class);

        assertThat(moved.startTime()).isEqualTo(LocalTime.of(11, 0));
        assertThat(moved.endTime()).isEqualTo(LocalTime.of(11, 30));
        assertThat(moved.startAt()).isEqualTo(Instant.parse("2030-01-09T11:00:00Z"));
        assertThat(moved.rescheduleCount()).isEqualTo(1);
        assertThat(moved.status()).isEqualTo(AppointmentStatus.RESCHEDULED);
        assertThat(moved.bookingRef()).isEqualTo(a.bookingRef());

        var slots = slots(provider.getId(), service.getId(), day, null);
        assertThat(slotAt(slots, "10:00").status()).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(slotAt(slots, "11:00").status()).isEqualTo(SlotStatus.BOOKED);
        assertThat(notificationMessages(customer)).anyMatch(m -> m.startsWith("Booking rescheduled"));
        assertThat(notificationMessages(provider.getUser())).anyMatch(m -> m.startsWith("Booking rescheduled " + a.bookingRef()));
        assertThat(auditLogRepository.findAll()).filteredOn(l -> l.getAction().equals("APPOINTMENT_RESCHEDULED"))
                .singleElement().extracting(AuditLog::getDetails).asString().endsWith("by CUSTOMER: Clash");

        // the old slot can be booked by someone else now
        book(auth.token(data.customer()), provider.getId(), service.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE);

        // PUT on the appointment itself is an alias
        AppointmentResponse again = read(put("/api/appointments/" + a.id(), customerToken,
                reschedule(day.plusDays(1), "09:00")).andExpect(status().isOk()), AppointmentResponse.class);
        assertThat(again.date()).isEqualTo(day.plusDays(1));
        assertThat(again.rescheduleCount()).isEqualTo(2);
    }

    @Test
    void rescheduleRejectsSameTakenAndInvalidTimes() throws Exception {
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);
        book(auth.token(data.customer()), provider.getId(), service.getId(), day, "12:00", PaymentMethod.PAY_AT_VENUE);

        patch("/api/appointments/" + a.id() + "/reschedule", customerToken, reschedule(day, "10:00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Pick a different time"));
        patch("/api/appointments/" + a.id() + "/reschedule", customerToken, reschedule(day, "12:00"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("The requested time is not available"));
        patch("/api/appointments/" + a.id() + "/reschedule", customerToken, reschedule(inDays(-1), "12:00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Cannot book a date in the past"));
        patch("/api/appointments/" + a.id() + "/reschedule", customerToken, Map.of("date", day.toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.startTime").exists());
        assertThat(getAppointment(a.id(), customerToken).rescheduleCount()).isZero();
    }

    @Test
    void rescheduleLimitIsEnforcedForCustomersButNotProviders() throws Exception {
        data.updateProvider(provider.getId(), p -> p.setMaxReschedules(1));
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);

        patch("/api/appointments/" + a.id() + "/reschedule", customerToken, reschedule(day, "11:00"))
                .andExpect(status().isOk());
        patch("/api/appointments/" + a.id() + "/reschedule", customerToken, reschedule(day, "12:00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This booking was already rescheduled 1 time(s), the maximum allowed"));
        assertThat(getAppointment(a.id(), customerToken).actions().canReschedule()).isFalse();

        AppointmentResponse byProvider = read(patch("/api/appointments/" + a.id() + "/reschedule", providerToken,
                reschedule(day, "12:00")).andExpect(status().isOk()), AppointmentResponse.class);
        assertThat(byProvider.startTime()).isEqualTo(LocalTime.of(12, 0));
        assertThat(byProvider.rescheduleCount()).as("business reschedules are not counted").isEqualTo(1);

        data.updateProvider(provider.getId(), p -> p.setMaxReschedules(0));
        patch("/api/appointments/" + a.id() + "/reschedule", customerToken, reschedule(day, "13:00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This provider does not allow rescheduling"));
    }

    @Test
    void rescheduleCutoffAndStartAreEnforced() throws Exception {
        AppointmentResponse a = bookAt("14:00", PaymentMethod.PAY_AT_VENUE);
        clock.setInstant(Instant.parse("2030-01-09T08:00:00Z")); // 6 hours before

        patch("/api/appointments/" + a.id() + "/reschedule", customerToken, reschedule(day, "15:00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Rescheduling closes 12 hours before the appointment"));
        patch("/api/appointments/" + a.id() + "/reschedule", auth.token(data.admin()), reschedule(day, "15:00"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Admins cannot reschedule on behalf of users"));
        patch("/api/appointments/" + a.id() + "/reschedule", providerToken, reschedule(day, "15:00"))
                .andExpect(status().isOk());

        clock.setInstant(Instant.parse("2030-01-09T15:10:00Z"));
        patch("/api/appointments/" + a.id() + "/reschedule", providerToken, reschedule(day, "16:00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The appointment has already started"));
    }

    @Test
    void reschedulingAPendingBookingKeepsItPendingAndCancelledOnesCannotMove() throws Exception {
        data.updateProvider(provider.getId(), p -> p.setAutoConfirm(false));
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);

        AppointmentResponse moved = read(patch("/api/appointments/" + a.id() + "/reschedule", customerToken,
                reschedule(day, "11:00")).andExpect(status().isOk()), AppointmentResponse.class);
        assertThat(moved.status()).isEqualTo(AppointmentStatus.PENDING);

        put("/api/appointments/" + a.id() + "/cancel", customerToken, Map.of("reason", "No")).andExpect(status().isOk());
        patch("/api/appointments/" + a.id() + "/reschedule", customerToken, reschedule(day, "12:00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Only upcoming bookings can be rescheduled"));
    }
}
