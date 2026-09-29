package com.booking.dto.request;

import com.booking.enums.PaymentMethod;
import jakarta.validation.constraints.NotNull;

public record VerifyPaymentRequest(
        @NotNull Long appointmentId,
        @NotNull PaymentMethod method,
        String txnId,
        String orderId,
        String razorpayPaymentId,
        Boolean paidAtVenue
) {}