package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record ServiceResponse(
        Long id,
        Long providerId,
        String providerName,
        String providerCity,
        double providerRating,
        String name,
        String description,
        int durationMin,
        int bufferMin,
        double price,
        int depositPercent,
        ServiceMode mode,
        Long categoryId,
        String categoryName,
        String imageUrl,
        int maxAdvanceBookingDays,
        boolean active,
        List<Long> staffIds,
        List<String> staffNames
) {}
