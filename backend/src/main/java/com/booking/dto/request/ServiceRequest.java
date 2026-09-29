package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record ServiceRequest(
        /** Only used by admins: the provider the service is assigned to (FR-10). */
        Long providerId,
        @NotBlank @Size(max = 120) String name,
        @Size(max = 5000) String description,
        @Min(5) @Max(480) int durationMin,
        @Min(0) @Max(120) int bufferMin,
        @PositiveOrZero double price,
        @Min(0) @Max(100) Integer depositPercent,
        ServiceMode mode,
        Long categoryId,
        @Size(max = 500) String imageUrl,
        @Min(0) @Max(365) Integer maxAdvanceBookingDays,
        Boolean active,
        List<Long> staffIds
) {}
