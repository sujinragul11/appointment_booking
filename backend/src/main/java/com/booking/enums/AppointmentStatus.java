package com.booking.enums;

public enum AppointmentStatus {
    PENDING, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW, RESCHEDULED;

    /** Statuses that occupy capacity in the provider's schedule. */
    public boolean isActive() {
        return this == PENDING || this == CONFIRMED || this == RESCHEDULED;
    }
}
