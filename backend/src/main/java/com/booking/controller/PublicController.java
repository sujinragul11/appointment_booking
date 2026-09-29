package com.booking.controller;

import com.booking.dto.response.*;
import com.booking.enums.ServiceMode;
import com.booking.payment.RazorpayGateway;
import com.booking.security.GoogleTokenVerifier;
import com.booking.service.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/** Endpoints available to guests: browse, search and view availability (FR-18..20, FR-49, FR-50). */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Public catalogue")
public class PublicController {

    private final CategoryService categoryService;
    private final ProviderService providerService;
    private final CatalogService catalogService;
    private final StaffService staffService;
    private final ReviewService reviewService;
    private final AvailabilityService availabilityService;
    private final AppointmentService appointmentService;
    private final CouponService couponService;
    private final UploadService uploadService;
    private final GoogleTokenVerifier googleTokenVerifier;
    private final RazorpayGateway razorpayGateway;

    @Value("${app.name:Sloto}")
    private String appName;

    @Value("${app.payments.currency:INR}")
    private String currency;

    @GetMapping("/config")
    @Operation(summary = "Public client configuration (feature flags, public keys)")
    public Map<String, Object> config() {
        return Map.of(
                "appName", appName,
                "googleClientId", googleTokenVerifier.isEnabled() ? googleTokenVerifier.getClientId() : "",
                "onlinePayments", razorpayGateway.isAvailable(),
                "paymentsDemoMode", razorpayGateway.isAvailable() && !razorpayGateway.isLive(),
                "razorpayKeyId", razorpayGateway.publicKey() == null ? "" : razorpayGateway.publicKey(),
                "currency", currency,
                "languages", List.of("en", "hi", "ta"));
    }

    @GetMapping("/categories")
    public List<CategoryResponse> categories() {
        return categoryService.list();
    }

    @GetMapping("/providers")
    @Operation(summary = "Search providers: q (service/provider/location), categoryId, city, minRating, minPrice, maxPrice, serviceId, date, mode, sort")
    public PageResponse<ProviderResponse> providers(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String city,
            @RequestParam(required = false) Double minRating,
            @RequestParam(required = false) Double minPrice,
            @RequestParam(required = false) Double maxPrice,
            @RequestParam(required = false) Long serviceId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) String mode,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return providerService.search(new ProviderService.SearchCriteria(q, categoryId, city, minRating, minPrice, maxPrice,
                serviceId, date, mode, sort), page, size);
    }

    @GetMapping("/providers/nearby")
    public List<ProviderResponse> nearby(@RequestParam double lat, @RequestParam double lng,
                                         @RequestParam(defaultValue = "20") double radius) {
        return providerService.nearby(lat, lng, radius);
    }

    @GetMapping("/providers/{id}")
    @Operation(summary = "Provider profile with services, staff, branches, rating and policy (FR-13)")
    public ProviderResponse provider(@PathVariable Long id) {
        return providerService.getPublic(id);
    }

    @GetMapping("/providers/{id}/services")
    public List<ServiceResponse> providerServices(@PathVariable Long id) {
        return catalogService.listForProvider(id);
    }

    @GetMapping("/providers/{id}/staff")
    public List<StaffResponse> providerStaff(@PathVariable Long id) {
        return staffService.publicList(id);
    }

    @GetMapping({"/providers/{id}/reviews", "/reviews/provider/{id}"})
    public List<ReviewResponse> providerReviews(@PathVariable Long id) {
        return reviewService.publicList(id);
    }

    @GetMapping("/providers/{id}/availability")
    public AvailabilityBundleResponse providerAvailability(@PathVariable Long id) {
        return availabilityService.publicBundle(id);
    }

    @GetMapping("/providers/{id}/slots")
    @Operation(summary = "Real-time slots for a date (FR-20). serviceId defaults to the provider's first service")
    public SlotsResponse providerSlots(@PathVariable Long id,
                                       @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
                                       @RequestParam(required = false) Long serviceId,
                                       @RequestParam(required = false) Long staffId) {
        Long sid = serviceId;
        if (sid == null) {
            sid = catalogService.listForProvider(id).stream().findFirst().map(ServiceResponse::id)
                    .orElseThrow(() -> com.booking.exception.ApiException.notFound("This provider has no bookable services"));
        }
        return appointmentService.slots(id, sid, staffId, date);
    }

    @GetMapping("/slots")
    @Operation(summary = "Real-time slots for provider + service (+ staff) on a date")
    public SlotsResponse slots(@RequestParam Long providerId, @RequestParam Long serviceId,
                               @RequestParam(required = false) Long staffId,
                               @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return appointmentService.slots(providerId, serviceId, staffId, date);
    }

    @GetMapping("/services")
    @Operation(summary = "Browse / search services (FR-18): q, categoryId, providerId, minPrice, maxPrice, mode, city, sort")
    public PageResponse<ServiceResponse> services(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) Long providerId,
            @RequestParam(required = false) Double minPrice,
            @RequestParam(required = false) Double maxPrice,
            @RequestParam(required = false) ServiceMode mode,
            @RequestParam(required = false) String city,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return catalogService.browse(new CatalogService.Filter(q, categoryId, providerId, minPrice, maxPrice, mode, city, true, sort),
                page, size);
    }

    @GetMapping("/services/{id}")
    public ServiceResponse service(@PathVariable Long id) {
        return catalogService.getPublic(id);
    }

    @GetMapping("/staff/provider/{providerId}")
    public List<StaffResponse> staff(@PathVariable Long providerId) {
        return staffService.publicList(providerId);
    }

    @GetMapping("/coupons/validate")
    @Operation(summary = "Preview a coupon discount (does not consume it)")
    public CouponValidateResponse validateCoupon(@RequestParam String code, @RequestParam double amount) {
        return couponService.validate(code, amount);
    }

    @GetMapping("/uploads/{name}")
    public ResponseEntity<Resource> upload(@PathVariable String name) {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(UploadService.contentType(name)))
                .cacheControl(CacheControl.maxAge(30, TimeUnit.DAYS).cachePublic())
                .header("X-Content-Type-Options", "nosniff")
                .body(uploadService.load(name));
    }
}
