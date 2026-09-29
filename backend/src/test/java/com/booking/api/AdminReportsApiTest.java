package com.booking.api;

import com.booking.dto.response.AppointmentResponse;
import com.booking.dto.response.PageResponse;
import com.booking.dto.response.ReportResponse;
import com.booking.dto.response.ReviewResponse;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.User;
import com.booking.enums.PaymentMethod;
import com.booking.enums.ReviewStatus;
import com.booking.enums.UserRole;
import com.booking.repository.NotificationRepository;
import com.booking.support.IntegrationTestBase;
import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Admin appointment search / exports, booking reports and review moderation. */
class AdminReportsApiTest extends IntegrationTestBase {

    private static final LocalDate WED = LocalDate.of(2030, 1, 9);
    private static final LocalDate THU = LocalDate.of(2030, 1, 10);

    @Autowired private NotificationRepository notificationRepository;

    private String adminToken;
    private Provider alpha;
    private Provider beta;
    private DomainService consultation;
    private DomainService therapy;
    private DomainService checkup;
    private User carla;
    private User dev;
    private String carlaToken;
    private String devToken;

    @BeforeEach
    void setUp() {
        adminToken = auth.token(data.admin());
        alpha = data.provider("Alpha Health", "UTC");
        beta = data.provider("Beta Wellness", "UTC");
        data.openAllWeek(alpha, LocalTime.of(9, 0), LocalTime.of(17, 0));
        data.openAllWeek(beta, LocalTime.of(9, 0), LocalTime.of(17, 0));
        consultation = data.service(alpha, "Consultation", 30, 0, 1000);
        therapy = data.service(alpha, "Therapy", 60, 0, 2000);
        checkup = data.service(beta, "Checkup", 30, 0, 500);
        carla = data.user("Carla Report", "carla@example.test", UserRole.CUSTOMER, true, "+919800000001");
        dev = data.user("Dev Patel", "dev@example.test", UserRole.CUSTOMER, true, "+919800000002");
        carlaToken = auth.token(carla);
        devToken = auth.token(dev);
    }

    /** A1 Wed 10:00 (confirmed), A2 Wed 11:00 (paid 2000), A3 Thu 14:00 (cancelled), A4 Thu 10:00 at Beta. */
    private List<AppointmentResponse> seedBookings() throws Exception {
        AppointmentResponse a1 = book(carlaToken, alpha.getId(), consultation.getId(), WED, "10:00", PaymentMethod.PAY_AT_VENUE);
        AppointmentResponse a2 = book(carlaToken, alpha.getId(), therapy.getId(), WED, "11:00", PaymentMethod.RAZORPAY);
        mvc.perform(MockMvcRequestBuilders.post("/api/payments/demo/complete").param("appointmentId", a2.id().toString())
                .header("Authorization", "Bearer " + carlaToken)).andExpect(status().isOk());
        AppointmentResponse a3 = book(devToken, alpha.getId(), consultation.getId(), THU, "14:00", PaymentMethod.PAY_AT_VENUE);
        put("/api/appointments/" + a3.id() + "/cancel", devToken, Map.of("reason", "Exam")).andExpect(status().isOk());
        AppointmentResponse a4 = book(devToken, beta.getId(), checkup.getId(), THU, "10:00", PaymentMethod.PAY_AT_VENUE);
        return List.of(a1, a2, a3, a4);
    }

    private PageResponse<AppointmentResponse> search(String query) throws Exception {
        return read(get("/api/admin/appointments" + query, adminToken).andExpect(status().isOk()), new TypeReference<>() { });
    }

    private List<Long> ids(PageResponse<AppointmentResponse> page) {
        return page.content().stream().map(AppointmentResponse::id).toList();
    }

    // ------------------------------------------------------------------ appointments

