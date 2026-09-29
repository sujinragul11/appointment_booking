package com.booking.dto.response;

import com.booking.enums.AppointmentStatus;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public record AppointmentResponse(
        Long id,
        String bookingRef,
        Long customerId,
        String customerName,
        String customerPhoto,
        Long providerId,
        String providerName,
        Long serviceId,
        String serviceName,
        Long staffId,
        String staffName,
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        AppointmentStatus status,
        String notes,
        double amount,
        double discount,
        double finalAmount,
        String couponCode,
        String cancelReason,
        PaymentResponse payment,
        LocalDateTime createdAt
) {}