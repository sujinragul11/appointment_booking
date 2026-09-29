package com.booking.api;

import com.booking.dto.response.*;
import com.booking.entity.Category;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.Staff;
import com.booking.entity.User;
import com.booking.enums.PaymentMethod;
import com.booking.enums.ProviderStatus;
import com.booking.enums.SlotStatus;
import com.booking.enums.UserRole;
import com.booking.repository.AuditLogRepository;
import com.booking.repository.StaffRepository;
import com.booking.repository.UserRepository;
import com.booking.support.IntegrationTestBase;
import com.booking.support.TestDataFactory;
import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Provider self-service: profile and policies, services, staff with logins, hours, blocks, stats, lists, exports. */
class ProviderPortalApiTest extends IntegrationTestBase {

    @Autowired private UserRepository userRepository;
    @Autowired private StaffRepository staffRepository;
    @Autowired private AuditLogRepository auditLogRepository;

    private Provider provider;
    private String token;
    private LocalDate day;

    @BeforeEach
    void setUp() {
        provider = data.provider("Smile Studio", "UTC");
        token = auth.token(provider.getUser());
        day = inDays(2);
    }

    private Map<String, Object> profile(String businessName) {
        Map<String, Object> body = new HashMap<>();
        body.put("businessName", businessName);
        return body;
    }

    // ------------------------------------------------------------------ profile

    @Test
    void profileShowsDefaultsAndRequiresTheProviderRole() throws Exception {
        ProviderResponse me = read(get("/api/provider/me", token).andExpect(status().isOk()), ProviderResponse.class);
        assertThat(me.businessName()).isEqualTo("Smile Studio");
        assertThat(me.status()).isEqualTo(ProviderStatus.VERIFIED);
        assertThat(me.ownerEmail()).isEqualTo(provider.getUser().getEmail());
        assertThat(me.policy().cancellationCutoffHours()).isEqualTo(24);
        assertThat(me.policy().cancellationPolicy()).isEqualTo("Free cancellation up to 24 hours before the appointment; "
                + "later cancellations are refunded 50%. Reschedule up to 2 time(s), at least 12 hours before the start.");

        get("/api/provider/me", auth.token(data.customer())).andExpect(status().isForbidden());
        User orphan = data.user("No Profile", TestDataFactory.uniqueEmail("orphan"), UserRole.PROVIDER, true, null);
        get("/api/provider/me", auth.token(orphan))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Provider profile not found"));
    }

