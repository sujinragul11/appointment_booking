package com.booking.controller;

import com.booking.dto.request.AvailabilityRequest;
import com.booking.dto.request.OverrideRequest;
import com.booking.dto.response.AvailabilityBundleResponse;
import com.booking.dto.response.AvailabilityResponse;
import com.booking.dto.response.OverrideResponse;
import com.booking.service.AvailabilityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/availability")
@RequiredArgsConstructor
@Tag(name = "Availability")
public class AvailabilityController {

    private final AvailabilityService availabilityService;

    @GetMapping("/{providerId}")
    @Operation(summary = "Public: availability + overrides of provider")
    public AvailabilityBundleResponse bundle(@PathVariable Long providerId) {
        return availabilityService.getBundle(providerId);
    }

    @PostMapping
    @Operation(summary = "Upsert weekly availability (PROVIDER)")
    public AvailabilityResponse save(@Valid @RequestBody AvailabilityRequest request) {
        return availabilityService.save(request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        availabilityService.deleteAvailability(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/override")
    @Operation(summary = "Add custom date override (PROVIDER)")
    public OverrideResponse addOverride(@Valid @RequestBody OverrideRequest request) {
        return availabilityService.addOverride(request);
    }

    @DeleteMapping("/override/{id}")
    public ResponseEntity<Void> deleteOverride(@PathVariable Long id) {
        availabilityService.deleteOverride(id);
        return ResponseEntity.noContent().build();
    }
}