package com.booking.dto.response;

import com.booking.enums.DiscountType;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record CouponResponse(
        Long id,
        String code,
        DiscountType discountType,
        double value,
        double minOrder,
        double maxDiscount,
        LocalDate validFrom,
        LocalDate validTo,
        int usageLimit,
        int usedCount,
        boolean active,
        LocalDateTime createdAt
) {}