    @Test
    void profileUpdateValidatesTimezoneAndStoresPolicies() throws Exception {
        Category dental = data.category("Dental");
        Map<String, Object> badTz = profile("Smile Studio");
        badTz.put("timezone", "Mars/Olympus");
        put("/api/provider/me", token, badTz)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Unknown timezone: Mars/Olympus"));
        Map<String, Object> invalid = profile("");
        invalid.put("phone", "abc");
        invalid.put("maxBookingsPerSlot", 0);
        invalid.put("lateCancelRefundPercent", 150);
        put("/api/provider/me", token, invalid)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.businessName").exists())
                .andExpect(jsonPath("$.errors.phone").value("Invalid phone number"))
                .andExpect(jsonPath("$.errors.maxBookingsPerSlot").exists())
                .andExpect(jsonPath("$.errors.lateCancelRefundPercent").exists());
        Map<String, Object> badCategory = profile("Smile Studio");
        badCategory.put("categoryId", 999_999);
        put("/api/provider/me", token, badCategory)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Unknown category"));

        Map<String, Object> full = profile("  Smile Studio London ");
        full.put("description", "Modern dentistry");
        full.put("specialty", "Orthodontics");
        full.put("categoryId", dental.getId());
        full.put("city", "London");
        full.put("state", "Greater London");
        full.put("country", "UK");
        full.put("address", "221B Baker Street");
        full.put("latitude", 51.5237);
        full.put("longitude", -0.1585);
        full.put("phone", "+447700900123");
        full.put("website", "https://smile.example");
        full.put("logoUrl", "/api/uploads/logo.png");
        full.put("coverUrl", "/api/uploads/cover.png");
        full.put("timezone", "Europe/London");
        full.put("slotIntervalMin", 20);
        full.put("maxBookingsPerDay", 8);
        full.put("maxBookingsPerSlot", 2);
        full.put("minNoticeMin", 120);
        full.put("maxAdvanceBookingDays", 60);
        full.put("autoConfirm", false);
        full.put("cancellationCutoffHours", 48);
        full.put("lateCancelRefundPercent", 25);
        full.put("rescheduleCutoffHours", 6);
        full.put("maxReschedules", 0);
        full.put("cancellationPolicy", "Deposits are non-refundable.");
        ProviderResponse updated = read(put("/api/provider/me", token, full).andExpect(status().isOk()), ProviderResponse.class);

        assertThat(updated.businessName()).isEqualTo("Smile Studio London");
        assertThat(updated.timezone()).isEqualTo("Europe/London");
        assertThat(updated.category().name()).isEqualTo("Dental");
        assertThat(updated.city()).isEqualTo("London");
        assertThat(updated.latitude()).isEqualTo(51.5237);
        assertThat(updated.website()).isEqualTo("https://smile.example");
        ProviderResponse.Policy policy = updated.policy();
        assertThat(policy.slotIntervalMin()).isEqualTo(20);
        assertThat(policy.maxBookingsPerDay()).isEqualTo(8);
        assertThat(policy.maxBookingsPerSlot()).isEqualTo(2);
        assertThat(policy.minNoticeMin()).isEqualTo(120);
        assertThat(policy.maxAdvanceBookingDays()).isEqualTo(60);
        assertThat(policy.autoConfirm()).isFalse();
        assertThat(policy.cancellationCutoffHours()).isEqualTo(48);
        assertThat(policy.lateCancelRefundPercent()).isEqualTo(25);
        assertThat(policy.rescheduleCutoffHours()).isEqualTo(6);
        assertThat(policy.maxReschedules()).isZero();
        assertThat(policy.cancellationPolicy()).isEqualTo("Deposits are non-refundable.");
        assertThat(auditLogRepository.findAll()).anyMatch(l -> l.getAction().equals("PROVIDER_PROFILE_UPDATED"));

        // a blank custom text falls back to the generated description
        Map<String, Object> generated = profile("Smile Studio London");
        generated.put("cancellationPolicy", " ");
        generated.put("lateCancelRefundPercent", 0);
        ProviderResponse described = read(put("/api/provider/me", token, generated).andExpect(status().isOk()), ProviderResponse.class);
        assertThat(described.policy().cancellationPolicy())
                .isEqualTo("Free cancellation up to 48 hours before the appointment; later cancellations are not refunded.");
        ProviderResponse publicView = read(get("/api/providers/{id}", null, provider.getId()), ProviderResponse.class);
        assertThat(publicView.policy().cancellationCutoffHours()).isEqualTo(48);
        assertThat(publicView.ownerEmail()).isNull();
    }

    // ------------------------------------------------------------------ services

