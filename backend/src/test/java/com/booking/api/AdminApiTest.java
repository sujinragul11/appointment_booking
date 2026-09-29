package com.booking.api;

import com.booking.dto.response.AuditLogResponse;
import com.booking.dto.response.PageResponse;
import com.booking.dto.response.ProviderResponse;
import com.booking.dto.response.StatsResponse;
import com.booking.dto.response.UserResponse;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.Staff;
import com.booking.entity.User;
import com.booking.enums.PaymentMethod;
import com.booking.enums.ProviderStatus;
import com.booking.enums.UserRole;
import com.booking.repository.AddressRepository;
import com.booking.repository.NotificationRepository;
import com.booking.repository.ProviderRepository;
import com.booking.repository.StaffRepository;
import com.booking.repository.UserRepository;
import com.booking.support.IntegrationTestBase;
import com.booking.support.TestDataFactory;
import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Admin: access rules, platform stats, user management, provider approval and the audit trail. */
class AdminApiTest extends IntegrationTestBase {

    @Autowired private UserRepository userRepository;
    @Autowired private ProviderRepository providerRepository;
    @Autowired private StaffRepository staffRepository;
    @Autowired private AddressRepository addressRepository;
    @Autowired private NotificationRepository notificationRepository;

    private User admin;
    private String adminToken;

    @BeforeEach
    void setUp() {
        admin = data.admin();
        adminToken = auth.token(admin);
    }

    // ------------------------------------------------------------------ access

    @Test
    void adminRoutesRequireTheAdminRole() throws Exception {
        String customer = auth.token(data.customer());
        String provider = auth.token(data.provider().getUser());

        for (String url : List.of("/api/admin/stats", "/api/admin/users", "/api/admin/providers", "/api/admin/coupons",
                "/api/admin/audit-logs", "/api/admin/reviews", "/api/admin/appointments")) {
            get(url, customer)
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.message").value("You do not have permission to perform this action"));
            get(url, provider).andExpect(status().isForbidden());
            get(url, null).andExpect(status().isUnauthorized());
            get(url, adminToken).andExpect(status().isOk());
        }
        post("/api/admin/categories", customer, Map.of("name", "Hack")).andExpect(status().isForbidden());
    }

    // ------------------------------------------------------------------ stats

