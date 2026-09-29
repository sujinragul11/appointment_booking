package com.booking.dto.request;

import com.booking.enums.PaymentMethod;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.LocalTime;

public record AppointmentRequest(
        @NotNull Long providerId,
        @NotNull Long serviceId,
        Long staffId,
        @NotNull LocalDate date,
        @NotNull LocalTime startTime,
        @NotNull LocalTime endTime,
        String notes,
        String couponCode,
        @NotNull PaymentMethod paymentMethod
) {}