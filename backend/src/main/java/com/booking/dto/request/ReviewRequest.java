package com.booking.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record ReviewRequest(
        @NotNull Long appointmentId,
        @Min(1) @Max(5) int rating,
        String comment
) {}