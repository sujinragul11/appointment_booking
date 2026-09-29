package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record EarningsResponse(
        double totalCollected,
        double onlineCollected,
        double dueAtVenue,
        double refunded,
        List<PaymentResponse> payments
) {}
