package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record SlotHoldResponse(
        String holdToken,
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        Long staffId,
        Instant expiresAt
) {}
