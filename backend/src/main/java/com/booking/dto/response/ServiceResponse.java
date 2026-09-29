package com.booking.dto.response;

import java.util.List;

public record ServiceResponse(
        Long id,
        Long providerId,
        String name,
        String description,
        int durationMin,
        int bufferMin,
        double price,
        Long categoryId,
        String categoryName,
        String imageUrl,
        int maxAdvanceBookingDays,
        String cancellationPolicy,
        boolean active,
        List<Long> staffIds,
        List<String> staffNames
) {}