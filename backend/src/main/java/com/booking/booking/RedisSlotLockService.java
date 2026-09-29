package com.booking.booking;

import com.booking.util.BookingUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.*;

/**
 * Redis slot lock store (app.slot-lock.store=redis): each hold is a key with a native TTL,
 * indexed per provider/date and per user/provider. Shared by all application instances.
 */
@Slf4j
@Service
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.slot-lock.store", havingValue = "redis")
public class RedisSlotLockService implements SlotLockService {

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    @Value("${app.slot-lock.ttl-minutes:10}")
    private int ttlMinutes;

    private static String holdKey(String token) {
        return "slothold:" + token;
    }

    private static String dayKey(Long providerId, LocalDate date) {
        return "slothold:idx:" + providerId + ":" + date;
    }

    private static String userKey(Long userId, Long providerId) {
        return "slothold:user:" + userId + ":" + providerId;
    }

    @Override
    public Hold create(Long userId, Long providerId, Long serviceId, Long staffId, LocalDate date, LocalTime startTime,
                       Instant startAt, Instant endAt) {
        Duration ttl = Duration.ofMinutes(ttlMinutes);
        Hold hold = new Hold(BookingUtils.generateToken(), userId, providerId, serviceId, staffId, date, startTime,
                startAt, endAt, Instant.now().plus(ttl));
        try {
            redis.opsForValue().set(holdKey(hold.token()), objectMapper.writeValueAsString(hold), ttl);
        } catch (Exception e) {
            throw new IllegalStateException("Could not store slot hold", e);
        }
        redis.opsForSet().add(dayKey(providerId, date), hold.token());
        redis.expire(dayKey(providerId, date), ttl.plusMinutes(1));
        redis.opsForSet().add(userKey(userId, providerId), hold.token());
        redis.expire(userKey(userId, providerId), ttl.plusMinutes(1));
        return hold;
    }

    @Override
    public List<Hold> active(Long providerId, LocalDate date) {
        Set<String> tokens = redis.opsForSet().members(dayKey(providerId, date));
        if (tokens == null || tokens.isEmpty()) return List.of();
        List<Hold> result = new ArrayList<>();
        for (String t : tokens) {
            Optional<Hold> h = find(t);
            if (h.isPresent()) result.add(h.get());
            else redis.opsForSet().remove(dayKey(providerId, date), t);
        }
        return result;
    }

    @Override
    public Optional<Hold> find(String token) {
        String json = redis.opsForValue().get(holdKey(token));
        if (json == null) return Optional.empty();
        try {
            return Optional.of(objectMapper.readValue(json, Hold.class)).filter(h -> h.expiresAt().isAfter(Instant.now()));
        } catch (Exception e) {
            log.warn("Unreadable slot hold {}: {}", token, e.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public void release(String token) {
        find(token).ifPresent(h -> {
            redis.opsForSet().remove(dayKey(h.providerId(), h.date()), token);
            redis.opsForSet().remove(userKey(h.userId(), h.providerId()), token);
        });
        redis.delete(holdKey(token));
    }

    @Override
    public void releaseForUser(Long userId, Long providerId) {
        Set<String> tokens = redis.opsForSet().members(userKey(userId, providerId));
        if (tokens != null) tokens.forEach(this::release);
        redis.delete(userKey(userId, providerId));
    }

    @Override
    public void purgeExpired() {
        // Keys expire natively; index sets are cleaned lazily in active().
    }
}
