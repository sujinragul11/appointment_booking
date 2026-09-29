package com.booking.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

import java.util.List;

public record ServiceRequest(
        @NotBlank String name,
        String description,
        @Min(5) int durationMin,
        @Min(0) int bufferMin,
        @Positive double price,
        Long categoryId,
        String imageUrl,
        Integer maxAdvanceBookingDays,
        String cancellationPolicy,
        Boolean active,
        List<Long> staffIds
) {}