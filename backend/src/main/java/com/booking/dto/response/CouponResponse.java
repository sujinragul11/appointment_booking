package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
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
        int perUserLimit,
        boolean active,
        LocalDateTime createdAt
) {}
