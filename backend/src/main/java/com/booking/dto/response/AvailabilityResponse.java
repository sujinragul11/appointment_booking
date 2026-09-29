package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record AvailabilityResponse(
        Long id,
        Long providerId,
        Long staffId,
        int dayOfWeek,
        String dayName,
        LocalTime startTime,
        LocalTime endTime,
        boolean active
) {}
