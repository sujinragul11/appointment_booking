package com.booking.dto.response;

import java.time.LocalDate;

public record EarningSummary(
        LocalDate date,
        long bookings,
        double revenue
) {}