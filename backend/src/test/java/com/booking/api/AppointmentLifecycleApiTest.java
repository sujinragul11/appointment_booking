package com.booking.api;

import com.booking.dto.response.AppointmentResponse;
import com.booking.dto.response.PageResponse;
import com.booking.dto.response.ProviderResponse;
import com.booking.dto.response.ReviewResponse;
import com.booking.dto.response.StaffResponse;
import com.booking.entity.AuditLog;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.Staff;
import com.booking.entity.User;
import com.booking.enums.*;
import com.booking.repository.AuditLogRepository;
import com.booking.repository.NotificationRepository;
import com.booking.support.IntegrationTestBase;
import com.booking.support.TestDataFactory;
import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Status transitions, notes, reviews, access control, staff visibility and document downloads. */
class AppointmentLifecycleApiTest extends IntegrationTestBase {

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
        day = inDays(2);
    }

    private AppointmentResponse bookAt(String time, PaymentMethod method) throws Exception {
        return book(customerToken, provider.getId(), service.getId(), day, time, method);
    }

    private org.springframework.test.web.servlet.ResultActions setStatus(Long id, String token, String status) throws Exception {
        return put("/api/appointments/" + id + "/status", token, Map.of("status", status));
    }

    private List<String> titles(User user) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(user.getId(), PageRequest.of(0, 100)).stream()
                .map(n -> n.getTitle()).toList();
    }

    // ------------------------------------------------------------------ status transitions

    @Test
    void providerConfirmsPendingBookingsOnly() throws Exception {
        data.updateProvider(provider.getId(), p -> p.setAutoConfirm(false));
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);

        setStatus(a.id(), customerToken, "CONFIRMED")
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Only the provider or assigned staff can change the status"));
        setStatus(a.id(), auth.token(data.admin()), "CONFIRMED").andExpect(status().isForbidden());

        AppointmentResponse confirmed = read(setStatus(a.id(), providerToken, "CONFIRMED").andExpect(status().isOk()),
                AppointmentResponse.class);
        assertThat(confirmed.status()).isEqualTo(AppointmentStatus.CONFIRMED);
        assertThat(titles(customer)).contains("Booking confirmed");
        assertThat(auditLogRepository.findAll()).extracting(AuditLog::getAction).contains("APPOINTMENT_CONFIRMED");

        setStatus(a.id(), providerToken, "CONFIRMED")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Only pending bookings can be confirmed"));
        setStatus(a.id(), providerToken, "RESCHEDULED")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Unsupported status change: RESCHEDULED"));
        put("/api/appointments/" + a.id() + "/status", providerToken, Map.of("status", "BOGUS"))
                .andExpect(status().isBadRequest());

        AppointmentResponse unpaid = bookAt("11:00", PaymentMethod.RAZORPAY);
        setStatus(unpaid.id(), providerToken, "CONFIRMED")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Waiting for the customer's online payment"));
    }

    @Test
    void completedAndNoShowCanOnlyBeRecordedAfterTheStart() throws Exception {
        AppointmentResponse first = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);
        AppointmentResponse second = bookAt("11:00", PaymentMethod.PAY_AT_VENUE);

        setStatus(first.id(), providerToken, "COMPLETED")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This can be recorded once the appointment time has started"));
        assertThat(getAppointment(first.id(), providerToken).actions().canComplete()).isFalse();

        clock.setInstant(Instant.parse("2030-01-09T10:05:00Z"));
        AppointmentResponse providerView = getAppointment(first.id(), providerToken);
        assertThat(providerView.actions().canComplete()).isTrue();
        assertThat(providerView.actions().canMarkNoShow()).isTrue();
        AppointmentResponse completed = read(setStatus(first.id(), providerToken, "COMPLETED").andExpect(status().isOk()),
                AppointmentResponse.class);
        assertThat(completed.status()).isEqualTo(AppointmentStatus.COMPLETED);
        assertThat(completed.actions().canAddNotes()).isTrue();
        assertThat(titles(customer)).contains("Thanks for visiting!");

        clock.setInstant(Instant.parse("2030-01-09T11:10:00Z"));
        AppointmentResponse noShow = read(setStatus(second.id(), providerToken, "NO_SHOW").andExpect(status().isOk()),
                AppointmentResponse.class);
        assertThat(noShow.status()).isEqualTo(AppointmentStatus.NO_SHOW);
        assertThat(titles(customer)).contains("Missed appointment");

        setStatus(first.id(), providerToken, "NO_SHOW")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Only confirmed bookings can be completed or marked no-show"));
        put("/api/appointments/" + first.id() + "/status", providerToken, Map.of("status", "CANCELLED", "reason", "x"))
                .andExpect(status().isBadRequest());

        // completed/no-show bookings no longer block the calendar
        List<AppointmentResponse> past = read(get("/api/appointments/my?scope=past", customerToken), new TypeReference<>() { });
        assertThat(past).extracting(AppointmentResponse::id).containsExactlyInAnyOrder(first.id(), second.id());
    }

    @Test
    void providerNotesOnlyAfterCompletionThenCustomerCanReviewOnce() throws Exception {
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);
        Map<String, String> notes = Map.of("providerNotes", "Drink water, rest for two days");

        put("/api/appointments/" + a.id() + "/notes", providerToken, notes)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Notes / prescriptions can be added after the appointment is completed"));
        post("/api/reviews", customerToken, Map.of("appointmentId", a.id(), "rating", 5))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("You can review an appointment once it is completed"));

        clock.setInstant(Instant.parse("2030-01-09T10:30:00Z"));
        setStatus(a.id(), providerToken, "COMPLETED").andExpect(status().isOk());

        put("/api/appointments/" + a.id() + "/notes", customerToken, notes)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Only the provider or assigned staff can add notes"));
        put("/api/appointments/" + a.id() + "/notes", providerToken, Map.of("providerNotes", ""))
                .andExpect(status().isBadRequest());
        put("/api/appointments/" + a.id() + "/notes", providerToken, notes)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.providerNotes").value("Drink water, rest for two days"));
        assertThat(titles(customer)).contains("Notes from your appointment");

        AppointmentResponse customerView = getAppointment(a.id(), customerToken);
        assertThat(customerView.providerNotes()).isEqualTo("Drink water, rest for two days");
        assertThat(customerView.actions().canReview()).isTrue();
        assertThat(customerView.reviewed()).isFalse();

        ReviewResponse review = read(post("/api/reviews", customerToken, Map.of("appointmentId", a.id(), "rating", 4))
                .andExpect(status().isOk()), ReviewResponse.class);
        assertThat(review.status()).isEqualTo(ReviewStatus.APPROVED);
        assertThat(review.rating()).isEqualTo(4);

        AppointmentResponse reviewed = getAppointment(a.id(), customerToken);
        assertThat(reviewed.reviewed()).isTrue();
        assertThat(reviewed.actions().canReview()).isFalse();
        ProviderResponse profile = read(get("/api/providers/{id}", null, provider.getId()).andExpect(status().isOk()),
                ProviderResponse.class);
        assertThat(profile.rating()).isEqualTo(4.0);
        assertThat(profile.reviewCount()).isEqualTo(1);

        post("/api/reviews", customerToken, Map.of("appointmentId", a.id(), "rating", 5))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("You already reviewed this appointment"));
        post("/api/reviews", auth.token(data.customer()), Map.of("appointmentId", a.id(), "rating", 5))
                .andExpect(status().isNotFound());
        post("/api/reviews", providerToken, Map.of("appointmentId", a.id(), "rating", 5))
                .andExpect(status().isForbidden());
        post("/api/reviews", customerToken, Map.of("appointmentId", a.id(), "rating", 9))
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------ access control

    @Test
    void appointmentsAreOnlyVisibleToTheirParticipants() throws Exception {
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);
        String stranger = auth.token(data.customer());
        Provider otherBusiness = data.provider();
        String otherProvider = auth.token(otherBusiness.getUser());

        for (String token : List.of(stranger, otherProvider)) {
            get("/api/appointments/{id}", token, a.id())
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.message").value("Appointment not found"));
            get("/api/appointments/{id}/cancellation-preview", token, a.id()).andExpect(status().isNotFound());
            get("/api/appointments/{id}/ics", token, a.id()).andExpect(status().isNotFound());
            get("/api/appointments/{id}/invoice", token, a.id()).andExpect(status().isNotFound());
            put("/api/appointments/" + a.id() + "/cancel", token, Map.of("reason", "hijack")).andExpect(status().isNotFound());
            patch("/api/appointments/" + a.id() + "/reschedule", token, Map.of("date", day.toString(), "startTime", "11:00"))
                    .andExpect(status().isNotFound());
            put("/api/appointments/" + a.id() + "/status", token, Map.of("status", "CONFIRMED")).andExpect(status().isNotFound());
        }
        get("/api/appointments/{id}", null, a.id()).andExpect(status().isUnauthorized());
        get("/api/appointments/{id}", customerToken, 987_654).andExpect(status().isNotFound());

        AppointmentResponse adminView = getAppointment(a.id(), auth.token(data.admin()));
        assertThat(adminView.customerEmail()).isEqualTo(customer.getEmail());
        assertThat(adminView.actions().canCancel()).isTrue();
        assertThat(adminView.actions().canReschedule()).isFalse();
        assertThat(getAppointment(a.id(), customerToken).id()).isEqualTo(a.id());
    }

    @Test
    void staffMembersOnlySeeAndManageTheirOwnAppointments() throws Exception {
        User aliceLogin = data.user("Alice", TestDataFactory.uniqueEmail("alice"), UserRole.STAFF, true, null);
        User bobLogin = data.user("Bob", TestDataFactory.uniqueEmail("bob"), UserRole.STAFF, true, null);
        Staff alice = data.staff(provider, "Alice", aliceLogin);
        Staff bob = data.staff(provider, "Bob", bobLogin);
        DomainService cut = data.service(provider, "Haircut", 30, 0, 400);
        data.assignStaff(cut, alice, bob);

        Map<String, Object> forAlice = bookingBody(provider.getId(), cut.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE);
        forAlice.put("staffId", alice.getId());
        AppointmentResponse aliceAppt = book(customerToken, forAlice);
        Map<String, Object> forBob = bookingBody(provider.getId(), cut.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE);
        forBob.put("staffId", bob.getId());
        AppointmentResponse bobAppt = book(auth.token(data.customer()), forBob);

        String aliceToken = auth.token(aliceLogin);
        List<AppointmentResponse> mine = read(get("/api/staff-portal/appointments?scope=all", aliceToken)
                .andExpect(status().isOk()), new TypeReference<>() { });
        assertThat(mine).extracting(AppointmentResponse::id).containsExactly(aliceAppt.id());
        List<AppointmentResponse> upcoming = read(get("/api/staff-portal/appointments", aliceToken), new TypeReference<>() { });
        assertThat(upcoming).extracting(AppointmentResponse::id).containsExactly(aliceAppt.id());
        assertThat(upcoming.get(0).customerEmail()).isEqualTo(customer.getEmail());

        StaffResponse me = read(get("/api/staff-portal/me", aliceToken).andExpect(status().isOk()), StaffResponse.class);
        assertThat(me.name()).isEqualTo("Alice");
        assertThat(me.serviceIds()).containsExactly(cut.getId());
        assertThat(me.loginEmail()).isEqualTo(aliceLogin.getEmail());

        get("/api/appointments/{id}", aliceToken, bobAppt.id()).andExpect(status().isNotFound());
        get("/api/appointments/{id}", aliceToken, aliceAppt.id()).andExpect(status().isOk());
        get("/api/provider/me", aliceToken).andExpect(status().isForbidden());
        get("/api/staff-portal/me", customerToken).andExpect(status().isForbidden());
        assertThat(titles(aliceLogin)).contains("New booking " + aliceAppt.bookingRef());
        assertThat(titles(bobLogin)).doesNotContain("New booking " + aliceAppt.bookingRef());

        // assigned staff can record the outcome
        clock.setInstant(Instant.parse("2030-01-09T10:15:00Z"));
        setStatus(aliceAppt.id(), aliceToken, "COMPLETED").andExpect(status().isOk());
        setStatus(bobAppt.id(), aliceToken, "COMPLETED").andExpect(status().isNotFound());
        put("/api/appointments/" + aliceAppt.id() + "/notes", aliceToken, Map.of("providerNotes", "Trim done"))
                .andExpect(status().isOk());

        // the provider can filter the calendar by staff member
        PageResponse<AppointmentResponse> byStaff = read(get("/api/provider/appointments?staffId=" + bob.getId(), providerToken)
                .andExpect(status().isOk()), new TypeReference<>() { });
        assertThat(byStaff.content()).extracting(AppointmentResponse::id).containsExactly(bobAppt.id());

        // a deactivated staff profile loses access to the portal
        delete("/api/provider/staff/" + alice.getId(), providerToken).andExpect(status().isNoContent());
        get("/api/staff-portal/appointments", aliceToken).andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------ documents

    @Test
    void calendarInviteHasTheRightContentTypeAndEscapedValues() throws Exception {
        data.updateProvider(provider.getId(), p -> { p.setAddress("12, Main Road; Block C"); p.setCity("Chennai"); });
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);

        MvcResult res = get("/api/appointments/{id}/ics", customerToken, a.id())
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=appointment-" + a.id() + ".ics"))
                .andReturn();
        assertThat(res.getResponse().getContentType()).startsWith("text/calendar");
        String ics = res.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(ics).startsWith("BEGIN:VCALENDAR\r\n").endsWith("END:VCALENDAR\r\n");
        assertThat(ics).contains("DTSTART:20300109T100000Z\r\n", "DTEND:20300109T103000Z\r\n",
                "SUMMARY:Consultation - " + provider.getBusinessName() + "\r\n",
                "LOCATION:12\\, Main Road\\; Block C\\, Chennai\r\n",
                "DESCRIPTION:Booking " + a.bookingRef() + "\r\n");
        assertThat(ics).doesNotContain("URL:");
    }

    @Test
    void invoiceIsAvailableOnceSomethingWasPaid() throws Exception {
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);

        get("/api/appointments/{id}/invoice", customerToken, a.id())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("An invoice is available once a payment has been received"));

        post("/api/provider/appointments/" + a.id() + "/collect", providerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUCCESS"))
                .andExpect(jsonPath("$.amount").value(1000.0))
                .andExpect(jsonPath("$.transactionId").value(org.hamcrest.Matchers.startsWith("venue_")));

        MvcResult pdf = get("/api/appointments/{id}/invoice", customerToken, a.id())
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=invoice-" + a.bookingRef() + ".pdf"))
                .andReturn();
        assertThat(pdf.getResponse().getContentType()).isEqualTo("application/pdf");
        byte[] body = pdf.getResponse().getContentAsByteArray();
        assertThat(new String(body, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
        // the provider can download it too
        get("/api/appointments/{id}/invoice", providerToken, a.id()).andExpect(status().isOk());
    }

    @Test
    void cancelledBookingsCannotBeCollected() throws Exception {
        AppointmentResponse a = bookAt("10:00", PaymentMethod.PAY_AT_VENUE);
        put("/api/appointments/" + a.id() + "/cancel", customerToken, Map.of("reason", "Sick")).andExpect(status().isOk());

        post("/api/provider/appointments/" + a.id() + "/collect", providerToken, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Appointment is cancelled"));
        post("/api/provider/appointments/" + a.id() + "/collect", auth.token(data.provider().getUser()), null)
                .andExpect(status().isNotFound());
    }
}