    @Test
    void providerManagesOwnServices() throws Exception {
        Staff nina = data.staff(provider, "Nina");
        Staff foreign = data.staff(data.provider(), "Foreign");
        Map<String, Object> body = new HashMap<>(Map.of("name", "Whitening", "durationMin", 60, "bufferMin", 10, "price", 3000,
                "staffIds", List.of(nina.getId())));

        ServiceResponse created = read(post("/api/provider/services", token, body).andExpect(status().isOk()), ServiceResponse.class);
        assertThat(created.providerId()).isEqualTo(provider.getId());
        assertThat(created.staffIds()).containsExactly(nina.getId());

        body.put("staffIds", List.of(foreign.getId()));
        post("/api/provider/services", token, body).andExpect(status().isBadRequest());

        Map<String, Object> update = new HashMap<>(Map.of("name", "Whitening Deluxe", "durationMin", 90, "bufferMin", 0, "price", 4000));
        ServiceResponse updated = read(put("/api/provider/services/" + created.id(), token, update).andExpect(status().isOk()),
                ServiceResponse.class);
        assertThat(updated.name()).isEqualTo("Whitening Deluxe");
        assertThat(updated.staffIds()).as("staff stay linked when staffIds is omitted").containsExactly(nina.getId());

        patch("/api/provider/services/" + created.id() + "/active", token, Map.of("active", false))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));
        List<ServiceResponse> mine = read(get("/api/provider/services", token).andExpect(status().isOk()), new TypeReference<>() { });
        assertThat(mine).extracting(ServiceResponse::name).containsExactly("Whitening Deluxe");
        List<ServiceResponse> publicList = read(get("/api/providers/{id}/services", null, provider.getId()), new TypeReference<>() { });
        assertThat(publicList).isEmpty();

        String otherToken = auth.token(data.provider().getUser());
        put("/api/provider/services/" + created.id(), otherToken, update).andExpect(status().isNotFound());
        patch("/api/provider/services/" + created.id() + "/active", otherToken, Map.of("active", true)).andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------ staff

    @Test
    void staffWithEmailGetsAStaffLoginAndSetPasswordLink() throws Exception {
        DomainService cut = data.service(provider, "Haircut", 30, 0, 300);
        Map<String, Object> body = new HashMap<>(Map.of("name", " Nina ", "designation", "Stylist", "bio", "10 years",
                "serviceIds", List.of(cut.getId()), "email", "Nina.Staff@Example.test"));

        StaffResponse nina = read(post("/api/provider/staff", token, body).andExpect(status().isOk()), StaffResponse.class);
        assertThat(nina.name()).isEqualTo("Nina");
        assertThat(nina.loginEmail()).isEqualTo("nina.staff@example.test");
        assertThat(nina.serviceIds()).containsExactly(cut.getId());
        assertThat(nina.active()).isTrue();
        User login = userRepository.findByEmailIgnoreCase("nina.staff@example.test").orElseThrow();
        assertThat(login.getRole()).isEqualTo(UserRole.STAFF);
        assertThat(auditLogRepository.findAll()).extracting(l -> l.getAction()).contains("STAFF_CREATED", "STAFF_LOGIN_CREATED");

        // the invite is a password reset link
        String link = lastEmailLink("nina.staff@example.test", "Reset your password");
        post("/api/auth/reset-password", null, Map.of("token", link.substring(link.indexOf("token=") + 6), "newPassword", "StaffPass1"))
                .andExpect(status().isOk());
        String staffToken = auth.login("nina.staff@example.test", "StaffPass1");
        get("/api/staff-portal/me", staffToken).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Nina"));
        get("/api/auth/me", staffToken).andExpect(jsonPath("$.staffId").value(nina.id()));

        post("/api/provider/staff", token, Map.of("name", "Copy", "email", "nina.staff@example.test"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("An account with this e-mail already exists"));
        post("/api/provider/staff", token, Map.of("name", "Bad", "email", "not-an-email")).andExpect(status().isBadRequest());

        List<StaffResponse> team = read(get("/api/provider/staff", token).andExpect(status().isOk()), new TypeReference<>() { });
        assertThat(team).extracting(StaffResponse::name).containsExactly("Nina");
        List<StaffResponse> publicTeam = read(get("/api/providers/{id}/staff", null, provider.getId()), new TypeReference<>() { });
        assertThat(publicTeam).extracting(StaffResponse::id).containsExactly(nina.id());
        get("/api/staff/provider/{id}", null, provider.getId()).andExpect(jsonPath("$[0].name").value("Nina"));
        List<ServiceResponse> services = read(get("/api/providers/{id}/services", null, provider.getId()), new TypeReference<>() { });
        assertThat(services.get(0).staffNames()).containsExactly("Nina");
    }

    @Test
    void staffCanBeUpdatedLinkedAndDeactivated() throws Exception {
        DomainService cut = data.service(provider, "Haircut", 30, 0, 300);
        StaffResponse omar = read(post("/api/provider/staff", token, Map.of("name", "Omar", "serviceIds", List.of(cut.getId())))
                .andExpect(status().isOk()), StaffResponse.class);
        assertThat(omar.loginEmail()).isNull();

        Map<String, Object> update = new HashMap<>(Map.of("name", "Omar K", "designation", "Senior", "photoUrl", "",
                "serviceIds", List.of(), "email", "omar@example.test"));
        StaffResponse updated = read(put("/api/provider/staff/" + omar.id(), token, update).andExpect(status().isOk()),
                StaffResponse.class);
        assertThat(updated.name()).isEqualTo("Omar K");
        assertThat(updated.designation()).isEqualTo("Senior");
        assertThat(updated.photoUrl()).isNull();
        assertThat(updated.serviceIds()).isEmpty();
        assertThat(updated.loginEmail()).isEqualTo("omar@example.test");

        update.put("active", false);
        read(put("/api/provider/staff/" + omar.id(), token, update).andExpect(status().isOk()), StaffResponse.class);
        assertThat(userRepository.findByEmailIgnoreCase("omar@example.test").orElseThrow().isActive()).isFalse();
        update.put("active", true);
        put("/api/provider/staff/" + omar.id(), token, update).andExpect(status().isOk());
        assertThat(userRepository.findByEmailIgnoreCase("omar@example.test").orElseThrow().isActive()).isTrue();

        delete("/api/provider/staff/" + omar.id(), token).andExpect(status().isNoContent());
        Staff stored = staffRepository.findById(omar.id()).orElseThrow();
        assertThat(stored.isActive()).isFalse();
        User login = userRepository.findByEmailIgnoreCase("omar@example.test").orElseThrow();
        assertThat(login.isActive()).isFalse();
        assertThat(login.getTokenVersion()).isEqualTo(1);
        assertThat(read(get("/api/providers/{id}/staff", null, provider.getId()), new TypeReference<List<StaffResponse>>() { }))
                .isEmpty();

        String other = auth.token(data.provider().getUser());
        put("/api/provider/staff/" + omar.id(), other, Map.of("name", "Hijack")).andExpect(status().isNotFound());
        delete("/api/provider/staff/" + omar.id(), other).andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------ availability

    @Test
    void weeklyAvailabilityWindowsCanBeAddedUpdatedReplacedAndDeleted() throws Exception {
        AvailabilityResponse monday = read(post("/api/availability", token,
                Map.of("dayOfWeek", 1, "startTime", "09:00", "endTime", "12:00")).andExpect(status().isOk()), AvailabilityResponse.class);
        assertThat(monday.dayName()).isEqualTo("Monday");
        assertThat(monday.staffId()).isNull();
        assertThat(monday.active()).isTrue();

        post("/api/availability", token, Map.of("dayOfWeek", 1, "startTime", "11:00", "endTime", "13:00"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This window overlaps existing hours on that day"));
        post("/api/availability", token, Map.of("dayOfWeek", 1, "startTime", "12:00", "endTime", "14:00"))
                .andExpect(status().isOk());
        post("/api/availability", token, Map.of("dayOfWeek", 1, "startTime", "15:00", "endTime", "14:00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("startTime must be before endTime"));
        post("/api/availability", token, Map.of("dayOfWeek", 8, "startTime", "09:00", "endTime", "10:00"))
                .andExpect(status().isBadRequest());

        AvailabilityResponse moved = read(put("/api/availability/" + monday.id(), token,
                Map.of("dayOfWeek", 2, "startTime", "10:00", "endTime", "11:00", "active", false)).andExpect(status().isOk()),
                AvailabilityResponse.class);
        assertThat(moved.dayOfWeek()).isEqualTo(2);
        assertThat(moved.active()).isFalse();

        AvailabilityBundleResponse mine = read(get("/api/availability/me", token).andExpect(status().isOk()),
                AvailabilityBundleResponse.class);
        assertThat(mine.availability()).hasSize(2);
        AvailabilityBundleResponse publicBundle = read(get("/api/providers/{id}/availability", null, provider.getId()),
                AvailabilityBundleResponse.class);
        assertThat(publicBundle.availability()).as("inactive windows are hidden publicly").hasSize(1);

        String other = auth.token(data.provider().getUser());
        put("/api/availability/" + monday.id(), other, Map.of("dayOfWeek", 2, "startTime", "10:00", "endTime", "11:00"))
                .andExpect(status().isNotFound());
        delete("/api/availability/" + monday.id(), other).andExpect(status().isNotFound());
        delete("/api/availability/" + monday.id(), token).andExpect(status().isNoContent());
        delete("/api/availability/" + monday.id(), token).andExpect(status().isNotFound());

        List<AvailabilityResponse> week = read(put("/api/availability/week", token, Map.of("windows", List.of(
                Map.of("dayOfWeek", 3, "startTime", "10:00", "endTime", "14:00"),
                Map.of("dayOfWeek", 1, "startTime", "13:00", "endTime", "17:00"),
                Map.of("dayOfWeek", 1, "startTime", "09:00", "endTime", "12:00")))).andExpect(status().isOk()),
                new TypeReference<>() { });
        assertThat(week).extracting(w -> w.dayOfWeek() + "@" + w.startTime()).containsExactly("1@09:00", "1@13:00", "3@10:00");
        assertThat(read(get("/api/availability/me", token), AvailabilityBundleResponse.class).availability()).hasSize(3);

        put("/api/availability/week", token, Map.of("windows", List.of(
                Map.of("dayOfWeek", 5, "startTime", "09:00", "endTime", "12:00"),
                Map.of("dayOfWeek", 5, "startTime", "11:00", "endTime", "13:00"))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Windows overlap on Friday"));
        get("/api/availability/me", auth.token(data.customer())).andExpect(status().isForbidden());
    }

    @Test
    void staffLevelHoursAndStaffManagingTheirOwnHours() throws Exception {
        User aliceLogin = data.user("Alice", TestDataFactory.uniqueEmail("alice"), UserRole.STAFF, true, null);
        Staff alice = data.staff(provider, "Alice", aliceLogin);
        Staff bob = data.staff(provider, "Bob");
        Staff foreign = data.staff(data.provider(), "Foreign");
        post("/api/availability", token, Map.of("dayOfWeek", 1, "startTime", "09:00", "endTime", "17:00")).andExpect(status().isOk());

        post("/api/availability", token, Map.of("dayOfWeek", 1, "startTime", "09:00", "endTime", "12:00", "staffId", bob.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.staffId").value(bob.getId()));
        post("/api/availability", token, Map.of("dayOfWeek", 1, "startTime", "09:00", "endTime", "12:00", "staffId", foreign.getId()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Staff not found for this provider"));

        String aliceToken = auth.token(aliceLogin);
        post("/api/availability", aliceToken, Map.of("dayOfWeek", 2, "startTime", "13:00", "endTime", "18:00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.staffId").value(alice.getId()));
        post("/api/availability", aliceToken, Map.of("dayOfWeek", 2, "startTime", "08:00", "endTime", "09:00", "staffId", bob.getId()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("Staff can only manage their own hours"));
        AvailabilityBundleResponse aliceView = read(get("/api/availability/me", aliceToken).andExpect(status().isOk()),
                AvailabilityBundleResponse.class);
        assertThat(aliceView.availability()).extracting(AvailabilityResponse::staffId)
                .containsExactlyInAnyOrder(null, alice.getId());
        put("/api/availability/week", aliceToken, Map.of("windows", List.of(
                Map.of("dayOfWeek", 4, "startTime", "10:00", "endTime", "12:00")))).andExpect(status().isOk());
        post("/api/availability/blocked", aliceToken, Map.of("date", day.toString(), "reason", "Leave"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.staffId").value(alice.getId()));

        User noProfile = data.user("Ghost Staff", TestDataFactory.uniqueEmail("ghost"), UserRole.STAFF, true, null);
        get("/api/availability/me", auth.token(noProfile))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("No active staff profile for this account"));
    }

    @Test
    void blockedDatesAndCustomHoursShapeTheSlots() throws Exception {
        data.openAllWeek(provider, LocalTime.of(9, 0), LocalTime.of(17, 0));
        DomainService s = data.service(provider, "Checkup", 60, 0, 100);

        BlockedDateResponse holiday = read(post("/api/availability/blocked", token, Map.of("date", day.toString(),
                "reason", "Festival")).andExpect(status().isOk()), BlockedDateResponse.class);
        assertThat(holiday.available()).isFalse();
        assertThat(holiday.reason()).isEqualTo("Festival");
        assertThat(slots(provider.getId(), s.getId(), day, null).closed()).isTrue();
        AvailabilityBundleResponse publicBundle = read(get("/api/providers/{id}/availability", null, provider.getId()),
                AvailabilityBundleResponse.class);
        assertThat(publicBundle.blockedDates()).singleElement().satisfies(b -> assertThat(b.reason()).as("reasons stay private").isNull());
        AvailabilityBundleResponse own = read(get("/api/availability/me", token), AvailabilityBundleResponse.class);
        assertThat(own.blockedDates()).singleElement().satisfies(b -> assertThat(b.reason()).isEqualTo("Festival"));

        // one entry per date: custom hours replace the block
        post("/api/availability/blocked", token, Map.of("date", day.toString(), "available", true))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Custom working hours need a start and end time"));
        post("/api/availability/blocked", token, Map.of("date", day.toString(), "startTime", "10:00"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Provide both startTime and endTime, with startTime before endTime"));
        BlockedDateResponse custom = read(post("/api/availability/blocked", token, Map.of("date", day.toString(),
                "startTime", "10:00", "endTime", "12:00", "available", true)).andExpect(status().isOk()), BlockedDateResponse.class);
        assertThat(read(get("/api/availability/me", token), AvailabilityBundleResponse.class).blockedDates()).hasSize(1);
        assertThat(startTimes(slots(provider.getId(), s.getId(), day, null)))
                .containsExactly(LocalTime.of(10, 0), LocalTime.of(11, 0));

        // a partial block
        BlockedDateResponse partial = read(post("/api/availability/blocked", token, Map.of("date", day.plusDays(1).toString(),
                "startTime", "09:00", "endTime", "12:00")).andExpect(status().isOk()), BlockedDateResponse.class);
        assertThat(slotAt(slots(provider.getId(), s.getId(), day.plusDays(1), null), "11:00").status()).isEqualTo(SlotStatus.BLOCKED);

        post("/api/availability/blocked", token, Map.of("date", LocalDate.now().minusDays(1).toString()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Cannot change a date in the past"));

        delete("/api/availability/blocked/" + custom.id(), auth.token(data.provider().getUser())).andExpect(status().isNotFound());
        delete("/api/availability/blocked/" + custom.id(), token).andExpect(status().isNoContent());
        delete("/api/availability/blocked/" + partial.id(), token).andExpect(status().isNoContent());
        delete("/api/availability/blocked/" + partial.id(), token).andExpect(status().isNotFound());
        assertThat(slots(provider.getId(), s.getId(), day, null).slots()).hasSize(8);
        assertThat(auditLogRepository.findAll()).extracting(l -> l.getAction())
                .contains("DATE_BLOCKED", "CUSTOM_HOURS_SET", "DATE_UNBLOCKED");
    }

    // ------------------------------------------------------------------ dashboard, lists and exports

    @Test
    void statsEarningsAndReportsCoverOnlyOwnBookings() throws Exception {
        data.openAllWeek(provider, LocalTime.of(9, 0), LocalTime.of(17, 0));
        DomainService s = data.service(provider, "Consultation", 30, 0, 1000);
        Provider competitor = data.provider();
        data.openAllWeek(competitor, LocalTime.of(9, 0), LocalTime.of(17, 0));
        DomainService cs = data.service(competitor, "Other", 30, 0, 700);
        String customer = auth.token(data.customer());

        book(customer, provider.getId(), s.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE);
        var paid = book(customer, provider.getId(), s.getId(), day, "11:00", PaymentMethod.RAZORPAY);
        mvc.perform(MockMvcRequestBuilders.post("/api/payments/demo/complete").param("appointmentId", paid.id().toString())
                .header("Authorization", "Bearer " + customer)).andExpect(status().isOk());
        var cancelled = book(customer, provider.getId(), s.getId(), day, "12:00", PaymentMethod.PAY_AT_VENUE);
        put("/api/appointments/" + cancelled.id() + "/cancel", customer, Map.of("reason", "Busy")).andExpect(status().isOk());
        var done = book(customer, provider.getId(), s.getId(), day, "13:00", PaymentMethod.PAY_AT_VENUE);
        book(customer, competitor.getId(), cs.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE);
        clock.setInstant(Instant.parse("2030-01-09T13:10:00Z"));
        put("/api/appointments/" + done.id() + "/status", token, Map.of("status", "COMPLETED")).andExpect(status().isOk());

        ProviderStatsResponse stats = read(get("/api/provider/stats", token).andExpect(status().isOk()), ProviderStatsResponse.class);
        assertThat(stats.upcomingAppointments()).isEqualTo(2);
        assertThat(stats.completedAppointments()).isEqualTo(1);
        assertThat(stats.cancelledAppointments()).isEqualTo(1);
        assertThat(stats.noShowAppointments()).isZero();
        assertThat(stats.pendingAppointments()).isZero();
        assertThat(stats.totalRevenue()).isEqualTo(1000);

        EarningsResponse earnings = read(get("/api/provider/earnings", token).andExpect(status().isOk()), EarningsResponse.class);
        assertThat(earnings.totalCollected()).isEqualTo(1000);
        assertThat(earnings.onlineCollected()).isEqualTo(1000);
        assertThat(earnings.dueAtVenue()).isEqualTo(2000);
        assertThat(earnings.refunded()).isZero();
        assertThat(earnings.payments()).hasSize(4);

        ReportResponse report = read(get("/api/provider/reports?from=" + day + "&to=" + day, token).andExpect(status().isOk()),
                ReportResponse.class);
        assertThat(report.totals().bookings()).isEqualTo(4);
        assertThat(report.totals().completed()).isEqualTo(1);
        assertThat(report.totals().cancelled()).isEqualTo(1);
        assertThat(report.topProviders()).extracting(ReportResponse.RankRow::name).containsExactly("Smile Studio");
        get("/api/provider/stats", auth.token(data.customer())).andExpect(status().isForbidden());
    }

    @Test
    void appointmentListsDayScheduleAndExports() throws Exception {
        data.openAllWeek(provider, LocalTime.of(9, 0), LocalTime.of(17, 0));
        DomainService s = data.service(provider, "Consultation", 30, 0, 1000);
        User zoe = data.user("Zoe Zed", "zoe@example.test", UserRole.CUSTOMER, true, null);
        String zoeToken = auth.token(zoe);
        String other = auth.token(data.customer());
        var late = book(zoeToken, provider.getId(), s.getId(), day, "15:00", PaymentMethod.PAY_AT_VENUE);
        var early = book(other, provider.getId(), s.getId(), day, "09:00", PaymentMethod.PAY_AT_VENUE);
        var nextDay = book(other, provider.getId(), s.getId(), day.plusDays(1), "10:00", PaymentMethod.PAY_AT_VENUE);
        put("/api/appointments/" + nextDay.id() + "/cancel", other, Map.of("reason", "x")).andExpect(status().isOk());

        PageResponse<AppointmentResponse> all = read(get("/api/provider/appointments", token).andExpect(status().isOk()),
                new TypeReference<>() { });
        assertThat(all.content()).extracting(AppointmentResponse::id).containsExactly(nextDay.id(), late.id(), early.id());
        PageResponse<AppointmentResponse> zoes = read(get("/api/provider/appointments?q=zoe", token), new TypeReference<>() { });
        assertThat(zoes.content()).extracting(AppointmentResponse::id).containsExactly(late.id());
        PageResponse<AppointmentResponse> cancelled = read(get("/api/provider/appointments?status=CANCELLED&from=" + day
                + "&to=" + day.plusDays(3), token), new TypeReference<>() { });
        assertThat(cancelled.content()).extracting(AppointmentResponse::id).containsExactly(nextDay.id());

        List<AppointmentResponse> schedule = read(get("/api/provider/appointments/day?date=" + day, token)
                .andExpect(status().isOk()), new TypeReference<>() { });
        assertThat(schedule).extracting(AppointmentResponse::id).containsExactly(early.id(), late.id());
        get("/api/provider/appointments/day", token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Missing parameter: date"));

        MvcResult csv = get("/api/provider/appointments/export?format=csv&status=CONFIRMED", token).andExpect(status().isOk()).andReturn();
        assertThat(csv.getResponse().getContentType()).startsWith("text/csv");
        String body = csv.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).contains(late.bookingRef(), early.bookingRef()).doesNotContain(nextDay.bookingRef());
        MvcResult pdf = get("/api/provider/appointments/export?format=pdf&from=" + day + "&to=" + day, token)
                .andExpect(status().isOk()).andReturn();
        assertThat(pdf.getResponse().getContentType()).startsWith("application/pdf");
        assertThat(new String(pdf.getResponse().getContentAsByteArray(), 0, 4, StandardCharsets.US_ASCII)).isEqualTo("%PDF");

        // other providers' lists stay empty
        String competitor = auth.token(data.provider().getUser());
        assertThat(read(get("/api/provider/appointments", competitor), new TypeReference<PageResponse<AppointmentResponse>>() { })
                .totalElements()).isZero();
    }

    @Test
    void branchesCanBeManaged() throws Exception {
        BranchResponse main = read(post("/api/provider/branches", token, Map.of("name", "Main Branch", "city", "Chennai",
                "main", true)).andExpect(status().isOk()), BranchResponse.class);
        assertThat(main.main()).isTrue();
        BranchResponse annex = read(post("/api/provider/branches", token, Map.of("name", "Annex", "main", true))
                .andExpect(status().isOk()), BranchResponse.class);
        assertThat(annex.main()).isTrue();
        read(post("/api/provider/branches", token, Map.of("name", "Kiosk")).andExpect(status().isOk()), BranchResponse.class);
        post("/api/provider/branches", token, Map.of("city", "Nowhere")).andExpect(status().isBadRequest());

        List<BranchResponse> list = read(get("/api/provider/branches", token).andExpect(status().isOk()), new TypeReference<>() { });
        assertThat(list).extracting(b -> b.name() + ":" + b.main())
                .containsExactlyInAnyOrder("Main Branch:false", "Annex:true", "Kiosk:false");
        ProviderResponse profile = read(get("/api/providers/{id}", null, provider.getId()), ProviderResponse.class);
        assertThat(profile.branches()).extracting(BranchResponse::name).containsExactly("Annex", "Kiosk", "Main Branch");

        delete("/api/provider/branches/" + main.id(), auth.token(data.provider().getUser())).andExpect(status().isNotFound());
        delete("/api/provider/branches/" + main.id(), token).andExpect(status().isNoContent());
        assertThat(read(get("/api/provider/branches", token), new TypeReference<List<BranchResponse>>() { })).hasSize(2);
    }
}
