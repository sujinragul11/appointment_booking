package com.booking.api;

import com.booking.dto.response.CategoryResponse;
import com.booking.dto.response.CouponResponse;
import com.booking.dto.response.PageResponse;
import com.booking.dto.response.ServiceResponse;
import com.booking.entity.Category;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.Staff;
import com.booking.enums.DiscountType;
import com.booking.enums.PaymentMethod;
import com.booking.enums.ServiceMode;
import com.booking.repository.DomainServiceRepository;
import com.booking.support.IntegrationTestBase;
import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Admin catalogue management: services (CRUD, assignment, enable/disable, delete), categories and coupons. */
class AdminCatalogApiTest extends IntegrationTestBase {

    @Autowired private DomainServiceRepository serviceRepository;

    private String adminToken;
    private Provider provider;
    private Provider otherProvider;

    @BeforeEach
    void setUp() {
        adminToken = auth.token(data.admin());
        provider = data.provider("Alpha Clinic", "UTC");
        otherProvider = data.provider("Beta Clinic", "UTC");
    }

    private Map<String, Object> serviceBody(Long providerId, String name, double price) {
        Map<String, Object> body = new HashMap<>();
        if (providerId != null) body.put("providerId", providerId);
        body.put("name", name);
        body.put("description", name + " details");
        body.put("durationMin", 45);
        body.put("bufferMin", 15);
        body.put("price", price);
        return body;
    }

    // ------------------------------------------------------------------ services

    @Test
    void adminCreatesAndUpdatesServicesForAProvider() throws Exception {
        Category dental = data.category("Dental");
        post("/api/admin/services", adminToken, serviceBody(null, "Orphan", 100))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("providerId is required"));
        post("/api/admin/services", adminToken, serviceBody(999_999L, "Ghost", 100))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Provider not found"));
        Map<String, Object> badCategory = serviceBody(provider.getId(), "Cleaning", 100);
        badCategory.put("categoryId", 999_999);
        post("/api/admin/services", adminToken, badCategory)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Unknown category"));
        Map<String, Object> invalid = serviceBody(provider.getId(), "", -5);
        invalid.put("durationMin", 1);
        post("/api/admin/services", adminToken, invalid)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.name").exists())
                .andExpect(jsonPath("$.errors.price").exists())
                .andExpect(jsonPath("$.errors.durationMin").exists());

        Map<String, Object> body = serviceBody(provider.getId(), "  Cleaning  ", 1200);
        body.put("categoryId", dental.getId());
        body.put("depositPercent", 20);
        body.put("mode", "BOTH");
        body.put("imageUrl", "https://img.example/clean.png");
        body.put("maxAdvanceBookingDays", 60);
        ServiceResponse created = read(post("/api/admin/services", adminToken, body).andExpect(status().isOk()),
                ServiceResponse.class);
        assertThat(created.providerId()).isEqualTo(provider.getId());
        assertThat(created.providerName()).isEqualTo("Alpha Clinic");
        assertThat(created.name()).isEqualTo("Cleaning");
        assertThat(created.durationMin()).isEqualTo(45);
        assertThat(created.bufferMin()).isEqualTo(15);
        assertThat(created.price()).isEqualTo(1200);
        assertThat(created.depositPercent()).isEqualTo(20);
        assertThat(created.mode()).isEqualTo(ServiceMode.BOTH);
        assertThat(created.categoryName()).isEqualTo("Dental");
        assertThat(created.maxAdvanceBookingDays()).isEqualTo(60);
        assertThat(created.active()).isTrue();

        Map<String, Object> update = serviceBody(null, "Deep cleaning", 1500);
        update.put("imageUrl", "");
        ServiceResponse updated = read(put("/api/admin/services/" + created.id(), adminToken, update)
                .andExpect(status().isOk()), ServiceResponse.class);
        assertThat(updated.name()).isEqualTo("Deep cleaning");
        assertThat(updated.price()).isEqualTo(1500);
        assertThat(updated.categoryId()).isNull();
        assertThat(updated.imageUrl()).isNull();
        assertThat(updated.providerId()).isEqualTo(provider.getId());

