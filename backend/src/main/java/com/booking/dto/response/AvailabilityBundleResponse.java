package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record AvailabilityBundleResponse(
        Long providerId,
        String businessName,
        String timezone,
        List<AvailabilityResponse> availability,
        List<BlockedDateResponse> blockedDates
) {}
