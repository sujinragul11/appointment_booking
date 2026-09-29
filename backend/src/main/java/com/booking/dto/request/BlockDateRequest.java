package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record BlockDateRequest(
        @NotNull LocalDate date,
        Long staffId,
        LocalTime startTime,
        LocalTime endTime,
        /** true = custom working hours for that date instead of a block. */
        Boolean available,
        @Size(max = 255) String reason
) {
    @AssertTrue(message = "Provide both startTime and endTime, with startTime before endTime")
    public boolean isValidRange() {
        if (startTime == null && endTime == null) return true;
        return startTime != null && endTime != null && startTime.isBefore(endTime);
    }
}
