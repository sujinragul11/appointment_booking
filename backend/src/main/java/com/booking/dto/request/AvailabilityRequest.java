package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record AvailabilityRequest(
        @Min(1) @Max(7) int dayOfWeek,
        @NotNull LocalTime startTime,
        @NotNull LocalTime endTime,
        Long staffId,
        Boolean active
) {
    @AssertTrue(message = "startTime must be before endTime")
    public boolean isValidRange() {
        return startTime == null || endTime == null || startTime.isBefore(endTime);
    }
}
