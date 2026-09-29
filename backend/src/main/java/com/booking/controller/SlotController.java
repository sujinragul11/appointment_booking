package com.booking.controller;

import com.booking.dto.request.SlotBlockRequest;
import com.booking.dto.response.SlotResponse;
import com.booking.service.AvailabilityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/slots")
@RequiredArgsConstructor
@Tag(name = "Slots")
public class SlotController {

    private final AvailabilityService availabilityService;

    @GetMapping
    @Operation(summary = "Public: available slots for provider+service(+staff) on a date")
    public List<SlotResponse> slots(
            @RequestParam Long providerId,
            @RequestParam Long serviceId,
            @RequestParam(required = false) Long staffId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return availabilityService.generateSlots(providerId, serviceId, staffId, date);
    }

    @PostMapping("/block")
    @Operation(summary = "Block 30-min slots (PROVIDER)")
    public List<SlotResponse> block(@Valid @RequestBody SlotBlockRequest request) {
        return availabilityService.blockSlots(request);
    }
}