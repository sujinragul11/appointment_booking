package com.booking.util;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.ThreadLocalRandom;

public final class BookingUtils {

    private static final String REF_PREFIX = "APT";
    private static final SecureRandom RANDOM = new SecureRandom();

    private BookingUtils() {
    }

    public static String generateBookingRef() {
        return String.format("%s-%d-%05d", REF_PREFIX, LocalDate.now().getYear(),
                ThreadLocalRandom.current().nextInt(1, 100000));
    }

    public static String generateOtp() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    public static String generateTxnId() {
        return "TXN" + System.currentTimeMillis() + RANDOM.nextInt(1000);
    }

    public static String generateOrderId() {
        return "order_" + System.currentTimeMillis() + RANDOM.nextInt(1000);
    }

    public static String generateRefundId() {
        return "rfnd_" + System.currentTimeMillis() + RANDOM.nextInt(1000);
    }

    public static String dayName(int dayOfWeek) {
        return switch (dayOfWeek) {
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

    public static String buildIcs(String ref, String summary, LocalDate date,
                                  LocalDateTime start, LocalDateTime end, String location, String description) {
        DateTimeFormatter dt = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss");
        return "BEGIN:VCALENDAR\n" +
                "VERSION:2.0\n" +
                "PRODID:-//Booking Platform//Appointment//EN\n" +
                "BEGIN:VEVENT\n" +
                "UID:" + ref + "@booking.app\n" +
                "DTSTAMP:" + LocalDateTime.now().format(dt) + "\n" +
                "DTSTART:" + start.format(dt) + "\n" +
                "DTEND:" + end.format(dt) + "\n" +
                "SUMMARY:" + summary + "\n" +
                (location != null && !location.isBlank() ? "LOCATION:" + location + "\n" : "") +
                (description != null && !description.isBlank() ? "DESCRIPTION:" + description.replace("\n", "\\n") + "\n" : "") +
                "STATUS:CONFIRMED\n" +
                "END:VEVENT\n" +
                "END:VCALENDAR\n";
    }
}