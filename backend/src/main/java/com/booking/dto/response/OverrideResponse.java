package com.booking.dto.response;

import java.time.LocalDate;
import java.time.LocalTime;

public record OverrideResponse(
        Long id,
        Long providerId,
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        boolean available,
        String reason
) {}