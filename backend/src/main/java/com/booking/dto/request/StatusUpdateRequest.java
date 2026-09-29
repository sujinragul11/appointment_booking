package com.booking.dto.request;

import com.booking.enums.AppointmentStatus;
import jakarta.validation.constraints.NotNull;

public record StatusUpdateRequest(
        @NotNull AppointmentStatus status
) {}