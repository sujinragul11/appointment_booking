package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record CreateOrderResponse(
        Long appointmentId,
        String bookingRef,
        double amount,
        long amountMinor,
        String currency,
        String orderId,
        String keyId,
        boolean demoMode,
        String customerName,
        String customerEmail,
        String customerPhone,
        String description,
        Instant expiresAt
) {}
