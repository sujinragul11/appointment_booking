package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record AppointmentRequest(
        @NotNull Long providerId,
        @NotNull Long serviceId,
        Long staffId,
        @NotNull LocalDate date,
        @NotNull LocalTime startTime,
        /** Ignored - derived from the service duration. Kept for API compatibility. */
        LocalTime endTime,
        @Size(max = 1000) String notes,
        @Size(max = 40) String couponCode,
        @NotNull PaymentMethod paymentMethod,
        PaymentOption paymentOption,
        ServiceMode mode,
        @Size(max = 64) String holdToken
) {}
