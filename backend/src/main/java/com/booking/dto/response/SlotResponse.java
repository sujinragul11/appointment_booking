package com.booking.dto.response;

import com.booking.enums.SlotStatus;

import java.time.LocalDate;
import java.time.LocalTime;

public record SlotResponse(
        Long id,
        Long providerId,
        Long serviceId,
        Long staffId,
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        SlotStatus status
) {}