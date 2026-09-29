package com.booking.controller;

import com.booking.dto.request.AvailabilityRequest;
import com.booking.dto.request.BlockDateRequest;
import com.booking.dto.request.WeeklyAvailabilityRequest;
import com.booking.dto.response.AvailabilityBundleResponse;
import com.booking.dto.response.AvailabilityResponse;
import com.booking.dto.response.BlockedDateResponse;
import com.booking.service.AvailabilityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Weekly hours and blocked dates for providers (whole team) and staff (own hours). */
@RestController
@RequestMapping("/api/availability")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('PROVIDER','STAFF')")
@Tag(name = "Availability")
public class AvailabilityController {

    private final AvailabilityService availabilityService;

    @GetMapping("/me")
    public AvailabilityBundleResponse mine() {
        return availabilityService.mine();
    }

    @PostMapping
    @Operation(summary = "Add a weekly window (FR-14)")
    public AvailabilityResponse add(@Valid @RequestBody AvailabilityRequest request) {
        return availabilityService.add(request);
    }

    @PutMapping("/week")
    @Operation(summary = "Replace the weekly schedule (provider level, or one staff member)")
    public List<AvailabilityResponse> replaceWeek(@Valid @RequestBody WeeklyAvailabilityRequest request) {
        return availabilityService.replaceWeek(request);
    }

    @PutMapping("/{id}")
    public AvailabilityResponse update(@PathVariable Long id, @Valid @RequestBody AvailabilityRequest request) {
        return availabilityService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        availabilityService.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/blocked")
    @Operation(summary = "Block a date / time range (holiday, leave) or set custom hours for a date (FR-15)")
    public BlockedDateResponse block(@Valid @RequestBody BlockDateRequest request) {
        return availabilityService.block(request);
    }

    @DeleteMapping("/blocked/{id}")
    public ResponseEntity<Void> unblock(@PathVariable Long id) {
        availabilityService.unblock(id);
        return ResponseEntity.noContent().build();
    }
}
