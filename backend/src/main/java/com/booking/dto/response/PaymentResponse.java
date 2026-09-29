package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record PaymentResponse(
        Long id,
        Long appointmentId,
        String bookingRef,
        String serviceName,
        String providerName,
        String customerName,
        double amount,
        double balanceDue,
        String currency,
        PaymentMethod method,
        PaymentOption option,
        PaymentStatus status,
        String orderId,
        String transactionId,
        String refundId,
        double refundAmount,
        String invoiceNumber,
        LocalDateTime paidAt,
        LocalDateTime refundedAt,
        LocalDateTime createdAt
) {}
