package com.booking.controller;

import com.booking.dto.request.*;
import com.booking.dto.response.*;
import com.booking.service.AppointmentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@Tag(name = "Appointments")
public class AppointmentController {

    private final AppointmentService appointmentService;

    @PostMapping("/api/slots/hold")
    @PreAuthorize("hasRole('CUSTOMER')")
    @Operation(summary = "Lock a slot for 10 minutes during checkout")
    public SlotHoldResponse hold(@Valid @RequestBody SlotHoldRequest request) {
        return appointmentService.hold(request);
    }

    @DeleteMapping("/api/slots/hold/{token}")
    @PreAuthorize("hasRole('CUSTOMER')")
    public ResponseEntity<Void> releaseHold(@PathVariable String token) {
        appointmentService.releaseHold(token);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/appointments")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize("hasRole('CUSTOMER')")
    @Operation(summary = "Book an appointment (FR-21..26). Race-safe: the slot is re-checked under a lock")
    public AppointmentResponse create(@Valid @RequestBody AppointmentRequest request) {
        return appointmentService.create(request);
    }

    @GetMapping("/api/appointments/my")
    @Operation(summary = "My appointments; scope = upcoming | past | cancelled | all (FR-27)")
    public List<AppointmentResponse> mine(@RequestParam(defaultValue = "all") String scope) {
        return appointmentService.mine(scope);
    }

    @GetMapping("/api/appointments/{id}")
    public AppointmentResponse get(@PathVariable Long id) {
        return appointmentService.get(id);
    }

    @GetMapping("/api/appointments/ref/{ref}")
    public AppointmentResponse byRef(@PathVariable String ref) {
        return appointmentService.getByRef(ref);
    }

    @RequestMapping(value = {"/api/appointments/{id}", "/api/appointments/{id}/reschedule"},
            method = {RequestMethod.PATCH, RequestMethod.PUT})
    @Operation(summary = "Reschedule (FR-28): subject to cut-off and maximum reschedules")
    public AppointmentResponse reschedule(@PathVariable Long id, @Valid @RequestBody RescheduleRequest request) {
        return appointmentService.reschedule(id, request);
    }

    @GetMapping("/api/appointments/{id}/cancellation-preview")
    @Operation(summary = "Policy check before cancelling: allowed? refund amount?")
    public CancellationPreviewResponse cancellationPreview(@PathVariable Long id) {
        return appointmentService.cancellationPreview(id);
    }

    @DeleteMapping("/api/appointments/{id}")
    @Operation(summary = "Cancel with reason; refund per policy (FR-29, FR-39)")
    public AppointmentResponse cancelDelete(@PathVariable Long id, @Valid @RequestBody(required = false) CancelRequest request,
                                            @RequestParam(required = false) String reason) {
        return appointmentService.cancel(id, request != null ? request : new CancelRequest(reason));
    }

    @PutMapping("/api/appointments/{id}/cancel")
    public AppointmentResponse cancel(@PathVariable Long id, @Valid @RequestBody(required = false) CancelRequest request) {
        return appointmentService.cancel(id, request);
    }

    @PutMapping("/api/appointments/{id}/status")
    @Operation(summary = "Provider/staff: CONFIRMED, CANCELLED (reject, needs reason), COMPLETED, NO_SHOW (FR-30, FR-31)")
    public AppointmentResponse status(@PathVariable Long id, @Valid @RequestBody StatusUpdateRequest request) {
        return appointmentService.updateStatus(id, request);
    }

    @PutMapping("/api/appointments/{id}/notes")
    @Operation(summary = "Provider/staff: post-appointment notes or prescription (FR-32)")
    public AppointmentResponse notes(@PathVariable Long id, @Valid @RequestBody ProviderNotesRequest request) {
        return appointmentService.addProviderNotes(id, request);
    }

    @GetMapping("/api/appointments/{id}/ics")
    @Operation(summary = "Download a calendar invite")
    public ResponseEntity<String> ics(@PathVariable Long id) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=appointment-" + id + ".ics")
                .contentType(MediaType.parseMediaType("text/calendar; charset=utf-8"))
                .body(appointmentService.ics(id));
    }

    @GetMapping("/api/appointments/{id}/invoice")
    @Operation(summary = "Download the invoice PDF (FR-40)")
    public ResponseEntity<byte[]> invoice(@PathVariable Long id) {
        var invoice = appointmentService.invoice(id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=" + invoice.filename())
                .contentType(MediaType.APPLICATION_PDF)
                .body(invoice.pdf());
    }
}
