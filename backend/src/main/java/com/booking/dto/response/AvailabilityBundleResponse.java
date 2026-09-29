package com.booking.dto.response;

import java.util.List;

public record AvailabilityBundleResponse(
        Long providerId,
        String businessName,
        List<AvailabilityResponse> availability,
        List<OverrideResponse> overrides
) {}