    @Test
    void appointmentsCanBeSearchedWithFilters() throws Exception {
        List<AppointmentResponse> a = seedBookings();
        Long a1 = a.get(0).id(), a2 = a.get(1).id(), a3 = a.get(2).id(), a4 = a.get(3).id();

        PageResponse<AppointmentResponse> all = search("");
        assertThat(all.totalElements()).isEqualTo(4);
        assertThat(ids(all)).as("newest date first, then latest time").containsExactly(a3, a4, a2, a1);
        assertThat(ids(search("?providerId=" + alpha.getId()))).containsExactlyInAnyOrder(a1, a2, a3);
        assertThat(ids(search("?status=CANCELLED"))).containsExactly(a3);
        assertThat(ids(search("?q=CARLA"))).containsExactlyInAnyOrder(a1, a2);
        assertThat(ids(search("?q=" + a.get(3).bookingRef().toLowerCase()))).containsExactly(a4);
        assertThat(ids(search("?q=therapy"))).containsExactly(a2);
        assertThat(ids(search("?q=beta wellness"))).containsExactly(a4);
        assertThat(ids(search("?q=dev@example"))).containsExactlyInAnyOrder(a3, a4);
        assertThat(ids(search("?from=" + THU + "&to=" + THU))).containsExactlyInAnyOrder(a3, a4);
        assertThat(ids(search("?customerId=" + dev.getId()))).containsExactlyInAnyOrder(a3, a4);
        PageResponse<AppointmentResponse> page = search("?page=1&size=3");
        assertThat(page.content()).hasSize(1);
        assertThat(page.totalPages()).isEqualTo(2);
        assertThat(page.content().get(0).actions().canReschedule()).isFalse();
    }

    @Test
    void appointmentsCanBeExportedAsCsvAndPdf() throws Exception {
        List<AppointmentResponse> a = seedBookings();

        MvcResult csv = get("/api/admin/appointments/export?format=csv", adminToken).andExpect(status().isOk()).andReturn();
        assertThat(csv.getResponse().getContentType()).startsWith("text/csv");
        assertThat(csv.getResponse().getHeader("Content-Disposition")).startsWith("attachment; filename=appointments-").endsWith(".csv");
        String body = csv.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).startsWith("﻿Booking ref,Date,Start,End,Timezone,Status,Customer,Customer e-mail,Provider,"
                + "Service,Staff,Mode,Amount,Discount,Final,Payment,Paid,Refunded,Cancelled by,Cancel reason,Created\r\n");
        assertThat(body.split("\r\n")).hasSize(5);
        a.forEach(x -> assertThat(body).contains(x.bookingRef()));
        assertThat(body).contains(a.get(2).bookingRef() + "," + THU + ",14:00,14:30,UTC,CANCELLED,Dev Patel,dev@example.test");
        assertThat(body).contains(",CUSTOMER,Exam,");

        String cancelledOnly = get("/api/admin/appointments/export?status=CANCELLED&from=" + WED + "&to=" + THU + "&q=dev",
                adminToken).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(cancelledOnly.split("\r\n")).hasSize(2);
        assertThat(cancelledOnly).contains(a.get(2).bookingRef());

