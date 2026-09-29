package com.booking.dto.response;

import java.time.LocalTime;

public record AvailabilityResponse(
        Long id,
        Long providerId,
        Long staffId,
        int dayOfWeek,
        String dayName,
        LocalTime startTime,
        LocalTime endTime,
        boolean active
) {

    public static String dayName(int d) {
        return switch (d) {
            case 1 -> "Monday";
            case 2 -> "Tuesday";
            case 3 -> "Wednesday";
            case 4 -> "Thursday";
            case 5 -> "Friday";
            case 6 -> "Saturday";
            case 7 -> "Sunday";
            default -> "-";
        };
    }
}