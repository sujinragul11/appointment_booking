package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record ProviderStatsResponse(
        long todayAppointments,
        long upcomingAppointments,
        long completedAppointments,
        long cancelledAppointments,
        long noShowAppointments,
        long pendingAppointments,
        double monthlyRevenue,
        double totalRevenue,
        double rating,
        int reviewCount
) {}