        // a different providerId re-assigns the service and drops staff links
        Staff alice = data.staff(provider, "Alice");
        data.assignStaff(serviceRepository.findById(created.id()).orElseThrow(), alice);
        ServiceResponse moved = read(put("/api/admin/services/" + created.id(), adminToken,
                serviceBody(otherProvider.getId(), "Deep cleaning", 1500)).andExpect(status().isOk()), ServiceResponse.class);
        assertThat(moved.providerId()).isEqualTo(otherProvider.getId());
        assertThat(moved.staffIds()).isEmpty();
        put("/api/admin/services/999999", adminToken, serviceBody(null, "X", 1)).andExpect(status().isNotFound());
        put("/api/admin/services/" + created.id(), adminToken, serviceBody(999_999L, "X", 1)).andExpect(status().isBadRequest());
    }

    @Test
    void staffOfAnotherProviderCannotBeAttached() throws Exception {
        Staff foreign = data.staff(otherProvider, "Foreign");
        Staff own = data.staff(provider, "Own");
        Map<String, Object> body = serviceBody(provider.getId(), "Massage", 900);
        body.put("staffIds", List.of(foreign.getId()));

        post("/api/admin/services", adminToken, body)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Staff must belong to the same provider"));
        body.put("staffIds", List.of(own.getId(), 999_999));
        post("/api/admin/services", adminToken, body).andExpect(status().isBadRequest());

        body.put("staffIds", List.of(own.getId()));
        ServiceResponse ok = read(post("/api/admin/services", adminToken, body).andExpect(status().isOk()), ServiceResponse.class);
        assertThat(ok.staffIds()).containsExactly(own.getId());
        assertThat(ok.staffNames()).containsExactly("Own");
    }

    @Test
    void servicesCanBeSearchedEnabledDisabledAndCopied() throws Exception {
        DomainService massage = data.service(provider, "Thai Massage", 60, 0, 2000, s -> s.setMode(ServiceMode.IN_PERSON));
        DomainService video = data.service(otherProvider, "Video Therapy", 30, 0, 800, s -> s.setMode(ServiceMode.ONLINE));

        PageResponse<ServiceResponse> byProvider = read(get("/api/admin/services?providerId=" + provider.getId(), adminToken)
                .andExpect(status().isOk()), new TypeReference<>() { });
        assertThat(byProvider.content()).extracting(ServiceResponse::id).containsExactly(massage.getId());
        PageResponse<ServiceResponse> online = read(get("/api/admin/services?mode=ONLINE&q=therapy", adminToken),
                new TypeReference<>() { });
        assertThat(online.content()).extracting(ServiceResponse::id).containsExactly(video.getId());

        ServiceResponse disabled = read(patch("/api/admin/services/" + massage.getId() + "/active", adminToken,
                Map.of("active", false)).andExpect(status().isOk()), ServiceResponse.class);
        assertThat(disabled.active()).isFalse();
        get("/api/services/{id}", null, massage.getId()).andExpect(status().isNotFound());
        PageResponse<ServiceResponse> inactive = read(get("/api/admin/services?active=false", adminToken), new TypeReference<>() { });
        assertThat(inactive.content()).extracting(ServiceResponse::id).containsExactly(massage.getId());
        patch("/api/admin/services/" + massage.getId() + "/active", adminToken, Map.of("active", true)).andExpect(status().isOk());
        get("/api/services/{id}", null, massage.getId()).andExpect(status().isOk());
        patch("/api/admin/services/999999/active", adminToken, Map.of("active", true)).andExpect(status().isNotFound());

        ServiceResponse copy = read(post("/api/admin/services/" + massage.getId() + "/assign", adminToken,
                Map.of("providerId", otherProvider.getId())).andExpect(status().isOk()), ServiceResponse.class);
        assertThat(copy.id()).isNotEqualTo(massage.getId());
        assertThat(copy.providerId()).isEqualTo(otherProvider.getId());
        assertThat(copy.name()).isEqualTo("Thai Massage");
        assertThat(copy.price()).isEqualTo(2000);
        assertThat(copy.durationMin()).isEqualTo(60);
        post("/api/admin/services/" + massage.getId() + "/assign", adminToken, Map.of("providerId", provider.getId()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Service already belongs to this provider"));
        post("/api/admin/services/999999/assign", adminToken, Map.of("providerId", provider.getId()))
                .andExpect(status().isNotFound());
        post("/api/admin/services/" + massage.getId() + "/assign", adminToken, Map.of("providerId", 999_999))
                .andExpect(status().isBadRequest());
    }

    @Test
    void servicesWithBookingsCannotBeDeleted() throws Exception {
        data.openAllWeek(provider, LocalTime.of(9, 0), LocalTime.of(17, 0));
        Staff alice = data.staff(provider, "Alice");
        DomainService booked = data.service(provider, "Booked", 30, 0, 100);
        DomainService unused = data.service(provider, "Unused", 30, 0, 100);
        data.assignStaff(unused, alice);
        book(auth.token(data.customer()), provider.getId(), booked.getId(), inDays(1), "10:00", PaymentMethod.PAY_AT_VENUE);

        delete("/api/admin/services/" + booked.getId(), adminToken)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Service has bookings; disable it instead of deleting"));
        assertThat(serviceRepository.existsById(booked.getId())).isTrue();

        delete("/api/admin/services/" + unused.getId(), adminToken).andExpect(status().isNoContent());
        assertThat(serviceRepository.existsById(unused.getId())).isFalse();
        delete("/api/admin/services/" + unused.getId(), adminToken).andExpect(status().isNotFound());
    }

    // ------------------------------------------------------------------ categories

    @Test
    void categoriesCrudWithUniqueNamesAndSlugs() throws Exception {
        CategoryResponse dental = read(post("/api/admin/categories", adminToken,
                Map.of("name", " Dental Care ", "icon", "tooth", "description", "Teeth")).andExpect(status().isOk()),
                CategoryResponse.class);
        assertThat(dental.name()).isEqualTo("Dental Care");
        assertThat(dental.slug()).isEqualTo("dental-care");

        post("/api/admin/categories", adminToken, Map.of("name", "dental care"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Category already exists"));
        CategoryResponse similar = read(post("/api/admin/categories", adminToken, Map.of("name", "Dental  Care!"))
                .andExpect(status().isOk()), CategoryResponse.class);
        assertThat(similar.slug()).isEqualTo("dental-care-2");
        CategoryResponse accented = read(post("/api/admin/categories", adminToken, Map.of("name", "Café"))
                .andExpect(status().isOk()), CategoryResponse.class);
        assertThat(accented.slug()).isEqualTo("cafe");
        CategoryResponse symbols = read(post("/api/admin/categories", adminToken, Map.of("name", "!!!"))
                .andExpect(status().isOk()), CategoryResponse.class);
        assertThat(symbols.slug()).isEqualTo("category");
        post("/api/admin/categories", adminToken, Map.of("name", "")).andExpect(status().isBadRequest());

        // public list (cached) reflects changes
        List<CategoryResponse> publicList = read(get("/api/categories", null).andExpect(status().isOk()), new TypeReference<>() { });
        assertThat(publicList).extracting(CategoryResponse::name).containsExactly("!!!", "Café", "Dental  Care!", "Dental Care");

        CategoryResponse renamed = read(put("/api/admin/categories/" + dental.id(), adminToken,
                Map.of("name", "Dentistry", "icon", "smile")).andExpect(status().isOk()), CategoryResponse.class);
        assertThat(renamed.slug()).isEqualTo("dentistry");
        assertThat(renamed.icon()).isEqualTo("smile");
        put("/api/admin/categories/" + dental.id(), adminToken, Map.of("name", "CAFÉ"))
                .andExpect(status().isConflict());
        put("/api/admin/categories/" + dental.id(), adminToken, Map.of("name", "dentistry"))
                .andExpect(status().isOk());
        put("/api/admin/categories/999999", adminToken, Map.of("name", "Nope")).andExpect(status().isNotFound());
        List<CategoryResponse> afterRename = read(get("/api/categories", null), new TypeReference<>() { });
        assertThat(afterRename).extracting(CategoryResponse::name).contains("dentistry").doesNotContain("Dental Care");

        delete("/api/admin/categories/" + symbols.id(), adminToken).andExpect(status().isNoContent());
        delete("/api/admin/categories/" + symbols.id(), adminToken).andExpect(status().isNotFound());
        assertThat(read(get("/api/categories", null), new TypeReference<List<CategoryResponse>>() { }))
                .extracting(CategoryResponse::name).doesNotContain("!!!");
    }

    @Test
    @Disabled("BUG: CategoryService.uniqueSlug (src/main/java/com/booking/service/CategoryService.java:81-82) NFD-normalises "
            + "the name but never strips the combining accent marks, so they are replaced by dashes and accented words are "
            + "split: 'Crème Brûlée' becomes 'cre-me-bru-le-e'. Fix: remove \\p{M} after normalising, before the [^a-z0-9] replacement.")
    void accentedCategoryNamesGetTransliteratedSlugs() throws Exception {
        CategoryResponse dessert = read(post("/api/admin/categories", adminToken, Map.of("name", "Crème Brûlée"))
                .andExpect(status().isOk()), CategoryResponse.class);

        assertThat(dessert.slug()).isEqualTo("creme-brulee");
    }

    @Test
    void categoriesInUseCannotBeDeleted() throws Exception {
        Category byProvider = data.category("Physio");
        Category byService = data.category("Yoga");
        data.updateProvider(provider.getId(), p -> p.setCategory(byProvider));
        data.service(otherProvider, "Morning Yoga", 60, 0, 300, s -> s.setCategory(byService));

        delete("/api/admin/categories/" + byProvider.getId(), adminToken)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Category is in use by providers or services; reassign them first"));
        delete("/api/admin/categories/" + byService.getId(), adminToken).andExpect(status().isConflict());
    }

    // ------------------------------------------------------------------ coupons

    private Map<String, Object> couponBody(String code, String type, double value) {
        Map<String, Object> body = new HashMap<>();
        body.put("code", code);
        body.put("discountType", type);
        body.put("value", value);
        body.put("minOrder", 0);
        body.put("maxDiscount", 0);
        body.put("usageLimit", 0);
        return body;
    }

    @Test
    void couponsCrud() throws Exception {
        Map<String, Object> body = couponBody("summer-25", "PERCENT", 25);
        body.put("usageLimit", 100);
        body.put("perUserLimit", 1);
        body.put("minOrder", 500);
        body.put("maxDiscount", 400);
        body.put("validFrom", "2030-01-01");
        body.put("validTo", "2030-12-31");
        CouponResponse created = read(post("/api/admin/coupons", adminToken, body).andExpect(status().isOk()), CouponResponse.class);
        assertThat(created.code()).isEqualTo("SUMMER-25");
        assertThat(created.discountType()).isEqualTo(DiscountType.PERCENT);
        assertThat(created.value()).isEqualTo(25);
        assertThat(created.usageLimit()).isEqualTo(100);
        assertThat(created.perUserLimit()).isEqualTo(1);
        assertThat(created.minOrder()).isEqualTo(500);
        assertThat(created.maxDiscount()).isEqualTo(400);
        assertThat(created.validFrom()).isEqualTo(LocalDate.of(2030, 1, 1));
        assertThat(created.usedCount()).isZero();
        assertThat(created.active()).isTrue();

        post("/api/admin/coupons", adminToken, couponBody("Summer-25", "FLAT", 10))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Coupon code already exists"));
        post("/api/admin/coupons", adminToken, couponBody("TOO-MUCH", "PERCENT", 150))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Percentage discount cannot exceed 100"));
        Map<String, Object> backwards = couponBody("BACKWARDS", "FLAT", 10);
        backwards.put("validFrom", "2030-05-01");
        backwards.put("validTo", "2030-04-01");
        post("/api/admin/coupons", adminToken, backwards)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("validTo must be on or after validFrom"));
        post("/api/admin/coupons", adminToken, couponBody("a b", "FLAT", 10))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.code").value("Code must be 3-40 letters, digits, - or _"));
        post("/api/admin/coupons", adminToken, couponBody("ZERO", "FLAT", 0)).andExpect(status().isBadRequest());

        CouponResponse flat = read(post("/api/admin/coupons", adminToken, couponBody("flat50", "FLAT", 50))
                .andExpect(status().isOk()), CouponResponse.class);
        Map<String, Object> change = couponBody("flat75", "FLAT", 75);
        change.put("active", false);
        CouponResponse updated = read(put("/api/admin/coupons/" + flat.id(), adminToken, change).andExpect(status().isOk()),
                CouponResponse.class);
        assertThat(updated.code()).isEqualTo("FLAT75");
        assertThat(updated.value()).isEqualTo(75);
        assertThat(updated.active()).isFalse();
        put("/api/admin/coupons/" + flat.id(), adminToken, couponBody("summer-25", "FLAT", 75)).andExpect(status().isConflict());
        put("/api/admin/coupons/999999", adminToken, couponBody("NEWCODE", "FLAT", 5)).andExpect(status().isNotFound());

        List<CouponResponse> list = read(get("/api/admin/coupons", adminToken).andExpect(status().isOk()), new TypeReference<>() { });
        assertThat(list).extracting(CouponResponse::code).containsExactly("FLAT75", "SUMMER-25");

        delete("/api/admin/coupons/" + flat.id(), adminToken).andExpect(status().isNoContent());
        delete("/api/admin/coupons/" + flat.id(), adminToken).andExpect(status().isNotFound());
        assertThat(read(get("/api/admin/coupons", adminToken), new TypeReference<List<CouponResponse>>() { })).hasSize(1);
    }
}