        MvcResult pdf = get("/api/admin/appointments/export?format=pdf&providerId=" + alpha.getId(), adminToken)
                .andExpect(status().isOk()).andReturn();
        assertThat(pdf.getResponse().getContentType()).startsWith("application/pdf");
        assertThat(new String(pdf.getResponse().getContentAsByteArray(), 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
        get("/api/admin/appointments/export?format=doc", adminToken).andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------ reports

    @Test
    void bookingReportTotalsAndBreakdowns() throws Exception {
        seedBookings();

        ReportResponse r = read(get("/api/admin/reports/bookings?from=2030-01-07&to=2030-01-13", adminToken)
                .andExpect(status().isOk()), ReportResponse.class);

        assertThat(r.from()).isEqualTo(LocalDate.of(2030, 1, 7));
        assertThat(r.to()).isEqualTo(LocalDate.of(2030, 1, 13));
        ReportResponse.Totals t = r.totals();
        assertThat(t.bookings()).isEqualTo(4);
        assertThat(t.completed()).isZero();
        assertThat(t.cancelled()).isEqualTo(1);
        assertThat(t.noShows()).isZero();
        assertThat(t.upcoming()).isEqualTo(3);
        assertThat(t.revenue()).isEqualTo(2000);
        assertThat(t.refunds()).isZero();
        assertThat(t.cancellationRate()).isEqualTo(25.0);
        assertThat(t.noShowRate()).isZero();
        assertThat(t.averageBookingValue()).isEqualTo(1166.67);

        assertThat(r.byDay()).hasSize(7);
        assertThat(r.byDay()).filteredOn(d -> d.date().equals(WED)).singleElement()
                .satisfies(d -> { assertThat(d.bookings()).isEqualTo(2); assertThat(d.revenue()).isEqualTo(2000); });
        assertThat(r.byDay()).filteredOn(d -> d.date().equals(THU)).singleElement()
                .satisfies(d -> { assertThat(d.bookings()).isEqualTo(2); assertThat(d.cancellations()).isEqualTo(1); });
        assertThat(r.byHour()).extracting(h -> h.hour() + "=" + h.bookings()).containsExactly("10=2", "11=1");
        assertThat(r.byWeekday()).hasSize(7);
        assertThat(r.byWeekday()).extracting(w -> w.day() + "=" + w.bookings())
                .contains("Wednesday=2", "Thursday=1", "Monday=0");
        assertThat(r.byStatus()).extracting(s -> s.name() + "=" + s.count()).containsExactlyInAnyOrder("CONFIRMED=3", "CANCELLED=1");
        assertThat(r.topProviders()).extracting(p -> p.name() + "=" + p.bookings() + "/" + p.revenue())
                .containsExactly("Alpha Health=2/2000.0", "Beta Wellness=1/0.0");
        assertThat(r.topServices()).extracting(ReportResponse.RankRow::name).containsExactly("Checkup", "Consultation", "Therapy");

        ReportResponse onlyBeta = read(get("/api/admin/reports/bookings?from=2030-01-07&to=2030-01-13&providerId=" + beta.getId(),
                adminToken), ReportResponse.class);
        assertThat(onlyBeta.totals().bookings()).isEqualTo(1);
    }

    @Test
    void reportRangeDefaultsAndValidation() throws Exception {
        ReportResponse defaults = read(get("/api/admin/reports/bookings", adminToken).andExpect(status().isOk()), ReportResponse.class);
        assertThat(defaults.from()).isEqualTo(today().minusDays(29));
        assertThat(defaults.to()).isEqualTo(today().plusDays(30));
        assertThat(defaults.byDay()).hasSize(60);
        assertThat(defaults.totals().bookings()).isZero();
        assertThat(defaults.totals().averageBookingValue()).isZero();

        ReportResponse onlyTo = read(get("/api/admin/reports/bookings?to=2030-01-31", adminToken), ReportResponse.class);
        assertThat(onlyTo.from()).isEqualTo(LocalDate.of(2030, 1, 2));
        ReportResponse onlyFrom = read(get("/api/admin/reports/bookings?from=2030-01-01", adminToken), ReportResponse.class);
        assertThat(onlyFrom.to()).isEqualTo(LocalDate.of(2030, 3, 1));

        get("/api/admin/reports/bookings?from=2030-02-01&to=2030-01-01", adminToken)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("'from' must be before 'to'"));
        get("/api/admin/reports/bookings?from=2030-01-01&to=2031-01-03", adminToken)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The report range is limited to one year"));
        get("/api/admin/reports/bookings?from=not-a-date", adminToken)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid value for parameter: from"));
    }

    @Test
    void reportCanBeExportedAsCsvAndPdf() throws Exception {
        seedBookings();

        String csv = get("/api/admin/reports/bookings/export?format=csv&from=2030-01-07&to=2030-01-13", adminToken)
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(csv).startsWith("﻿Report,2030-01-07 to 2030-01-13\r\n");
        assertThat(csv).contains("Bookings,4\r\n", "Cancellation rate %,25.0\r\n", "Hour,Bookings\r\n", "10:00,2\r\n",
                "Weekday,Bookings\r\n", "Wednesday,2\r\n", "Top providers,Bookings,Revenue\r\n", "Alpha Health,2,2000.0\r\n",
                "Top services,Bookings,Revenue\r\n", "2030-01-09,2,0,2000.0\r\n");

        MvcResult pdf = get("/api/admin/reports/bookings/export?format=pdf", adminToken).andExpect(status().isOk()).andReturn();
        assertThat(pdf.getResponse().getContentType()).startsWith("application/pdf");
        assertThat(pdf.getResponse().getHeader("Content-Disposition")).startsWith("attachment; filename=booking-report-");
        assertThat(new String(pdf.getResponse().getContentAsByteArray(), 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");
    }

    // ------------------------------------------------------------------ reviews

    /** Books both customers at Alpha and completes the appointments after their start. */
    private List<AppointmentResponse> completedVisits() throws Exception {
        AppointmentResponse first = book(carlaToken, alpha.getId(), consultation.getId(), WED, "10:00", PaymentMethod.PAY_AT_VENUE);
        AppointmentResponse second = book(devToken, alpha.getId(), consultation.getId(), WED, "11:00", PaymentMethod.PAY_AT_VENUE);
        clock.setInstant(Instant.parse("2030-01-09T12:00:00Z"));
        String providerToken = auth.token(alpha.getUser());
        for (AppointmentResponse a : List.of(first, second)) {
            put("/api/appointments/" + a.id() + "/status", providerToken, Map.of("status", "COMPLETED")).andExpect(status().isOk());
        }
        return List.of(first, second);
    }

    private double alphaRating() throws Exception {
        return read(get("/api/providers/{id}", null, alpha.getId()), com.booking.dto.response.ProviderResponse.class).rating();
    }

    private List<String> titles(User user) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(user.getId(), PageRequest.of(0, 50)).stream()
                .map(n -> n.getTitle() + ": " + n.getMessage()).toList();
    }

    @Test
    void writtenReviewsAreModeratedAndDriveTheProviderRating() throws Exception {
        User admin = data.admin();
        List<AppointmentResponse> visits = completedVisits();

        ReviewResponse written = read(post("/api/reviews", carlaToken, Map.of("appointmentId", visits.get(0).id(),
                "rating", 2, "comment", "  Too slow  ")).andExpect(status().isOk()), ReviewResponse.class);
        assertThat(written.status()).isEqualTo(ReviewStatus.PENDING);
        assertThat(written.comment()).isEqualTo("Too slow");
        assertThat(alphaRating()).isZero();
        assertThat(titles(admin)).anyMatch(t -> t.startsWith("Review awaiting moderation"));

        ReviewResponse ratingOnly = read(post("/api/reviews", devToken, Map.of("appointmentId", visits.get(1).id(),
                "rating", 5, "comment", " ")).andExpect(status().isOk()), ReviewResponse.class);
        assertThat(ratingOnly.status()).isEqualTo(ReviewStatus.APPROVED);
        assertThat(alphaRating()).isEqualTo(5.0);

        PageResponse<ReviewResponse> queue = read(get("/api/admin/reviews", adminToken).andExpect(status().isOk()),
                new TypeReference<>() { });
        assertThat(queue.content()).extracting(ReviewResponse::id).containsExactly(written.id());
        List<ReviewResponse> publicBefore = read(get("/api/providers/{id}/reviews", null, alpha.getId()), new TypeReference<>() { });
        assertThat(publicBefore).extracting(ReviewResponse::id).containsExactly(ratingOnly.id());

        put("/api/admin/reviews/" + written.id() + "/moderate", adminToken, Map.of("status", "PENDING"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Choose APPROVED or REJECTED"));
        put("/api/admin/reviews/999999/moderate", adminToken, Map.of("status", "APPROVED")).andExpect(status().isNotFound());
        put("/api/admin/reviews/" + written.id() + "/moderate", adminToken, Map.of("status", "APPROVED", "note", "OK"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("APPROVED"))
                .andExpect(jsonPath("$.moderationNote").value("OK"));

        assertThat(alphaRating()).isEqualTo(3.5);
        get("/api/providers/{id}", null, alpha.getId()).andExpect(jsonPath("$.reviewCount").value(2));
        List<ReviewResponse> publicAfter = read(get("/api/reviews/provider/{id}", null, alpha.getId()), new TypeReference<>() { });
        assertThat(publicAfter).hasSize(2);
        assertThat(read(get("/api/admin/reviews?filter=approved", adminToken), new TypeReference<PageResponse<ReviewResponse>>() { })
                .totalElements()).isEqualTo(2);
        assertThat(read(get("/api/admin/reviews?filter=ALL", adminToken), new TypeReference<PageResponse<ReviewResponse>>() { })
                .totalElements()).isEqualTo(2);
        assertThat(read(get("/api/admin/reviews?filter=REJECTED", adminToken), new TypeReference<PageResponse<ReviewResponse>>() { })
                .totalElements()).isZero();
    }

    @Test
    void flaggedReviewsReturnToModerationAndCanBeRejected() throws Exception {
        List<AppointmentResponse> visits = completedVisits();
        ReviewResponse review = read(post("/api/reviews", carlaToken, Map.of("appointmentId", visits.get(0).id(), "rating", 1))
                .andExpect(status().isOk()), ReviewResponse.class);
        read(post("/api/reviews", devToken, Map.of("appointmentId", visits.get(1).id(), "rating", 5)), ReviewResponse.class);
        assertThat(alphaRating()).isEqualTo(3.0);

        String reporter = auth.token(data.customer());
        post("/api/reviews/" + review.id() + "/flag", reporter, Map.of("reason", "Offensive"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Thanks - the review will be checked by our team"));
        post("/api/reviews/" + review.id() + "/flag", reporter, null).andExpect(status().isOk());
        post("/api/reviews/999999/flag", reporter, null).andExpect(status().isNotFound());
        post("/api/reviews/" + review.id() + "/flag", null, null).andExpect(status().isUnauthorized());

        PageResponse<ReviewResponse> flagged = read(get("/api/admin/reviews?filter=FLAGGED", adminToken), new TypeReference<>() { });
        assertThat(flagged.content()).singleElement().satisfies(r -> {
            assertThat(r.id()).isEqualTo(review.id());
            assertThat(r.flagged()).isTrue();
            assertThat(r.flagReason()).isEqualTo("Offensive");
        });

        ReviewResponse rejected = read(put("/api/admin/reviews/" + review.id() + "/moderate", adminToken,
                Map.of("status", "REJECTED", "note", "Abusive")).andExpect(status().isOk()), ReviewResponse.class);
        assertThat(rejected.flagged()).isFalse();
        assertThat(rejected.status()).isEqualTo(ReviewStatus.REJECTED);
        assertThat(alphaRating()).isEqualTo(5.0);
        assertThat(titles(carla)).anyMatch(t -> t.startsWith("Review not published") && t.endsWith("Note: Abusive"));
        assertThat(read(get("/api/admin/reviews?filter=REJECTED", adminToken), new TypeReference<PageResponse<ReviewResponse>>() { })
                .content()).extracting(ReviewResponse::id).containsExactly(review.id());

        // a flag without a reason is recorded as "Reported"
        ReviewResponse other = read(get("/api/providers/{id}/reviews", null, alpha.getId()), new TypeReference<List<ReviewResponse>>() { })
                .get(0);
        post("/api/reviews/" + other.id() + "/flag", reporter, Map.of()).andExpect(status().isOk());
        assertThat(read(get("/api/admin/reviews?filter=FLAGGED", adminToken), new TypeReference<PageResponse<ReviewResponse>>() { })
                .content()).extracting(ReviewResponse::flagReason).containsExactly("Reported");
    }

    @Test
    void providerSeesAllOwnReviewsAndCanReply() throws Exception {
        List<AppointmentResponse> visits = completedVisits();
        ReviewResponse pending = read(post("/api/reviews", carlaToken, Map.of("appointmentId", visits.get(0).id(),
                "rating", 3, "comment", "Okay")), ReviewResponse.class);
        String providerToken = auth.token(alpha.getUser());

        List<ReviewResponse> own = read(get("/api/provider/reviews", providerToken).andExpect(status().isOk()), new TypeReference<>() { });
        assertThat(own).extracting(ReviewResponse::id).containsExactly(pending.id());

        put("/api/provider/reviews/" + pending.id() + "/reply", providerToken, Map.of("reply", ""))
                .andExpect(status().isBadRequest());
        put("/api/provider/reviews/" + pending.id() + "/reply", auth.token(beta.getUser()), Map.of("reply", "Hi"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Review not found"));
        ReviewResponse replied = read(put("/api/provider/reviews/" + pending.id() + "/reply", providerToken,
                Map.of("reply", "  Thanks for the feedback!  ")).andExpect(status().isOk()), ReviewResponse.class);
        assertThat(replied.reply()).isEqualTo("Thanks for the feedback!");
        assertThat(replied.replyAt()).isNotNull();
        assertThat(titles(carla)).anyMatch(t -> t.startsWith("The provider replied to your review"));
        get("/api/provider/reviews", carlaToken).andExpect(status().isForbidden());
    }
}
