package com.booking.booking;

import com.booking.entity.Appointment;
import com.booking.entity.Provider;
import com.booking.enums.ActorType;
import com.booking.enums.AppointmentStatus;

import java.time.Duration;
import java.time.Instant;

/** Cancellation / refund / reschedule rules (FR-28, FR-29, FR-39). Pure functions for easy testing. */
public final class BookingPolicy {

    private BookingPolicy() {
    }

    public record CancelDecision(boolean allowed, String message, int refundPercent, Instant cutoffAt) {}

    public static CancelDecision cancellation(Appointment a, ActorType actor, Instant now) {
        Provider p = a.getProvider();
        Instant cutoff = a.getStartAt().minus(Duration.ofHours(p.getCancellationCutoffHours()));
        if (!a.getStatus().isActive()) {
            return new CancelDecision(false, "Only upcoming bookings can be cancelled", 0, cutoff);
        }
        if (actor == ActorType.CUSTOMER) {
            if (!now.isBefore(a.getStartAt())) {
                return new CancelDecision(false, "The appointment has already started", 0, cutoff);
            }
            if (now.isBefore(cutoff)) {
                return new CancelDecision(true, "Free cancellation - full refund of any online payment", 100, cutoff);
            }
            int pct = p.getLateCancelRefundPercent();
            return new CancelDecision(true, "Late cancellation (within " + p.getCancellationCutoffHours()
                    + "h of the start) - " + pct + "% refund of any online payment", pct, cutoff);
        }
        // Provider / staff / admin / system cancellations are always fully refunded
        return new CancelDecision(true, "Cancelled by the business - full refund", 100, cutoff);
    }

    public record RescheduleDecision(boolean allowed, String message) {}

    public static RescheduleDecision reschedule(Appointment a, ActorType actor, Instant now) {
        Provider p = a.getProvider();
        if (!a.getStatus().isActive()) {
            return new RescheduleDecision(false, "Only upcoming bookings can be rescheduled");
        }
        if (!now.isBefore(a.getStartAt())) {
            return new RescheduleDecision(false, "The appointment has already started");
        }
        if (actor == ActorType.CUSTOMER) {
            if (a.getRescheduleCount() >= p.getMaxReschedules()) {
                return new RescheduleDecision(false, p.getMaxReschedules() == 0
                        ? "This provider does not allow rescheduling"
                        : "This booking was already rescheduled " + a.getRescheduleCount() + " time(s), the maximum allowed");
            }
            if (now.plus(Duration.ofHours(p.getRescheduleCutoffHours())).isAfter(a.getStartAt())) {
                return new RescheduleDecision(false, "Rescheduling closes " + p.getRescheduleCutoffHours()
                        + " hours before the appointment");
            }
        }
        return new RescheduleDecision(true, null);
    }

    public static boolean hasStarted(Appointment a, Instant now) {
        return !now.isBefore(a.getStartAt());
    }

    public static boolean canConfirm(Appointment a) {
        return a.getStatus() == AppointmentStatus.PENDING
                && (a.getPaymentDueAt() == null); // online bookings must be paid first
    }
}
