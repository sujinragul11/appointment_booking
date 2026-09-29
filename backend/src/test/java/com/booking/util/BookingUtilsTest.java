package com.booking.util;

import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class BookingUtilsTest {

    private static final String ALPHABET = "[23456789ABCDEFGHJKMNPQRSTUVWXYZ]";

    @RepeatedTest(20)
    void bookingReferenceHasDateAndUnambiguousSuffix() {
        String ref = BookingUtils.generateBookingRef(LocalDate.of(2026, 9, 29));

        assertThat(ref).matches("BK-260929-" + ALPHABET + "{6}");
        assertThat(ref.substring(10)).doesNotContainPattern("[01OIL]");
    }

    @Test
    void referencesAreRandom() {
        Set<String> refs = new HashSet<>();
        for (int i = 0; i < 500; i++) {
            refs.add(BookingUtils.generateBookingRef(LocalDate.of(2030, 1, 7)));
        }
        assertThat(refs).hasSizeGreaterThan(495);
    }

    @Test
    void invoiceNumberFormat() {
        assertThat(BookingUtils.generateInvoiceNumber(LocalDate.of(2030, 12, 31))).matches("INV-301231-" + ALPHABET + "{6}");
    }

    @Test
    void randomStringOtpAndTokenFormats() {
        assertThat(BookingUtils.randomString(12)).matches(ALPHABET + "{12}");
        assertThat(BookingUtils.randomString(0)).isEmpty();
        assertThat(BookingUtils.generateOtp()).matches("\\d{6}");
        String token = BookingUtils.generateToken();
        assertThat(token).matches("[A-Za-z0-9_-]{43}");
        assertThat(BookingUtils.generateToken()).isNotEqualTo(token);
    }

    @Test
    void sha256MatchesKnownVectors() {
        assertThat(BookingUtils.sha256("abc"))
                .isEqualTo("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assertThat(BookingUtils.sha256(""))
                .isEqualTo("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assertThat(BookingUtils.sha256("héllo")).hasSize(64).isEqualTo(BookingUtils.sha256("héllo"));
    }

    @Test
    void constantTimeEqualsHandlesNulls() {
        assertThat(BookingUtils.constantTimeEquals("abc", "abc")).isTrue();
        assertThat(BookingUtils.constantTimeEquals("abc", "abd")).isFalse();
        assertThat(BookingUtils.constantTimeEquals("abc", "abcd")).isFalse();
        assertThat(BookingUtils.constantTimeEquals(null, "abc")).isFalse();
        assertThat(BookingUtils.constantTimeEquals("abc", null)).isFalse();
    }

    @Test
    void moneyRoundsToTwoDecimals() {
        assertThat(BookingUtils.money(12.3456)).isEqualTo(12.35);
        assertThat(BookingUtils.money(99.994)).isEqualTo(99.99);
        assertThat(BookingUtils.money(1.0 / 3)).isEqualTo(0.33);
        assertThat(BookingUtils.money(1000 * 30 / 100.0)).isEqualTo(300.0);
        assertThat(BookingUtils.money(0.1 + 0.2)).isEqualTo(0.3);
        assertThat(BookingUtils.money(-2.499)).isEqualTo(-2.5);
        assertThat(BookingUtils.money(0)).isZero();
    }

    @Test
    void dayNamesAndMasking() {
        assertThat(BookingUtils.dayName(1)).isEqualTo("Monday");
        assertThat(BookingUtils.dayName(2)).isEqualTo("Tuesday");
        assertThat(BookingUtils.dayName(3)).isEqualTo("Wednesday");
        assertThat(BookingUtils.dayName(4)).isEqualTo("Thursday");
        assertThat(BookingUtils.dayName(5)).isEqualTo("Friday");
        assertThat(BookingUtils.dayName(6)).isEqualTo("Saturday");
        assertThat(BookingUtils.dayName(7)).isEqualTo("Sunday");
        assertThat(BookingUtils.dayName(0)).isEqualTo("-");
        assertThat(BookingUtils.maskEmail("jane.doe@example.com")).isEqualTo("j***@example.com");
        assertThat(BookingUtils.maskEmail("no-at-sign")).isEqualTo("no-at-sign");
        assertThat(BookingUtils.maskEmail(null)).isNull();
    }

    @Test
    void icsEscapingNeutralisesSeparatorsAndLineBreaks() {
        assertThat(BookingUtils.icsEscape("a,b;c\\d")).isEqualTo("a\\,b\\;c\\\\d");
        assertThat(BookingUtils.icsEscape("line1\r\nline2\nline3\rline4")).isEqualTo("line1\\nline2\\nline3\\nline4");
        assertThat(BookingUtils.icsEscape(null)).isEmpty();
        assertThat(BookingUtils.icsEscape("plain text")).isEqualTo("plain text");
    }

    @Test
    void icsInviteContainsEscapedFieldsWithoutInjectedProperties() {
        String ics = BookingUtils.buildIcs("BK-1", "Checkup, dental\r\nATTENDEE:mailto:evil@example.com",
                Instant.parse("2030-01-09T10:00:00Z"), Instant.parse("2030-01-09T10:30:00Z"),
                "12 Main St; Floor 2", "Booking BK-1", "https://meet.example/room");

        assertThat(ics).startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n").endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n");
        assertThat(ics).contains("UID:BK-1@", "DTSTART:20300109T100000Z\r\n", "DTEND:20300109T103000Z\r\n",
                "SUMMARY:Checkup\\, dental\\nATTENDEE:mailto:evil@example.com\r\n",
                "LOCATION:12 Main St\\; Floor 2\r\n", "DESCRIPTION:Booking BK-1\r\n", "URL:https://meet.example/room\r\n",
                "STATUS:CONFIRMED\r\n");
        assertThat(ics.lines()).noneMatch(l -> l.startsWith("ATTENDEE"));
        assertThat(ics).containsPattern("DTSTAMP:\\d{8}T\\d{6}Z");

        String minimal = BookingUtils.buildIcs("X", "S", Instant.EPOCH, Instant.EPOCH.plusSeconds(60), " ", null, "");
        assertThat(minimal).doesNotContain("LOCATION:", "DESCRIPTION:", "URL:");
    }
}
