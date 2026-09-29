package com.booking.dto.response;

import java.util.List;

public record CreateOrderResponse(
        Long appointmentId,
        String bookingRef,
        double amount,
        String orderId,
        String currency,
        String keyId,
        boolean testMode
) {}