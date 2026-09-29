package com.booking.dto.response;

import com.booking.enums.ProviderStatus;

import java.time.LocalDateTime;
import java.util.List;

public record ProviderResponse(
        Long id,
        String businessName,
        String description,
        String logoUrl,
        String coverUrl,
        CategoryResponse category,
        String city,
        String state,
        String country,
        String address,
        Double latitude,
        Double longitude,
        String phone,
        String website,
        ProviderStatus status,
        double rating,
        int reviewCount,
        int maxAdvanceBookingDays,
        String cancellationPolicy,
        LocalDateTime createdAt,
        List<ServiceResponse> services,
        List<StaffResponse> staff,
        List<BranchResponse> branches
) {}