package com.booking.controller;

import com.booking.dto.request.ProviderRequest;
import com.booking.dto.response.BranchResponse;
import com.booking.dto.response.ProviderResponse;
import com.booking.dto.response.ProviderStatsResponse;
import com.booking.service.ProviderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/provider")
@RequiredArgsConstructor
@Tag(name = "Provider Management (own profile)")
public class ProviderManageController {

    private final ProviderService providerService;

    @GetMapping("/me")
    @Operation(summary = "My provider profile")
    public ProviderResponse me() {
        return providerService.getMine();
    }

    @PutMapping("/me")
    @Operation(summary = "Update my business profile")
    public ProviderResponse update(@Valid @RequestBody ProviderRequest request) {
        return providerService.updateProfile(request);
    }

    @PostMapping("/branches")
    @Operation(summary = "Add a branch")
    public BranchResponse addBranch(@RequestParam String name,
                                    @RequestParam(required = false) String address,
                                    @RequestParam(required = false) String city,
                                    @RequestParam(required = false) String state,
                                    @RequestParam(required = false) String country,
                                    @RequestParam(required = false) Double latitude,
                                    @RequestParam(required = false) Double longitude,
                                    @RequestParam(required = false) String phone,
                                    @RequestParam(required = false) Boolean main) {
        return providerService.addBranch(name, address, city, state, country, latitude, longitude, phone, main);
    }

    @GetMapping("/branches")
    public List<BranchResponse> branches() {
        return providerService.listBranches();
    }

    @DeleteMapping("/branches/{id}")
    public ResponseEntity<Void> deleteBranch(@PathVariable Long id) {
        providerService.deleteBranch(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/stats")
    @Operation(summary = "My dashboard stats")
    public ProviderStatsResponse stats() {
        return providerService.stats();
    }
}