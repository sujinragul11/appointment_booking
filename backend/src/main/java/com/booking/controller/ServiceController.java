package com.booking.controller;

import com.booking.dto.request.ServiceRequest;
import com.booking.dto.response.ServiceResponse;
import com.booking.service.ServiceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/services")
@RequiredArgsConstructor
@Tag(name = "Services")
public class ServiceController {

    private final ServiceService serviceService;

    @GetMapping
    @Operation(summary = "Public: list services by provider")
    public List<ServiceResponse> list(@RequestParam(required = false) Long providerId) {
        List<ServiceResponse> list = providerId != null
                ? serviceService.listByProvider(providerId, false)
                : List.of();
        return list;
    }

    @PostMapping
    @Operation(summary = "Create a service (PROVIDER)")
    public ServiceResponse create(@Valid @RequestBody ServiceRequest request) {
        return serviceService.create(request);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a service (PROVIDER)")
    public ServiceResponse update(@PathVariable Long id, @Valid @RequestBody ServiceRequest request) {
        return serviceService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Deactivate a service (PROVIDER)")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        serviceService.delete(id);
        return ResponseEntity.noContent().build();
    }
}