    @Test
    void statsSummariseThePlatform() throws Exception {
        Provider provider = data.provider();
        data.openAllWeek(provider, LocalTime.of(9, 0), LocalTime.of(17, 0));
        DomainService service = data.service(provider, "Consultation", 30, 0, 1000);
        data.provider("Waiting Room", "UTC", ProviderStatus.PENDING, p -> { });
        User customer = data.customer();
        data.customer();
        String token = auth.token(customer);
        LocalDate day = inDays(2);

        book(token, provider.getId(), service.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE);
        var paid = book(token, provider.getId(), service.getId(), day, "11:00", PaymentMethod.RAZORPAY);
        mvc.perform(MockMvcRequestBuilders.post("/api/payments/demo/complete").param("appointmentId", paid.id().toString())
                .header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        book(token, provider.getId(), service.getId(), day, "12:00", PaymentMethod.RAZORPAY);
        var cancelled = book(token, provider.getId(), service.getId(), day, "13:00", PaymentMethod.PAY_AT_VENUE);
        put("/api/appointments/" + cancelled.id() + "/cancel", token, Map.of("reason", "No")).andExpect(status().isOk());

        StatsResponse stats = read(get("/api/admin/stats", adminToken).andExpect(status().isOk()), StatsResponse.class);

        assertThat(stats.totalUsers()).isEqualTo(5);
        assertThat(stats.totalCustomers()).isEqualTo(2);
        assertThat(stats.totalProviders()).isEqualTo(2);
        assertThat(stats.pendingProviders()).isEqualTo(1);
        assertThat(stats.totalAppointments()).isEqualTo(4);
        assertThat(stats.pendingAppointments()).isEqualTo(1);
        assertThat(stats.confirmedAppointments()).isEqualTo(2);
        assertThat(stats.completedAppointments()).isZero();
        assertThat(stats.cancelledAppointments()).isEqualTo(1);
        assertThat(stats.totalRevenue()).isEqualTo(1000);
        assertThat(stats.totalReviews()).isZero();
        assertThat(stats.pendingReviews()).isZero();
    }

    // ------------------------------------------------------------------ users

    @Test
    void usersCanBeSearchedAndFiltered() throws Exception {
        User anna = data.user("Anna Search", "anna.search@example.test", UserRole.CUSTOMER, true, "+919812300000");
        data.user("Bob Other", "bob.other@example.test", UserRole.CUSTOMER, true, null);
        data.provider();

        PageResponse<UserResponse> byName = users("?q=anna");
        assertThat(byName.content()).extracting(UserResponse::id).containsExactly(anna.getId());
        assertThat(users("?q=BOB.OTHER@").content()).extracting(UserResponse::email).containsExactly("bob.other@example.test");
        assertThat(users("?q=98123").content()).extracting(UserResponse::id).containsExactly(anna.getId());
        assertThat(users("?role=CUSTOMER").content()).extracting(UserResponse::role).containsOnly(UserRole.CUSTOMER).hasSize(2);
        assertThat(users("?role=PROVIDER").totalElements()).isEqualTo(1);

        PageResponse<UserResponse> page = users("?size=2&page=0");
        assertThat(page.content()).hasSize(2);
        assertThat(page.totalElements()).isEqualTo(4);
        assertThat(page.totalPages()).isEqualTo(2);

        patch("/api/admin/users/" + anna.getId() + "/active", adminToken, Map.of("active", false)).andExpect(status().isOk());
        assertThat(users("?active=false").content()).extracting(UserResponse::id).containsExactly(anna.getId());
        assertThat(users("?active=true").totalElements()).isEqualTo(3);
        patch("/api/admin/users/" + anna.getId() + "/active", adminToken, Map.of()).andExpect(status().isBadRequest());
    }

    private PageResponse<UserResponse> users(String query) throws Exception {
        return read(get("/api/admin/users" + query, adminToken).andExpect(status().isOk()), new TypeReference<>() { });
    }

    @Test
    void deletingAUserAnonymisesTheAccountAndKeepsHistory() throws Exception {
        User customer = data.customer();
        String token = auth.token(customer);
        post("/api/addresses", token, Map.of("addressLine", "5 Lake View", "city", "Pune")).andExpect(status().isOk());
        Provider provider = data.provider();
        data.openAllWeek(provider, LocalTime.of(9, 0), LocalTime.of(17, 0));
        DomainService service = data.service(provider, "Consultation", 30, 0, 100);
        var appt = book(token, provider.getId(), service.getId(), inDays(2), "10:00", PaymentMethod.PAY_AT_VENUE);

        delete("/api/admin/users/" + customer.getId(), adminToken).andExpect(status().isNoContent());

        User stored = data.inTransaction(() -> {
            User u = userRepository.findById(customer.getId()).orElseThrow();
            u.getAddresses().size();
            return u;
        });
        assertThat(stored.isDeleted()).isTrue();
        assertThat(stored.isActive()).isFalse();
        assertThat(stored.getName()).isEqualTo("Deleted user");
        assertThat(stored.getEmail()).matches("deleted-" + customer.getId() + "-[a-z0-9]{6}@deleted\\.invalid");
        assertThat(stored.getPhone()).isNull();
        assertThat(addressRepository.findByUserIdOrderByIdAsc(customer.getId())).isEmpty();
        get("/api/auth/me", token).andExpect(status().isUnauthorized());
        post("/api/auth/login", null, Map.of("email", customer.getEmail(), "password", TestDataFactory.PASSWORD))
                .andExpect(status().isUnauthorized());
        assertThat(users("").content()).extracting(UserResponse::id).doesNotContain(customer.getId());
        // the booking is kept for accounting
        get("/api/admin/appointments/export?format=csv", adminToken).andExpect(status().isOk());
        getAppointment(appt.id(), adminToken);

        delete("/api/admin/users/" + customer.getId(), adminToken).andExpect(status().isNotFound());
        delete("/api/admin/users/" + admin.getId(), adminToken)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("You cannot change your own account here"));
        patch("/api/admin/users/" + admin.getId() + "/active", adminToken, Map.of("active", false))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deletingProviderAndStaffAccountsSuspendsAndUnlinksThem() throws Exception {
        Provider provider = data.provider();
        User staffLogin = data.user("Sam Staff", TestDataFactory.uniqueEmail("staff"), UserRole.STAFF, true, null);
        Staff staff = data.staff(provider, "Sam Staff", staffLogin);

        patch("/api/admin/users/" + staffLogin.getId() + "/active", adminToken, Map.of("active", false))
                .andExpect(status().isOk());
        assertThat(staffRepository.findById(staff.getId()).orElseThrow().isActive()).isFalse();
        patch("/api/admin/users/" + staffLogin.getId() + "/active", adminToken, Map.of("active", true))
                .andExpect(status().isOk());
        assertThat(staffRepository.findById(staff.getId()).orElseThrow().isActive()).isTrue();

        delete("/api/admin/users/" + staffLogin.getId(), adminToken).andExpect(status().isNoContent());
        Staff unlinked = data.inTransaction(() -> {
            Staff s = staffRepository.findById(staff.getId()).orElseThrow();
            assertThat(s.getUser()).isNull();
            return s;
        });
        assertThat(unlinked.isActive()).isFalse();

        delete("/api/admin/users/" + provider.getUser().getId(), adminToken).andExpect(status().isNoContent());
        assertThat(providerRepository.findById(provider.getId()).orElseThrow().getStatus()).isEqualTo(ProviderStatus.SUSPENDED);
        get("/api/providers/{id}", null, provider.getId()).andExpect(status().isNotFound());
    }

    @Test
    void usersCanBeExportedAsCsvOrPdf() throws Exception {
        data.user("Comma, Name", "comma@example.test", UserRole.CUSTOMER, true, null);

        MvcResult csv = get("/api/admin/users/export?format=csv", adminToken).andExpect(status().isOk()).andReturn();
        assertThat(csv.getResponse().getContentType()).startsWith("text/csv");
        assertThat(csv.getResponse().getHeader("Content-Disposition")).matches("attachment; filename=users-\\d{4}-\\d{2}-\\d{2}\\.csv");
        String body = csv.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(body).startsWith("﻿ID,Name,E-mail,Phone,Role,E-mail verified,Phone verified,Active,Created,Last login\r\n");
        assertThat(body).contains("\"Comma, Name\",comma@example.test");

        MvcResult pdf = get("/api/admin/users/export?format=PDF", adminToken).andExpect(status().isOk()).andReturn();
        assertThat(pdf.getResponse().getContentType()).startsWith("application/pdf");
        assertThat(new String(pdf.getResponse().getContentAsByteArray(), 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");

        get("/api/admin/users/export?format=xlsx", adminToken)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("format must be csv or pdf"));
    }

    // ------------------------------------------------------------------ providers

    @Test
    void providersCanBeListedAndApproved() throws Exception {
        Provider pending = data.provider("Fresh Dental", "UTC", ProviderStatus.PENDING, p -> p.setCity("Madurai"));
        data.provider("Established Clinic", "UTC");

        PageResponse<ProviderResponse> waiting = read(get("/api/admin/providers?status=PENDING", adminToken)
                .andExpect(status().isOk()), new TypeReference<>() { });
        assertThat(waiting.content()).extracting(ProviderResponse::id).containsExactly(pending.getId());
        assertThat(waiting.content().get(0).ownerEmail()).isEqualTo(pending.getUser().getEmail());
        PageResponse<ProviderResponse> byQuery = read(get("/api/admin/providers?q=madurai", adminToken), new TypeReference<>() { });
        assertThat(byQuery.content()).extracting(ProviderResponse::id).containsExactly(pending.getId());
        PageResponse<ProviderResponse> all = read(get("/api/admin/providers", adminToken), new TypeReference<>() { });
        assertThat(all.totalElements()).isEqualTo(2);

        get("/api/providers/{id}", null, pending.getId()).andExpect(status().isNotFound());
        get("/api/providers?q=Fresh", null).andExpect(jsonPath("$.totalElements").value(0));

        put("/api/admin/providers/" + pending.getId() + "/decision", adminToken, Map.of("status", "VERIFIED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("VERIFIED"));

        get("/api/providers/{id}", null, pending.getId()).andExpect(status().isOk());
        get("/api/providers?q=Fresh", null)
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].id").value(pending.getId()));
        assertThat(notificationRepository.findByUserIdOrderByCreatedAtDesc(pending.getUser().getId(), PageRequest.of(0, 5)))
                .extracting(n -> n.getTitle()).contains("Provider status: VERIFIED");
        get("/api/admin/audit-logs?action=PROVIDER_VERIFIED", adminToken)
                .andExpect(jsonPath("$.content[0].details").value("PENDING -> VERIFIED"));
    }

    @Test
    void providersCanBeRejectedOrSuspendedWithANote() throws Exception {
        Provider p = data.provider("Shady Spa", "UTC");

        put("/api/admin/providers/" + p.getId() + "/decision", adminToken, Map.of("status", "SUSPENDED", "note", "Complaints"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.adminNote").value("Complaints"));
        get("/api/providers/{id}", null, p.getId()).andExpect(status().isNotFound());
        get("/api/providers/{id}", adminToken, p.getId()).andExpect(status().isOk()).andExpect(jsonPath("$.adminNote").value("Complaints"));

        put("/api/admin/providers/" + p.getId() + "/decision", adminToken, Map.of("status", "REJECTED", "note", "Invalid licence"))
                .andExpect(status().isOk());
        put("/api/admin/providers/" + p.getId() + "/decision", adminToken, Map.of("status", "PENDING"))
                .andExpect(status().isOk());
        List<String> messages = notificationRepository.findByUserIdOrderByCreatedAtDesc(p.getUser().getId(), PageRequest.of(0, 10))
                .stream().map(n -> n.getMessage()).toList();
        assertThat(messages).contains("Your provider account was suspended. Note: Complaints",
                "Your provider application was rejected. Note: Invalid licence",
                "Your provider status changed to PENDING.");

        put("/api/admin/providers/999999/decision", adminToken, Map.of("status", "VERIFIED")).andExpect(status().isNotFound());
        put("/api/admin/providers/" + p.getId() + "/decision", adminToken, Map.of()).andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------ audit

    @Test
    void auditLogRecordsAdminActionsAndCanBeFiltered() throws Exception {
        Provider p = data.provider("Audit Clinic", "UTC", ProviderStatus.PENDING, x -> { });
        put("/api/admin/providers/" + p.getId() + "/decision", adminToken, Map.of("status", "VERIFIED")).andExpect(status().isOk());
        post("/api/admin/categories", adminToken, Map.of("name", "Audited")).andExpect(status().isOk());
        post("/api/admin/coupons", adminToken, Map.of("code", "AUDIT1", "discountType", "FLAT", "value", 10,
                "minOrder", 0, "maxDiscount", 0, "usageLimit", 0)).andExpect(status().isOk());

        PageResponse<AuditLogResponse> all = read(get("/api/admin/audit-logs", adminToken), new TypeReference<>() { });
        assertThat(all.content()).extracting(AuditLogResponse::action)
                .contains("PROVIDER_VERIFIED", "CATEGORY_CREATED", "COUPON_CREATED", "LOGIN");
        AuditLogResponse created = all.content().stream().filter(a -> a.action().equals("CATEGORY_CREATED")).findFirst().orElseThrow();
        assertThat(created.actorId()).isEqualTo(admin.getId());
        assertThat(created.actorEmail()).isEqualTo(admin.getEmail());
        assertThat(created.actorRole()).isEqualTo("ADMIN");
        assertThat(created.entityType()).isEqualTo("Category");
        assertThat(created.details()).isEqualTo("Audited");
        assertThat(created.ipAddress()).isEqualTo("127.0.0.1");

        PageResponse<AuditLogResponse> byAction = read(get("/api/admin/audit-logs?action=category_created", adminToken),
                new TypeReference<>() { });
        assertThat(byAction.content()).extracting(AuditLogResponse::action).containsOnly("CATEGORY_CREATED");
        PageResponse<AuditLogResponse> byEntity = read(get("/api/admin/audit-logs?entityType=Coupon&actorId=" + admin.getId(),
                adminToken), new TypeReference<>() { });
        assertThat(byEntity.content()).extracting(AuditLogResponse::action).containsExactly("COUPON_CREATED");
        LocalDate realToday = LocalDate.now();
        PageResponse<AuditLogResponse> byDate = read(get("/api/admin/audit-logs?from=" + realToday.minusDays(1) + "&to=" + realToday
                + "&size=2", adminToken), new TypeReference<>() { });
        assertThat(byDate.content()).hasSize(2);
        assertThat(byDate.totalElements()).isEqualTo(all.totalElements());
        PageResponse<AuditLogResponse> none = read(get("/api/admin/audit-logs?from=" + realToday.plusDays(1), adminToken),
                new TypeReference<>() { });
        assertThat(none.content()).isEmpty();
    }
}
