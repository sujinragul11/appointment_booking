package com.booking.dto.response;

import java.util.List;

public record ProviderStatsResponse(
        long todayAppointments,
        long upcomingAppointments,
        long completedAppointments,
        long cancelledAppointments,
        double monthlyRevenue,
        double rating,
        int reviewCount,
        List<UserResponse> todayCustomers
) {}