package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record BlockedDateResponse(
        Long id,
        Long providerId,
        Long staffId,
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        boolean available,
        String reason
) {}
