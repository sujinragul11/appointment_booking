package com.booking.dto.request;

import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.LocalTime;

public record OverrideRequest(
        @NotNull LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        Boolean isAvailable,
        String reason
) {}