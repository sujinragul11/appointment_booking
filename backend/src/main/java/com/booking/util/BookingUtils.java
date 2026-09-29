package com.booking.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.HexFormat;

public final class BookingUtils {

    private static final SecureRandom RANDOM = new SecureRandom();
    /** Crockford-style alphabet without ambiguous characters (0/O, 1/I/L). */
    private static final char[] REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ".toCharArray();
    private static final DateTimeFormatter REF_DATE = DateTimeFormatter.ofPattern("yyMMdd");

    private BookingUtils() {
    }

    /** e.g. BK-260929-7KQ4XM: ~887 million combinations per day (FR-23). */
    public static String generateBookingRef(LocalDate date) {
        return "BK-" + date.format(REF_DATE) + "-" + randomString(6);
    }

    public static String generateInvoiceNumber(LocalDate date) {
        return "INV-" + date.format(REF_DATE) + "-" + randomString(6);
    }

    public static String randomString(int len) {
        StringBuilder sb = new StringBuilder(len);
        for (int i = 0; i < len; i++) {
            sb.append(REF_ALPHABET[RANDOM.nextInt(REF_ALPHABET.length)]);
        }
        return sb.toString();
    }

    public static String generateOtp() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    /** URL-safe random token (256 bits). */
    public static String generateToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String sha256(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    public static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        return MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }

    public static double money(double value) {
        return Math.round(value * 100.0) / 100.0;
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

    public static String maskEmail(String email) {
        if (email == null || !email.contains("@")) return email;
        int at = email.indexOf('@');
        return email.charAt(0) + "***" + email.substring(at);
    }

    /** RFC 5545 calendar invite; text values are escaped so user data cannot inject properties. */
    public static String buildIcs(String uid, String summary, Instant start, Instant end,
                                  String location, String description, String url) {
        DateTimeFormatter dt = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC);
        StringBuilder sb = new StringBuilder()
                .append("BEGIN:VCALENDAR\r\n")
                .append("VERSION:2.0\r\n")
                .append("PRODID:-//Sloto//Appointment//EN\r\n")
                .append("METHOD:PUBLISH\r\n")
                .append("BEGIN:VEVENT\r\n")
                .append("UID:").append(icsEscape(uid)).append("@sloto\r\n")
                .append("DTSTAMP:").append(dt.format(Instant.now())).append("\r\n")
                .append("DTSTART:").append(dt.format(start)).append("\r\n")
                .append("DTEND:").append(dt.format(end)).append("\r\n")
                .append("SUMMARY:").append(icsEscape(summary)).append("\r\n");
        if (location != null && !location.isBlank()) {
            sb.append("LOCATION:").append(icsEscape(location)).append("\r\n");
        }
        if (description != null && !description.isBlank()) {
            sb.append("DESCRIPTION:").append(icsEscape(description)).append("\r\n");
        }
        if (url != null && !url.isBlank()) {
            sb.append("URL:").append(icsEscape(url)).append("\r\n");
        }
        return sb.append("STATUS:CONFIRMED\r\n")
                .append("END:VEVENT\r\n")
                .append("END:VCALENDAR\r\n")
                .toString();
    }

    static String icsEscape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace(";", "\\;")
                .replace(",", "\\,")
                .replace("\r\n", "\\n")
                .replace("\n", "\\n")
                .replace("\r", "\\n");
    }
}
