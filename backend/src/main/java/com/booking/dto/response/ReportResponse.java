package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

/** Booking / revenue / cancellation / peak-hour report (FR-46). */
public record ReportResponse(
        LocalDate from,
        LocalDate to,
        Totals totals,
        List<DayRow> byDay,
        List<HourRow> byHour,
        List<WeekdayRow> byWeekday,
        List<NameCount> byStatus,
        List<RankRow> topProviders,
        List<RankRow> topServices
) {
    public record Totals(long bookings, long completed, long cancelled, long noShows, long upcoming,
                         double revenue, double refunds, double cancellationRate, double noShowRate,
                         double averageBookingValue) {}

    public record DayRow(LocalDate date, long bookings, long cancellations, double revenue) {}

    public record HourRow(int hour, long bookings) {}

    public record WeekdayRow(int dayOfWeek, String day, long bookings) {}

    public record NameCount(String name, long count) {}

    public record RankRow(Long id, String name, long bookings, double revenue) {}
}
