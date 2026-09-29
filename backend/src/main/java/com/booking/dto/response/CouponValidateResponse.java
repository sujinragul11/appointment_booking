package com.booking.dto.response;

public record CouponValidateResponse(
        boolean valid,
        String message,
        String code,
        double amount,
        double discount,
        double finalAmount
) {}