package com.booking.controller;

import com.booking.dto.request.*;
import com.booking.dto.response.*;
import com.booking.enums.AppointmentStatus;
import com.booking.enums.ProviderStatus;
import com.booking.enums.ServiceMode;
import com.booking.enums.UserRole;
import com.booking.service.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** Admin panel API (FR-9..12, FR-44..48). All routes require ROLE_ADMIN. */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@Tag(name = "Admin")
public class AdminController {

    private final AdminService adminService;
    private final ProviderService providerService;
    private final CatalogService catalogService;
    private final CategoryService categoryService;
    private final CouponService couponService;
    private final AppointmentService appointmentService;
    private final ReportService reportService;
    private final ExportService exportService;
    private final ReviewService reviewService;
    private final AuditService auditService;

    @GetMapping("/stats")
    public StatsResponse stats() {
        return adminService.stats();
    }

    // ---------------------------------------------------------------- users (FR-44)
    @GetMapping("/users")
    public PageResponse<UserResponse> users(@RequestParam(required = false) String q,
                                            @RequestParam(required = false) UserRole role,
                                            @RequestParam(required = false) Boolean active,
                                            @RequestParam(defaultValue = "0") int page,
                                            @RequestParam(defaultValue = "20") int size) {
        return adminService.users(q, role, active, page, size);
    }

    @PatchMapping("/users/{id}/active")
    public UserResponse setActive(@PathVariable Long id, @Valid @RequestBody ActiveRequest request) {
        return adminService.setActive(id, request.active());
    }

    @DeleteMapping("/users/{id}")
    @Operation(summary = "Delete (anonymise) a user; booking history is kept")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        adminService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/users/export")
    public ResponseEntity<byte[]> exportUsers(@RequestParam(defaultValue = "csv") String format) {
        var f = ExportService.format(format);
        return file(exportService.users(adminService.exportUsers(), f), "users", f);
    }

    // ---------------------------------------------------------------- providers
    @GetMapping("/providers")
    public PageResponse<ProviderResponse> providers(@RequestParam(required = false) ProviderStatus status,
                                                    @RequestParam(required = false) String q,
                                                    @RequestParam(defaultValue = "0") int page,
                                                    @RequestParam(defaultValue = "20") int size) {
        return providerService.adminList(status, q, page, size);
    }

    @PutMapping("/providers/{id}/decision")
    @Operation(summary = "Approve (VERIFIED), reject or suspend a provider")
    public ProviderResponse decide(@PathVariable Long id, @Valid @RequestBody AdminProviderDecision decision) {
        return providerService.decide(id, decision);
    }

    // ---------------------------------------------------------------- services (FR-9..11)
    @GetMapping("/services")
    public PageResponse<ServiceResponse> services(@RequestParam(required = false) String q,
                                                  @RequestParam(required = false) Long categoryId,
                                                  @RequestParam(required = false) Long providerId,
                                                  @RequestParam(required = false) Boolean active,
                                                  @RequestParam(required = false) ServiceMode mode,
                                                  @RequestParam(defaultValue = "0") int page,
                                                  @RequestParam(defaultValue = "20") int size) {
        return catalogService.adminSearch(new CatalogService.Filter(q, categoryId, providerId, null, null, mode, null, active, null),
                page, size);
    }

    @PostMapping("/services")
    @Operation(summary = "Create a service and assign it to a provider (providerId)")
    public ServiceResponse createService(@Valid @RequestBody ServiceRequest request) {
        return catalogService.adminCreate(request);
    }

    @PutMapping("/services/{id}")
    @Operation(summary = "Update a service; a different providerId re-assigns it")
    public ServiceResponse updateService(@PathVariable Long id, @Valid @RequestBody ServiceRequest request) {
        return catalogService.adminUpdate(id, request);
    }

    @PatchMapping("/services/{id}/active")
    @Operation(summary = "Enable / disable a service")
    public ServiceResponse serviceActive(@PathVariable Long id, @Valid @RequestBody ActiveRequest request) {
        return catalogService.adminSetActive(id, request.active());
    }

    @PostMapping("/services/{id}/assign")
    @Operation(summary = "Assign (copy) this service to another provider")
    public ServiceResponse assign(@PathVariable Long id, @Valid @RequestBody AssignServiceRequest request) {
        return catalogService.assignCopy(id, request.providerId());
    }

    @DeleteMapping("/services/{id}")
    public ResponseEntity<Void> deleteService(@PathVariable Long id) {
        catalogService.adminDelete(id);
        return ResponseEntity.noContent().build();
    }

