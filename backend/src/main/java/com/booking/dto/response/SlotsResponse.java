package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record SlotsResponse(
        Long providerId,
        Long serviceId,
        Long staffId,
        LocalDate date,
        String timezone,
        boolean closed,
        String message,
        List<SlotResponse> slots
) {}
