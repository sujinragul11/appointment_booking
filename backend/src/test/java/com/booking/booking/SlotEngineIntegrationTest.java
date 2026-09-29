package com.booking.booking;

import com.booking.dto.response.AppointmentResponse;
import com.booking.dto.response.SlotHoldResponse;
import com.booking.dto.response.SlotResponse;
import com.booking.dto.response.SlotsResponse;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.Staff;
import com.booking.entity.User;
import com.booking.enums.PaymentMethod;
import com.booking.enums.ProviderStatus;
import com.booking.enums.SlotStatus;
import com.booking.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Slot generation against the real database (H2): weekly windows, duration + buffer steps,
 * notice / booking window rules, blocks and custom hours, staff and provider capacity, holds,
 * and time zones including a DST gap.
 */
class SlotEngineIntegrationTest extends IntegrationTestBase {

    @Autowired
    private SlotEngine slotEngine;

    private Provider provider;
    private DomainService service;
    /** Wednesday, two days after the clock's "today" (Monday 2030-01-07). */
    private LocalDate day;

    @BeforeEach
    void setUp() {
        provider = data.provider();
        data.openAllWeek(provider, LocalTime.of(9, 0), LocalTime.of(17, 0));
        service = data.service(provider, "Consultation", 30, 10, 500);
        day = inDays(2);
    }

    private static List<LocalTime> times(String... values) {
        return java.util.Arrays.stream(values).map(LocalTime::parse).toList();
    }

    // ------------------------------------------------------------------ generation

    @Test
    void slotsAreGeneratedFromWeeklyWindowsWithDurationPlusBufferStep() throws Exception {
        SlotsResponse res = slots(provider.getId(), service.getId(), day, null);

        assertThat(res.closed()).isFalse();
        assertThat(res.message()).isNull();
        assertThat(res.timezone()).isEqualTo("UTC");
        assertThat(startTimes(res)).isEqualTo(times("09:00", "09:40", "10:20", "11:00", "11:40", "12:20",
                "13:00", "13:40", "14:20", "15:00", "15:40", "16:20"));
        SlotResponse first = res.slots().get(0);
        assertThat(first.endTime()).isEqualTo(LocalTime.of(9, 30));
        assertThat(first.startAt()).isEqualTo(Instant.parse("2030-01-09T09:00:00Z"));
        assertThat(first.status()).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(first.remaining()).isEqualTo(1);
        assertThat(first.availableStaffIds()).isEmpty();
        assertThat(res.slots()).allMatch(s -> s.status() == SlotStatus.AVAILABLE);
    }

    @Test
    void providerSlotIntervalOverridesDurationStep() throws Exception {
        data.updateProvider(provider.getId(), p -> p.setSlotIntervalMin(15));

        SlotsResponse res = slots(provider.getId(), service.getId(), day, null);

        assertThat(res.slots()).hasSize(31); // 09:00 .. 16:30 every 15 minutes
        assertThat(startTimes(res).get(1)).isEqualTo(LocalTime.of(9, 15));
        assertThat(startTimes(res).get(30)).isEqualTo(LocalTime.of(16, 30));
    }

    @Test
    void multipleWindowsOnADayAreAllUsed() throws Exception {
        Provider split = data.provider();
        int dow = day.getDayOfWeek().getValue();
        data.weekly(split, null, dow, LocalTime.of(14, 0), LocalTime.of(15, 0));
        data.weekly(split, null, dow, LocalTime.of(9, 0), LocalTime.of(10, 0));
        DomainService hour = data.service(split, "Session", 60, 0, 100);

        SlotsResponse res = slots(split.getId(), hour.getId(), day, null);

        assertThat(startTimes(res)).isEqualTo(times("09:00", "14:00"));
    }

    @Test
    void minimumNoticeHidesSlotsThatStartTooSoon() throws Exception {
        // now = 10:00 UTC on "today"; default notice is 60 minutes
        SlotsResponse res = slots(provider.getId(), service.getId(), today(), null);
        assertThat(startTimes(res)).first().isEqualTo(LocalTime.of(11, 0));
        assertThat(startTimes(res)).noneMatch(t -> t.isBefore(LocalTime.of(11, 0)));

        data.updateProvider(provider.getId(), p -> p.setMinNoticeMin(120));
        SlotsResponse later = slots(provider.getId(), service.getId(), today(), null);
        assertThat(startTimes(later)).first().isEqualTo(LocalTime.of(12, 20));
    }

