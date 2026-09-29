package com.booking.dto.request;

import jakarta.validation.constraints.NotBlank;

public record ProviderRequest(
        @NotBlank String businessName,
        String description,
        Long categoryId,
        String city,
        String state,
        String country,
        String address,
        Double latitude,
        Double longitude,
        String phone,
        String website,
        String logoUrl,
        String coverUrl,
        Integer maxAdvanceBookingDays,
        String cancellationPolicy
) {}