    // ---------------------------------------------------------------- categories (FR-12)
    @PostMapping("/categories")
    public CategoryResponse createCategory(@Valid @RequestBody CategoryRequest request) {
        return categoryService.create(request);
    }

    @PutMapping("/categories/{id}")
    public CategoryResponse updateCategory(@PathVariable Long id, @Valid @RequestBody CategoryRequest request) {
        return categoryService.update(id, request);
    }

    @DeleteMapping("/categories/{id}")
    public ResponseEntity<Void> deleteCategory(@PathVariable Long id) {
        categoryService.delete(id);
        return ResponseEntity.noContent().build();
    }

    // ---------------------------------------------------------------- appointments (FR-45)
    @GetMapping("/appointments")
    public PageResponse<AppointmentResponse> appointments(
            @RequestParam(required = false) Long providerId,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) AppointmentStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return appointmentService.adminSearch(providerId, status, from, to, q, customerId, page, size);
    }

    @GetMapping("/appointments/export")
    @Operation(summary = "Export appointments as CSV or PDF (FR-47)")
    public ResponseEntity<byte[]> exportAppointments(
            @RequestParam(defaultValue = "csv") String format,
            @RequestParam(required = false) Long providerId,
            @RequestParam(required = false) AppointmentStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String q) {
        var f = ExportService.format(format);
        return file(appointmentService.export(providerId, status, from, to, q, f), "appointments", f);
    }

    // ---------------------------------------------------------------- reports (FR-46, FR-47)
    @GetMapping("/reports/bookings")
    @Operation(summary = "Revenue, bookings, cancellations and peak hours for a date range")
    public ReportResponse report(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                 @RequestParam(required = false) Long providerId) {
        return reportService.bookings(from, to, providerId);
    }

    @GetMapping("/reports/bookings/export")
    public ResponseEntity<byte[]> exportReport(@RequestParam(defaultValue = "csv") String format,
                                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                               @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                               @RequestParam(required = false) Long providerId) {
        var f = ExportService.format(format);
        return file(exportService.report(reportService.bookings(from, to, providerId), f), "booking-report", f);
    }

    // ---------------------------------------------------------------- reviews (FR-42)
    @GetMapping("/reviews")
    public PageResponse<ReviewResponse> reviews(@RequestParam(defaultValue = "PENDING") String filter,
                                                @RequestParam(defaultValue = "0") int page,
                                                @RequestParam(defaultValue = "20") int size) {
        return reviewService.moderationQueue(filter, page, size);
    }

    @PutMapping("/reviews/{id}/moderate")
    public ReviewResponse moderate(@PathVariable Long id, @Valid @RequestBody ModerateReviewRequest request) {
        return reviewService.moderate(id, request);
    }

    // ---------------------------------------------------------------- coupons
    @GetMapping("/coupons")
    public List<CouponResponse> coupons() {
        return couponService.listAll();
    }

    @PostMapping("/coupons")
    public CouponResponse createCoupon(@Valid @RequestBody CouponRequest request) {
        return couponService.create(request);
    }

    @PutMapping("/coupons/{id}")
    public CouponResponse updateCoupon(@PathVariable Long id, @Valid @RequestBody CouponRequest request) {
        return couponService.update(id, request);
    }

    @DeleteMapping("/coupons/{id}")
    public ResponseEntity<Void> deleteCoupon(@PathVariable Long id) {
        couponService.delete(id);
        return ResponseEntity.noContent().build();
    }

    // ---------------------------------------------------------------- audit logs (FR-48)
    @GetMapping("/audit-logs")
    public PageResponse<AuditLogResponse> auditLogs(@RequestParam(required = false) String action,
                                                    @RequestParam(required = false) Long actorId,
                                                    @RequestParam(required = false) String entityType,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                    @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                                    @RequestParam(defaultValue = "0") int page,
                                                    @RequestParam(defaultValue = "50") int size) {
        return auditService.search(action, actorId, entityType, from, to, page, size);
    }

    static ResponseEntity<byte[]> file(byte[] body, String name, ExportService.Format f) {
        String filename = name + "-" + LocalDate.now() + (f == ExportService.Format.CSV ? ".csv" : ".pdf");
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + filename)
                .contentType(f == ExportService.Format.CSV ? MediaType.parseMediaType("text/csv; charset=utf-8") : MediaType.APPLICATION_PDF)
                .body(body);
    }
}
