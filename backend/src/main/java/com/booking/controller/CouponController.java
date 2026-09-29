package com.booking.controller;

import com.booking.dto.request.CouponRequest;
import com.booking.dto.response.CouponResponse;
import com.booking.dto.response.CouponValidateResponse;
import com.booking.service.CouponService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/coupons")
@RequiredArgsConstructor
public class CouponController {

    private final CouponService couponService;

    @GetMapping("/validate")
    @Operation(summary = "Public: validate coupon against amount")
    public CouponValidateResponse validate(@RequestParam String code, @RequestParam double amount) {
        return couponService.validate(code, amount);
    }
}