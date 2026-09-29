package com.booking.controller;

import com.booking.dto.request.AppointmentRequest;
import com.booking.dto.request.CancelRequest;
import com.booking.dto.request.RescheduleRequest;
import com.booking.dto.request.StatusUpdateRequest;
import com.booking.dto.response.AppointmentResponse;
import com.booking.service.AppointmentService;
import com.booking.service.PaymentService;
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

@RestController
@RequestMapping("/api/appointments")
@RequiredArgsConstructor
@Tag(name = "Appointments")
public class AppointmentController {

    private final AppointmentService appointmentService;
    private final PaymentService paymentService;

    @PostMapping
    @Operation(summary = "Book an appointment (CUSTOMER)")
    public AppointmentResponse create(@Valid @RequestBody AppointmentRequest request) {
        return appointmentService.create(request);
    }

    @GetMapping("/my")
    @Operation(summary = "My appointments (customer)")
    public List<AppointmentResponse> mine() {
        return appointmentService.listMine();
    }

    @GetMapping("/provider")
    @Operation(summary = "Provider's appointments")
    public List<AppointmentResponse> provider() {
        return appointmentService.listForProvider();
    }

    @GetMapping("/provider/today")
    @Operation(summary = "Provider's appointments for a date")
    public List<AppointmentResponse> providerOnDate(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return appointmentService.listForProviderOnDate(date);
    }

    @GetMapping("/{id}")
    public AppointmentResponse get(@PathVariable Long id) {
        return appointmentService.get(id);
    }

    @PutMapping("/{id}/reschedule")
    @Operation(summary = "Reschedule appointment (customer)")
    public AppointmentResponse reschedule(@PathVariable Long id, @Valid @RequestBody RescheduleRequest request) {
        return appointmentService.reschedule(id, request);
    }

    @PutMapping("/{id}/cancel")
    @Operation(summary = "Cancel appointment (customer)")
    public AppointmentResponse cancel(@PathVariable Long id, @RequestBody(required = false) CancelRequest request) {
        return appointmentService.cancel(id, request, false);
    }

    @PutMapping("/{id}/status")
    @Operation(summary = "Update appointment status (provider): CONFIRMED/IN_PROGRESS/COMPLETED/NO_SHOW")
    public AppointmentResponse status(@PathVariable Long id, @Valid @RequestBody StatusUpdateRequest request) {
        return appointmentService.updateStatus(id, request);
    }

    @GetMapping("/{id}/ics")
    @Operation(summary = "Download .ics calendar invite")
    public ResponseEntity<String> ics(@PathVariable Long id) {
        String ics = appointmentService.getIcs(id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=appointment-" + id + ".ics")
                .contentType(MediaType.parseMediaType("text/calendar; charset=utf-8"))
                .body(ics);
    }
}