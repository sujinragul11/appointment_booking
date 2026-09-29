package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record SlotResponse(
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        Instant startAt,
        SlotStatus status,
        /** Staff members free at this time (empty for provider-level services). */
        List<Long> availableStaffIds,
        int remaining
) {}
