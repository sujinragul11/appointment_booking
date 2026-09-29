package com.booking.controller;

import com.booking.dto.request.*;
import com.booking.dto.response.*;
import com.booking.enums.AppointmentStatus;
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

/** Everything a provider manages about their own business. All routes require ROLE_PROVIDER. */
@RestController
@RequestMapping("/api/provider")
@RequiredArgsConstructor
@Tag(name = "Provider portal")
public class ProviderPortalController {

    private final ProviderService providerService;
    private final CatalogService catalogService;
    private final StaffService staffService;
    private final ReviewService reviewService;
    private final AppointmentService appointmentService;
    private final PaymentService paymentService;
    private final ReportService reportService;

    @GetMapping("/me")
    public ProviderResponse me() {
        return providerService.getMine();
    }

    @PutMapping("/me")
    @Operation(summary = "Profile, timezone, slot rules (interval, per-day / per-slot limits) and policies (FR-13, FR-16, FR-17)")
    public ProviderResponse update(@Valid @RequestBody ProviderRequest request) {
        return providerService.updateMine(request);
    }

    @GetMapping("/stats")
    public ProviderStatsResponse stats() {
        return providerService.stats();
    }

    @GetMapping("/earnings")
    public EarningsResponse earnings() {
        return paymentService.earnings();
    }

    @GetMapping("/reports")
    public ReportResponse report(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                 @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return reportService.bookings(from, to, providerService.current().getId());
    }

    // ---- branches
    @GetMapping("/branches")
    public List<BranchResponse> branches() {
        return providerService.branches();
    }

    @PostMapping("/branches")
    public BranchResponse addBranch(@Valid @RequestBody BranchRequest request) {
        return providerService.addBranch(request);
    }

    @DeleteMapping("/branches/{id}")
    public ResponseEntity<Void> deleteBranch(@PathVariable Long id) {
        providerService.deleteBranch(id);
        return ResponseEntity.noContent().build();
    }

    // ---- services
    @GetMapping("/services")
    public List<ServiceResponse> services() {
        return catalogService.mine();
    }

    @PostMapping("/services")
    public ServiceResponse createService(@Valid @RequestBody ServiceRequest request) {
        return catalogService.createMine(request);
    }

    @PutMapping("/services/{id}")
    public ServiceResponse updateService(@PathVariable Long id, @Valid @RequestBody ServiceRequest request) {
        return catalogService.updateMine(id, request);
    }

    @PatchMapping("/services/{id}/active")
    public ServiceResponse serviceActive(@PathVariable Long id, @Valid @RequestBody ActiveRequest request) {
        return catalogService.setActiveMine(id, request.active());
    }

    // ---- staff
    @GetMapping("/staff")
    public List<StaffResponse> staff() {
        return staffService.mine();
    }

    @PostMapping("/staff")
    @Operation(summary = "Add a staff member; with an e-mail, a STAFF login is created and a set-password link sent")
    public StaffResponse createStaff(@Valid @RequestBody StaffRequest request) {
        return staffService.create(request);
    }

    @PutMapping("/staff/{id}")
    public StaffResponse updateStaff(@PathVariable Long id, @Valid @RequestBody StaffRequest request) {
        return staffService.update(id, request);
    }

    @DeleteMapping("/staff/{id}")
    public ResponseEntity<Void> deactivateStaff(@PathVariable Long id) {
        staffService.deactivate(id);
        return ResponseEntity.noContent().build();
    }

    // ---- reviews
    @GetMapping("/reviews")
    public List<ReviewResponse> reviews() {
        return reviewService.mine();
    }

    @PutMapping("/reviews/{id}/reply")
    public ReviewResponse reply(@PathVariable Long id, @Valid @RequestBody ReplyRequest request) {
        return reviewService.reply(id, request.reply());
    }

    // ---- appointments
    @GetMapping("/appointments")
    public PageResponse<AppointmentResponse> appointments(
            @RequestParam(required = false) AppointmentStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long staffId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        return appointmentService.forProvider(status, from, to, q, staffId, page, size);
    }

    @GetMapping("/appointments/day")
    @Operation(summary = "Schedule for one day")
    public List<AppointmentResponse> day(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return appointmentService.forProviderOnDate(date);
    }

    @GetMapping("/appointments/export")
    public ResponseEntity<byte[]> export(@RequestParam(defaultValue = "csv") String format,
                                         @RequestParam(required = false) AppointmentStatus status,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                         @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        var f = ExportService.format(format);
        return AdminController.file(appointmentService.exportForCurrentProvider(status, from, to, f), "appointments", f);
    }

    @PostMapping("/appointments/{id}/collect")
    @Operation(summary = "Record the amount collected at the venue")
    public PaymentResponse collect(@PathVariable Long id) {
        return paymentService.markCollected(id);
    }
}
