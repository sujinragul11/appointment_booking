package com.booking.booking;

import com.booking.entity.SlotHold;
import com.booking.repository.SlotHoldRepository;
import com.booking.util.BookingUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

/** Default slot lock store: a table with an expiry column (works on a single database). */
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.slot-lock.store", havingValue = "db", matchIfMissing = true)
public class DbSlotLockService implements SlotLockService {

    private final SlotHoldRepository repository;

    @Value("${app.slot-lock.ttl-minutes:10}")
    private int ttlMinutes;

    @Override
    @Transactional
    public Hold create(Long userId, Long providerId, Long serviceId, Long staffId, LocalDate date, LocalTime startTime,
                       Instant startAt, Instant endAt) {
        SlotHold h = repository.save(SlotHold.builder()
                .token(BookingUtils.generateToken())
                .userId(userId).providerId(providerId).serviceId(serviceId).staffId(staffId)
                .date(date).startTime(startTime).startAt(startAt).endAt(endAt)
                .expiresAt(Instant.now().plus(Duration.ofMinutes(ttlMinutes)))
                .build());
        return map(h);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Hold> active(Long providerId, LocalDate date) {
        return repository.findByProviderIdAndDateAndExpiresAtAfter(providerId, date, Instant.now()).stream()
                .map(DbSlotLockService::map).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Hold> find(String token) {
        return repository.findByToken(token).filter(h -> h.getExpiresAt().isAfter(Instant.now())).map(DbSlotLockService::map);
    }

    @Override
    @Transactional
    public void release(String token) {
        repository.findByToken(token).ifPresent(repository::delete);
    }

    @Override
    @Transactional
    public void releaseForUser(Long userId, Long providerId) {
        repository.deleteAll(repository.findByUserIdAndProviderId(userId, providerId));
    }

    @Override
    @Transactional
    public void purgeExpired() {
        repository.deleteExpired(Instant.now());
    }

    private static Hold map(SlotHold h) {
        return new Hold(h.getToken(), h.getUserId(), h.getProviderId(), h.getServiceId(), h.getStaffId(), h.getDate(),
                h.getStartTime(), h.getStartAt(), h.getEndAt(), h.getExpiresAt());
    }
}
