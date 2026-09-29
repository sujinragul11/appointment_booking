package com.booking.booking;

import com.booking.entity.Appointment;
import com.booking.entity.Provider;
import com.booking.enums.ActorType;
import com.booking.enums.AppointmentStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.time.Duration;
import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/** Pure policy rules: cancellation refunds, reschedule limits and cut-offs, started/confirmable checks. */
class BookingPolicyTest {

    private static final Instant START = Instant.parse("2030-01-09T10:00:00Z");

    private static Provider provider() {
        return Provider.builder()
                .cancellationCutoffHours(24)
                .lateCancelRefundPercent(50)
                .rescheduleCutoffHours(12)
                .maxReschedules(2)
                .build();
    }

    private static Appointment appointment(Provider p, AppointmentStatus status, int rescheduleCount) {
        return Appointment.builder().provider(p).startAt(START).status(status).rescheduleCount(rescheduleCount).build();
    }

    private static Appointment confirmed() {
        return appointment(provider(), AppointmentStatus.CONFIRMED, 0);
    }

    // ------------------------------------------------------------------ cancellation

    @Test
    void customerCancellingBeforeTheCutoffGetsAFullRefund() {
        var d = BookingPolicy.cancellation(confirmed(), ActorType.CUSTOMER, START.minus(Duration.ofHours(48)));

        assertThat(d.allowed()).isTrue();
        assertThat(d.refundPercent()).isEqualTo(100);
        assertThat(d.message()).isEqualTo("Free cancellation - full refund of any online payment");
        assertThat(d.cutoffAt()).isEqualTo(START.minus(Duration.ofHours(24)));
    }

    @Test
    void customerCancellingInsideTheCutoffGetsTheLatePercentage() {
        var atCutoff = BookingPolicy.cancellation(confirmed(), ActorType.CUSTOMER, START.minus(Duration.ofHours(24)));
        assertThat(atCutoff.allowed()).isTrue();
        assertThat(atCutoff.refundPercent()).as("the cut-off instant itself is already late").isEqualTo(50);

        var late = BookingPolicy.cancellation(confirmed(), ActorType.CUSTOMER, START.minus(Duration.ofHours(2)));
        assertThat(late.allowed()).isTrue();
        assertThat(late.refundPercent()).isEqualTo(50);
        assertThat(late.message()).isEqualTo("Late cancellation (within 24h of the start) - 50% refund of any online payment");
    }

    @Test
    void lateRefundPercentageComesFromTheProvider() {
        Provider strict = provider();
        strict.setLateCancelRefundPercent(0);
        strict.setCancellationCutoffHours(72);

        var d = BookingPolicy.cancellation(appointment(strict, AppointmentStatus.PENDING, 0), ActorType.CUSTOMER,
                START.minus(Duration.ofHours(48)));

        assertThat(d.refundPercent()).isZero();
        assertThat(d.cutoffAt()).isEqualTo(START.minus(Duration.ofHours(72)));
    }

    @Test
    void customerCannotCancelOnceStarted() {
        var atStart = BookingPolicy.cancellation(confirmed(), ActorType.CUSTOMER, START);
        var after = BookingPolicy.cancellation(confirmed(), ActorType.CUSTOMER, START.plusSeconds(60));

        assertThat(atStart.allowed()).isFalse();
        assertThat(atStart.message()).isEqualTo("The appointment has already started");
        assertThat(atStart.refundPercent()).isZero();
        assertThat(after.allowed()).isFalse();
    }

    @ParameterizedTest
    @EnumSource(value = AppointmentStatus.class, names = {"CANCELLED", "COMPLETED", "NO_SHOW"})
    void onlyActiveBookingsCanBeCancelled(AppointmentStatus status) {
        var d = BookingPolicy.cancellation(appointment(provider(), status, 0), ActorType.PROVIDER, START.minus(Duration.ofDays(3)));

        assertThat(d.allowed()).isFalse();
        assertThat(d.message()).isEqualTo("Only upcoming bookings can be cancelled");
        assertThat(d.refundPercent()).isZero();
    }

    @ParameterizedTest
    @EnumSource(value = ActorType.class, names = {"PROVIDER", "STAFF", "ADMIN", "SYSTEM"})
    void businessSideCancellationsAreAlwaysFullyRefunded(ActorType actor) {
        var late = BookingPolicy.cancellation(confirmed(), actor, START.minus(Duration.ofMinutes(5)));
        var afterStart = BookingPolicy.cancellation(confirmed(), actor, START.plus(Duration.ofMinutes(5)));

        assertThat(late.allowed()).isTrue();
        assertThat(late.refundPercent()).isEqualTo(100);
        assertThat(late.message()).isEqualTo("Cancelled by the business - full refund");
        assertThat(afterStart.allowed()).isTrue();
    }