    @Test
    void pastDatesAreClosedWithAMessage() throws Exception {
        SlotsResponse res = slots(provider.getId(), service.getId(), inDays(-1), null);

        assertThat(res.closed()).isTrue();
        assertThat(res.message()).isEqualTo("Cannot book a date in the past");
        assertThat(res.slots()).isEmpty();
    }

    @Test
    void datesBeyondTheAdvanceWindowAreClosed() throws Exception {
        assertThat(slots(provider.getId(), service.getId(), inDays(30), null).closed()).isFalse();

        SlotsResponse res = slots(provider.getId(), service.getId(), inDays(31), null);
        assertThat(res.closed()).isTrue();
        assertThat(res.message()).isEqualTo("Bookings open up to 30 days in advance");

        // a service-specific window wins over the provider default
        data.updateService(service.getId(), s -> s.setMaxAdvanceBookingDays(7));
        SlotsResponse svcLimited = slots(provider.getId(), service.getId(), inDays(8), null);
        assertThat(svcLimited.closed()).isTrue();
        assertThat(svcLimited.message()).isEqualTo("Bookings open up to 7 days in advance");
    }

    @Test
    void fullDayBlockClosesTheDay() throws Exception {
        data.closeDay(provider, day);

        SlotsResponse res = slots(provider.getId(), service.getId(), day, null);

        assertThat(res.closed()).isTrue();
        assertThat(res.slots()).isEmpty();
        assertThat(res.message()).isEqualTo("Not working on this day");
    }

    @Test
    void dayWithoutWeeklyHoursIsClosed() throws Exception {
        Provider weekdaysOnly = data.provider();
        data.weekly(weekdaysOnly, null, 1, LocalTime.of(9, 0), LocalTime.of(12, 0));
        DomainService s = data.service(weekdaysOnly, "Checkup", 30, 0, 100);

        SlotsResponse res = slots(weekdaysOnly.getId(), s.getId(), day, null); // a Wednesday

        assertThat(res.closed()).isTrue();
        assertThat(res.message()).isEqualTo("Not working on this day");
    }

    @Test
    void partialBlockMarksOverlappingSlotsBlocked() throws Exception {
        data.blockTime(provider, day, LocalTime.of(10, 0), LocalTime.of(11, 0));

        SlotsResponse res = slots(provider.getId(), service.getId(), day, null);

        assertThat(slotAt(res, "09:00").status()).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(slotAt(res, "09:40").status()).isEqualTo(SlotStatus.BLOCKED); // busy until 10:20 incl. buffer
        assertThat(slotAt(res, "10:20").status()).isEqualTo(SlotStatus.BLOCKED);
        assertThat(slotAt(res, "11:00").status()).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(res.closed()).isFalse();
    }

