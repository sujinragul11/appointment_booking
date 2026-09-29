package com.booking.controller;

import com.booking.dto.request.StaffRequest;
import com.booking.dto.response.StaffResponse;
import com.booking.service.StaffService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/staff")
@RequiredArgsConstructor
@Tag(name = "Staff")
public class StaffController {

    private final StaffService staffService;

    @GetMapping("/provider/{providerId}")
    @Operation(summary = "Public: list staff of provider")
    public java.util.List<StaffResponse> listForProvider(@PathVariable Long providerId) {
        return staffService.listByProvider(providerId, false);
    }

    @PostMapping
    @Operation(summary = "Create staff (PROVIDER)")
    public StaffResponse create(@Valid @RequestBody StaffRequest request) {
        return staffService.create(request);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update staff (PROVIDER)")
    public StaffResponse update(@PathVariable Long id, @Valid @RequestBody StaffRequest request) {
        return staffService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Deactivate staff (PROVIDER)")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        staffService.delete(id);
        return ResponseEntity.noContent().build();
    }
}