    // ------------------------------------------------------------------ reschedule

    @Test
    void customerCanRescheduleBeforeTheCutoffWithinTheLimit() {
        var d = BookingPolicy.reschedule(appointment(provider(), AppointmentStatus.RESCHEDULED, 1), ActorType.CUSTOMER,
                START.minus(Duration.ofHours(12)));

        assertThat(d.allowed()).isTrue();
        assertThat(d.message()).isNull();
    }

    @Test
    void customerRescheduleIsClosedInsideTheCutoff() {
        var d = BookingPolicy.reschedule(confirmed(), ActorType.CUSTOMER, START.minus(Duration.ofHours(11)));

        assertThat(d.allowed()).isFalse();
        assertThat(d.message()).isEqualTo("Rescheduling closes 12 hours before the appointment");
    }

    @Test
    void customerRescheduleCountIsLimited() {
        var d = BookingPolicy.reschedule(appointment(provider(), AppointmentStatus.RESCHEDULED, 2), ActorType.CUSTOMER,
                START.minus(Duration.ofDays(5)));

        assertThat(d.allowed()).isFalse();
        assertThat(d.message()).isEqualTo("This booking was already rescheduled 2 time(s), the maximum allowed");
    }

    @Test
    void providersMayDisallowRescheduling() {
        Provider p = provider();
        p.setMaxReschedules(0);

        var d = BookingPolicy.reschedule(appointment(p, AppointmentStatus.CONFIRMED, 0), ActorType.CUSTOMER,
                START.minus(Duration.ofDays(5)));

        assertThat(d.allowed()).isFalse();
        assertThat(d.message()).isEqualTo("This provider does not allow rescheduling");
    }

    @Test
    void businessRescheduleIgnoresCountAndCutoffButNotTheStart() {
        Appointment many = appointment(provider(), AppointmentStatus.RESCHEDULED, 5);

        assertThat(BookingPolicy.reschedule(many, ActorType.PROVIDER, START.minus(Duration.ofMinutes(30))).allowed()).isTrue();
        assertThat(BookingPolicy.reschedule(many, ActorType.STAFF, START.minus(Duration.ofMinutes(30))).allowed()).isTrue();
        var started = BookingPolicy.reschedule(many, ActorType.PROVIDER, START);
        assertThat(started.allowed()).isFalse();
        assertThat(started.message()).isEqualTo("The appointment has already started");
    }

    @Test
    void finishedBookingsCannotBeRescheduled() {
        var d = BookingPolicy.reschedule(appointment(provider(), AppointmentStatus.COMPLETED, 0), ActorType.PROVIDER,
                START.minus(Duration.ofDays(1)));

        assertThat(d.allowed()).isFalse();
        assertThat(d.message()).isEqualTo("Only upcoming bookings can be rescheduled");
    }

    // ------------------------------------------------------------------ helpers

    @Test
    void hasStartedIsInclusiveOfTheStartInstant() {
        assertThat(BookingPolicy.hasStarted(confirmed(), START.minusMillis(1))).isFalse();
        assertThat(BookingPolicy.hasStarted(confirmed(), START)).isTrue();
        assertThat(BookingPolicy.hasStarted(confirmed(), START.plusSeconds(1))).isTrue();
    }

    @Test
    void onlyPendingBookingsWithoutOutstandingOnlinePaymentCanBeConfirmed() {
        Appointment pending = appointment(provider(), AppointmentStatus.PENDING, 0);
        assertThat(BookingPolicy.canConfirm(pending)).isTrue();

        pending.setPaymentDueAt(START.minus(Duration.ofDays(1)));
        assertThat(BookingPolicy.canConfirm(pending)).isFalse();

        assertThat(BookingPolicy.canConfirm(confirmed())).isFalse();
    }

    @Test
    void activeStatusesAreThoseThatOccupyCapacity() {
        assertThat(AppointmentStatus.PENDING.isActive()).isTrue();
        assertThat(AppointmentStatus.CONFIRMED.isActive()).isTrue();
        assertThat(AppointmentStatus.RESCHEDULED.isActive()).isTrue();
        assertThat(AppointmentStatus.CANCELLED.isActive()).isFalse();
        assertThat(AppointmentStatus.COMPLETED.isActive()).isFalse();
        assertThat(AppointmentStatus.NO_SHOW.isActive()).isFalse();
        assertThat(SlotEngine.ACTIVE).containsExactlyInAnyOrder(AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED,
                AppointmentStatus.RESCHEDULED);
    }
}