    @Test
    void blockedSlotCannotBeBooked() throws Exception {
        data.blockTime(provider, day, LocalTime.of(10, 0), LocalTime.of(11, 0));
        String token = auth.token(data.customer());

        post("/api/appointments", token,
                bookingBody(provider.getId(), service.getId(), day, "10:20", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isConflict());
    }

    @Test
    void customHoursReplaceTheWeeklySchedule() throws Exception {
        data.customHours(provider, day, LocalTime.of(12, 0), LocalTime.of(14, 0));

        SlotsResponse res = slots(provider.getId(), service.getId(), day, null);

        assertThat(startTimes(res)).isEqualTo(times("12:00", "12:40", "13:20"));
        // other days are unaffected
        assertThat(slots(provider.getId(), service.getId(), day.plusDays(1), null).slots()).hasSize(12);
    }

    // ------------------------------------------------------------------ staff and capacity

    @Test
    void staffBasedServiceListsFreeStaffAndBooksAFreeMember() throws Exception {
        Staff alice = data.staff(provider, "Alice");
        Staff bob = data.staff(provider, "Bob");
        DomainService cut = data.service(provider, "Haircut", 30, 0, 300);
        data.assignStaff(cut, alice, bob);

        SlotsResponse before = slots(provider.getId(), cut.getId(), day, null);
        SlotResponse nine = slotAt(before, "09:00");
        assertThat(nine.availableStaffIds()).containsExactly(alice.getId(), bob.getId());
        assertThat(nine.remaining()).isEqualTo(2);

        AppointmentResponse first = book(auth.token(data.customer()), provider.getId(), cut.getId(), day, "09:00",
                PaymentMethod.PAY_AT_VENUE);
        assertThat(first.staffId()).isEqualTo(alice.getId());
        assertThat(first.staffName()).isEqualTo("Alice");

        SlotResponse afterOne = slotAt(slots(provider.getId(), cut.getId(), day, null), "09:00");
        assertThat(afterOne.status()).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(afterOne.availableStaffIds()).containsExactly(bob.getId());
        assertThat(afterOne.remaining()).isEqualTo(1);

        AppointmentResponse second = book(auth.token(data.customer()), provider.getId(), cut.getId(), day, "09:00",
                PaymentMethod.PAY_AT_VENUE);
        assertThat(second.staffId()).isEqualTo(bob.getId());

        SlotResponse full = slotAt(slots(provider.getId(), cut.getId(), day, null), "09:00");
        assertThat(full.status()).isEqualTo(SlotStatus.BOOKED);
        assertThat(full.availableStaffIds()).isEmpty();

        post("/api/appointments", auth.token(data.customer()),
                bookingBody(provider.getId(), cut.getId(), day, "09:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isConflict());
    }

    @Test
    void specificStaffMemberCanBeRequested() throws Exception {
        Staff alice = data.staff(provider, "Alice");
        Staff bob = data.staff(provider, "Bob");
        DomainService cut = data.service(provider, "Haircut", 30, 0, 300);
        data.assignStaff(cut, alice, bob);

        Map<String, Object> body = bookingBody(provider.getId(), cut.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE);
        body.put("staffId", bob.getId());
        AppointmentResponse res = book(auth.token(data.customer()), body);
        assertThat(res.staffId()).isEqualTo(bob.getId());

        SlotsResponse bobView = read(get("/api/slots?providerId={p}&serviceId={s}&staffId={st}&date={d}", null,
                provider.getId(), cut.getId(), bob.getId(), day).andExpect(status().isOk()), SlotsResponse.class);
        assertThat(slotAt(bobView, "10:00").status()).isEqualTo(SlotStatus.BOOKED);
        assertThat(slotAt(slots(provider.getId(), cut.getId(), day, null), "10:00").availableStaffIds())
                .containsExactly(alice.getId());
    }

    @Test
    void staffOwnHoursAndLeaveAreRespected() throws Exception {
        Staff alice = data.staff(provider, "Alice");
        Staff bob = data.staff(provider, "Bob");
        DomainService cut = data.service(provider, "Haircut", 60, 0, 300);
        data.assignStaff(cut, alice, bob);
        int dow = day.getDayOfWeek().getValue();
        data.weekly(provider, alice, dow, LocalTime.of(13, 0), LocalTime.of(15, 0)); // Alice: afternoons only
        data.blocked(provider, bob, day, null, null, false, "Leave"); // Bob is off that day

        SlotsResponse res = slots(provider.getId(), cut.getId(), day, null);

        assertThat(startTimes(res)).isEqualTo(times("13:00", "14:00"));
        assertThat(res.slots()).allMatch(s -> s.availableStaffIds().equals(List.of(alice.getId())));
    }

    @Test
    void invalidStaffSelectionsAreRejected() throws Exception {
        Staff alice = data.staff(provider, "Alice");
        Staff carol = data.staff(provider, "Carol");
        DomainService cut = data.service(provider, "Haircut", 30, 0, 300);
        data.assignStaff(cut, alice);

        get("/api/slots?providerId={p}&serviceId={s}&staffId={st}&date={d}", null,
                provider.getId(), service.getId(), alice.getId(), day)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This service is not booked with a specific staff member"));
        get("/api/slots?providerId={p}&serviceId={s}&staffId={st}&date={d}", null,
                provider.getId(), cut.getId(), carol.getId(), day)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Carol does not offer this service"));
        get("/api/slots?providerId={p}&serviceId={s}&staffId={st}&date={d}", null,
                provider.getId(), cut.getId(), 999_999, day)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Staff member not available"));
    }

    @Test
    void providerLevelCapacityAllowsParallelBookings() throws Exception {
        data.updateProvider(provider.getId(), p -> p.setMaxBookingsPerSlot(2));

        assertThat(slotAt(slots(provider.getId(), service.getId(), day, null), "10:20").remaining()).isEqualTo(2);
        book(auth.token(data.customer()), provider.getId(), service.getId(), day, "10:20", PaymentMethod.PAY_AT_VENUE);
        SlotResponse half = slotAt(slots(provider.getId(), service.getId(), day, null), "10:20");
        assertThat(half.status()).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(half.remaining()).isEqualTo(1);

        book(auth.token(data.customer()), provider.getId(), service.getId(), day, "10:20", PaymentMethod.PAY_AT_VENUE);
        assertThat(slotAt(slots(provider.getId(), service.getId(), day, null), "10:20").status()).isEqualTo(SlotStatus.BOOKED);

        post("/api/appointments", auth.token(data.customer()),
                bookingBody(provider.getId(), service.getId(), day, "10:20", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isConflict());
    }

    @Test
    void bufferKeepsTheFollowingSlotBusy() throws Exception {
        data.updateProvider(provider.getId(), p -> p.setSlotIntervalMin(20));
        book(auth.token(data.customer()), provider.getId(), service.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE);

        SlotsResponse res = slots(provider.getId(), service.getId(), day, null);

        // 10:00 booking is busy until 10:40 (30 min + 10 min buffer)
        assertThat(slotAt(res, "09:20").status()).isEqualTo(SlotStatus.AVAILABLE); // 09:20-10:00 (+buffer 10:00) fits
        assertThat(slotAt(res, "09:40").status()).isEqualTo(SlotStatus.BOOKED);
        assertThat(slotAt(res, "10:00").status()).isEqualTo(SlotStatus.BOOKED);
        assertThat(slotAt(res, "10:20").status()).isEqualTo(SlotStatus.BOOKED);
        assertThat(slotAt(res, "10:40").status()).isEqualTo(SlotStatus.AVAILABLE);
    }

    @Test
    void maxBookingsPerDayFillsTheWholeDay() throws Exception {
        data.updateProvider(provider.getId(), p -> p.setMaxBookingsPerDay(1));
        book(auth.token(data.customer()), provider.getId(), service.getId(), day, "09:00", PaymentMethod.PAY_AT_VENUE);

        SlotsResponse res = slots(provider.getId(), service.getId(), day, null);

        assertThat(res.slots()).allMatch(s -> s.status() == SlotStatus.BOOKED);
        assertThat(res.message()).isEqualTo("Fully booked");
        post("/api/appointments", auth.token(data.customer()),
                bookingBody(provider.getId(), service.getId(), day, "15:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isConflict());
        // the next day is still open
        assertThat(slotAt(slots(provider.getId(), service.getId(), day.plusDays(1), null), "15:00").status())
                .isEqualTo(SlotStatus.AVAILABLE);
    }

    // ------------------------------------------------------------------ holds

    @Test
    void holdMakesSlotHeldForOthersButAvailableForTheHolder() throws Exception {
        User holder = data.customer();
        String holderToken = auth.token(holder);
        String otherToken = auth.token(data.customer());

        SlotHoldResponse hold = read(post("/api/slots/hold", holderToken, Map.of(
                "providerId", provider.getId(), "serviceId", service.getId(), "date", day.toString(), "startTime", "11:00"))
                .andExpect(status().isOk()), SlotHoldResponse.class);
        assertThat(hold.holdToken()).isNotBlank();
        assertThat(hold.startTime()).isEqualTo(LocalTime.of(11, 0));
        assertThat(hold.endTime()).isEqualTo(LocalTime.of(11, 30));

        assertThat(slotAt(slots(provider.getId(), service.getId(), day, null), "11:00").status()).isEqualTo(SlotStatus.HELD);
        assertThat(slotAt(slots(provider.getId(), service.getId(), day, otherToken), "11:00").status()).isEqualTo(SlotStatus.HELD);
        assertThat(slotAt(slots(provider.getId(), service.getId(), day, holderToken), "11:00").status())
                .isEqualTo(SlotStatus.AVAILABLE);

        // someone else cannot book or hold it
        post("/api/appointments", otherToken,
                bookingBody(provider.getId(), service.getId(), day, "11:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isConflict());
        post("/api/slots/hold", otherToken, Map.of("providerId", provider.getId(), "serviceId", service.getId(),
                "date", day.toString(), "startTime", "11:00"))
                .andExpect(status().isConflict());

        // the holder books with the hold token, which releases the hold
        Map<String, Object> body = bookingBody(provider.getId(), service.getId(), day, "11:00", PaymentMethod.PAY_AT_VENUE);
        body.put("holdToken", hold.holdToken());
        book(holderToken, body);
        assertThat(slotAt(slots(provider.getId(), service.getId(), day, null), "11:00").status()).isEqualTo(SlotStatus.BOOKED);
    }

    @Test
    void newHoldReleasesThePreviousOneAndHoldsCanBeReleased() throws Exception {
        String holderToken = auth.token(data.customer());
        SlotHoldResponse first = read(post("/api/slots/hold", holderToken, Map.of("providerId", provider.getId(),
                "serviceId", service.getId(), "date", day.toString(), "startTime", "11:00")), SlotHoldResponse.class);
        SlotHoldResponse second = read(post("/api/slots/hold", holderToken, Map.of("providerId", provider.getId(),
                "serviceId", service.getId(), "date", day.toString(), "startTime", "13:00")), SlotHoldResponse.class);
        assertThat(second.holdToken()).isNotEqualTo(first.holdToken());

        SlotsResponse res = slots(provider.getId(), service.getId(), day, null);
        assertThat(slotAt(res, "11:00").status()).isEqualTo(SlotStatus.AVAILABLE);
        assertThat(slotAt(res, "13:00").status()).isEqualTo(SlotStatus.HELD);

        // another customer cannot release someone else's hold
        delete("/api/slots/hold/" + second.holdToken(), auth.token(data.customer())).andExpect(status().isNoContent());
        assertThat(slotAt(slots(provider.getId(), service.getId(), day, null), "13:00").status()).isEqualTo(SlotStatus.HELD);

        delete("/api/slots/hold/" + second.holdToken(), holderToken).andExpect(status().isNoContent());
        assertThat(slotAt(slots(provider.getId(), service.getId(), day, null), "13:00").status())
                .isEqualTo(SlotStatus.AVAILABLE);
    }

    // ------------------------------------------------------------------ provider / service state

    @Test
    void unverifiedProvidersAndInactiveServicesAreNotBookable() throws Exception {
        Provider pending = data.provider("Pending Co", "UTC", ProviderStatus.PENDING, p -> { });
        data.openAllWeek(pending, LocalTime.of(9, 0), LocalTime.of(17, 0));
        DomainService s = data.service(pending, "Checkup", 30, 0, 100);
        get("/api/slots?providerId={p}&serviceId={s}&date={d}", null, pending.getId(), s.getId(), day)
                .andExpect(status().isNotFound());

        data.updateService(service.getId(), x -> x.setActive(false));
        get("/api/slots?providerId={p}&serviceId={s}&date={d}", null, provider.getId(), service.getId(), day)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This service is not available for booking"));

        // a service of another provider cannot be combined with this provider
        Provider other = data.provider();
        DomainService foreign = data.service(other, "Foreign", 30, 0, 100);
        get("/api/slots?providerId={p}&serviceId={s}&date={d}", null, provider.getId(), foreign.getId(), day)
                .andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------ time zones

    @Test
    void dstGapIsSkippedForNewYorkOnSpringForwardSunday() throws Exception {
        LocalDate springForward = LocalDate.of(2030, 3, 10); // 2nd Sunday of March 2030
        clock.setInstant(Instant.parse("2030-03-08T12:00:00Z"));
        Provider ny = data.provider("Manhattan Physio", "America/New_York");
        data.weekly(ny, null, 7, LocalTime.of(0, 0), LocalTime.of(6, 0));
        DomainService s = data.service(ny, "Therapy", 30, 0, 100);

        SlotsResponse res = slots(ny.getId(), s.getId(), springForward, null);

        assertThat(res.timezone()).isEqualTo("America/New_York");
        assertThat(startTimes(res)).isEqualTo(times("00:00", "00:30", "01:00", "01:30",
                "03:00", "03:30", "04:00", "04:30", "05:00", "05:30"));
        assertThat(startTimes(res)).doesNotContain(LocalTime.of(2, 0), LocalTime.of(2, 30));
        assertThat(slotAt(res, "01:30").startAt()).isEqualTo(Instant.parse("2030-03-10T06:30:00Z")); // EST, UTC-5
        assertThat(slotAt(res, "01:30").endTime()).isEqualTo(LocalTime.of(3, 0)); // 30 real minutes later
        assertThat(slotAt(res, "03:00").startAt()).isEqualTo(Instant.parse("2030-03-10T07:00:00Z")); // EDT, UTC-4

        AppointmentResponse booked = book(auth.token(data.customer()), ny.getId(), s.getId(), springForward, "03:00",
                PaymentMethod.PAY_AT_VENUE);
        assertThat(booked.startAt()).isEqualTo(Instant.parse("2030-03-10T07:00:00Z"));
        assertThat(booked.endAt()).isEqualTo(Instant.parse("2030-03-10T07:30:00Z"));
        assertThat(booked.timezone()).isEqualTo("America/New_York");

        // the nonexistent local time cannot be booked
        post("/api/appointments", auth.token(data.customer()),
                bookingBody(ny.getId(), s.getId(), springForward, "02:30", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isConflict());
    }

    @Test
    void londonTimesFollowGmtInWinterAndBstInSummer() throws Exception {
        Provider london = data.provider("Soho Studio", "Europe/London");
        data.openAllWeek(london, LocalTime.of(9, 0), LocalTime.of(17, 0));
        DomainService s = data.service(london, "Styling", 60, 0, 100);

        SlotsResponse winter = slots(london.getId(), s.getId(), LocalDate.of(2030, 1, 9), null);
        assertThat(slotAt(winter, "09:00").startAt()).isEqualTo(Instant.parse("2030-01-09T09:00:00Z"));

        clock.setInstant(Instant.parse("2030-06-03T08:00:00Z"));
        SlotsResponse summer = slots(london.getId(), s.getId(), LocalDate.of(2030, 6, 5), null);
        assertThat(slotAt(summer, "09:00").startAt()).isEqualTo(Instant.parse("2030-06-05T08:00:00Z"));
        assertThat(summer.slots()).hasSize(8);
    }

    @Test
    void kolkataProviderUsesLocalDateAndOffset() throws Exception {
        Provider kolkata = data.provider("Chennai Dental", "Asia/Kolkata");
        data.openAllWeek(kolkata, LocalTime.of(9, 0), LocalTime.of(17, 0));
        DomainService s = data.service(kolkata, "Cleaning", 60, 0, 100);

        SlotsResponse res = slots(kolkata.getId(), s.getId(), day, null);
        assertThat(slotAt(res, "09:00").startAt()).isEqualTo(Instant.parse("2030-01-09T03:30:00Z"));

        // now = 15:30 IST on "today": with 60 minutes notice only 16:30+ would be left, and 16:00 is the last start
        SlotsResponse todayRes = slots(kolkata.getId(), s.getId(), today(), null);
        assertThat(todayRes.slots()).isEmpty();
        assertThat(todayRes.closed()).isTrue();
    }

    // ------------------------------------------------------------------ direct engine API

    @Test
    void checkDateResolveAndFindCanBeUsedDirectly() {
        data.inTransaction(() -> {
            SlotEngine.Context ctx = slotEngine.resolve(provider.getId(), service.getId(), null);
            assertThat(ctx.provider().getId()).isEqualTo(provider.getId());
            assertThat(ctx.staff()).isNull();
            assertThat(slotEngine.checkDate(ctx, day)).isNull();
            assertThat(slotEngine.checkDate(ctx, inDays(-3))).isEqualTo("Cannot book a date in the past");

            var found = slotEngine.find(ctx, day, LocalTime.of(9, 40), null, null);
            assertThat(found).isPresent();
            assertThat(found.get().busyUntil()).isEqualTo(Instant.parse("2030-01-09T10:20:00Z"));
            assertThat(found.get().nextSeat()).isEqualTo(1);
            assertThat(slotEngine.find(ctx, day, LocalTime.of(9, 5), null, null)).isEmpty();
            assertThat(slotEngine.find(ctx, inDays(-1), LocalTime.of(9, 0), null, null)).isEmpty();
        });

        assertThat(SlotEngine.slotKey(5L, null, Instant.ofEpochSecond(100), 2)).isEqualTo("P5@100#2");
        assertThat(SlotEngine.slotKey(5L, 7L, Instant.ofEpochSecond(100), 1)).isEqualTo("S7@100");
    }
}
