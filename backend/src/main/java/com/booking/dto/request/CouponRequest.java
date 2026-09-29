package com.booking.dto.request;

import com.booking.enums.DiscountType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.time.LocalDate;

public record CouponRequest(
        @NotBlank String code,
        @NotNull DiscountType discountType,
        @Positive double value,
        double minOrder,
        double maxDiscount,
        LocalDate validFrom,
        LocalDate validTo,
        int usageLimit,
        Boolean active
) {}