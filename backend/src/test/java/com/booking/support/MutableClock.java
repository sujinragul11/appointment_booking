package com.booking.support;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicReference;

/**
 * A {@link Clock} whose instant can be moved by tests (cancellation cut-offs, reminders,
 * unpaid-booking expiry, completing appointments after their start). Zone views created with
 * {@link #withZone(ZoneId)} share the same instant.
 */
public class MutableClock extends Clock {

    private final AtomicReference<Instant> instant;
    private final ZoneId zone;

    public MutableClock(Instant initial, ZoneId zone) {
        this(new AtomicReference<>(initial), zone);
    }

    private MutableClock(AtomicReference<Instant> instant, ZoneId zone) {
        this.instant = instant;
        this.zone = zone;
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(ZoneId newZone) {
        return newZone.equals(zone) ? this : new MutableClock(instant, newZone);
    }

    @Override
    public Instant instant() {
        return instant.get();
    }

    public void setInstant(Instant newInstant) {
        instant.set(newInstant);
    }

    public void advance(Duration duration) {
        instant.updateAndGet(i -> i.plus(duration));
    }
}
