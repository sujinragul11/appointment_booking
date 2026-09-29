package com.booking.dto.response;

import java.util.List;

public record StatsResponse(
        long totalUsers,
        long totalCustomers,
        long totalProviders,
        long pendingProviders,
        long totalAppointments,
        long pendingAppointments,
        double totalRevenue,
        long totalSlots,
        long totalReviews
) {}