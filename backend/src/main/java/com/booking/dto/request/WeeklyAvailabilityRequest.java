package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** Replaces all weekly windows of the provider (or one staff member). */
public record WeeklyAvailabilityRequest(
        Long staffId,
        @NotNull @Valid List<Window> windows
) {
    public record Window(
            @Min(1) @Max(7) int dayOfWeek,
            @NotNull LocalTime startTime,
            @NotNull LocalTime endTime
    ) {
        @AssertTrue(message = "startTime must be before endTime")
        public boolean isValidRange() {
            return startTime == null || endTime == null || startTime.isBefore(endTime);
        }
    }
}
