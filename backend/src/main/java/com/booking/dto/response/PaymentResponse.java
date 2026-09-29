package com.booking.dto.response;

import com.booking.enums.PaymentMethod;
import com.booking.enums.PaymentStatus;

import java.time.LocalDateTime;

public record PaymentResponse(
        Long id,
        Long appointmentId,
        String bookingRef,
        double amount,
        PaymentMethod method,
        PaymentStatus status,
        String orderId,
        String txnId,
        String refundId,
        LocalDateTime paidAt
) {}