package com.booking.controller;

import com.booking.dto.request.AdminProviderDecision;
import com.booking.dto.request.CategoryRequest;
import com.booking.dto.request.CouponRequest;
import com.booking.dto.response.*;
import com.booking.service.AdminService;
import com.booking.service.CouponService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@Tag(name = "Admin")
public class AdminController {

    private final AdminService adminService;
    private final CouponService couponService;

    @GetMapping("/stats")
    @Operation(summary = "Platform analytics")
    public StatsResponse stats() {
        return adminService.stats();
    }

    @GetMapping("/providers/pending")
    public List<ProviderResponse> pending() {
        return adminService.pendingProviders();
    }

    @PutMapping("/providers/{id}/decision")
    @Operation(summary = "Approve/reject/suspend provider")
    public ProviderResponse decide(@PathVariable Long id, @Valid @RequestBody AdminProviderDecision decision) {
        return adminService.decideProvider(id, decision);
    }

    @GetMapping("/users")
    public PageResponse<UserResponse> users(@RequestParam(defaultValue = "0") int page,
                                            @RequestParam(defaultValue = "20") int size,
                                            @RequestParam(required = false) String role) {
        return adminService.users(page, size, role);
    }

    @PutMapping("/users/{id}/toggle-active")
    public UserResponse toggle(@PathVariable Long id) {
        return adminService.toggleUserActive(id);
    }

    @PostMapping("/categories")
    public CategoryResponse createCategory(@Valid @RequestBody CategoryRequest request) {
        return adminService.createCategory(request);
    }

    @DeleteMapping("/categories/{id}")
    public void deleteCategory(@PathVariable Long id) {
        adminService.deleteCategory(id);
    }

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
    public void deleteCoupon(@PathVariable Long id) {
        couponService.delete(id);
    }
}