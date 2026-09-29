package com.booking.booking;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

/**
 * Short-lived checkout locks on slots (edge case "slot lock during checkout", TTL 10 min).
 * Callers must hold the provider's booking lock when creating a hold so that the
 * availability check and the insert are atomic.
 */
public interface SlotLockService {

    record Hold(String token, Long userId, Long providerId, Long serviceId, Long staffId, LocalDate date,
                LocalTime startTime, Instant startAt, Instant endAt, Instant expiresAt) {}

    Hold create(Long userId, Long providerId, Long serviceId, Long staffId, LocalDate date, LocalTime startTime,
                Instant startAt, Instant endAt);

    /** Unexpired holds on the provider's calendar for that local date. */
    List<Hold> active(Long providerId, LocalDate date);

    Optional<Hold> find(String token);

    void release(String token);

    /** A customer holds at most one slot per provider at a time. */
    void releaseForUser(Long userId, Long providerId);

    void purgeExpired();
}
