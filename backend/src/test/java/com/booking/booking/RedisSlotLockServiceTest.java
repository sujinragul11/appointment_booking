package com.booking.booking;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.SetOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** The Redis-backed hold store (app.slot-lock.store=redis) against a mocked StringRedisTemplate. */
class RedisSlotLockServiceTest {

    private static final LocalDate DATE = LocalDate.of(2030, 1, 9);
    private static final String DAY_KEY = "slothold:idx:1:2030-01-09";
    private static final String USER_KEY = "slothold:user:7:1";

    private final ObjectMapper json = JsonMapper.builder().findAndAddModules().build();
    private StringRedisTemplate redis;
    private ValueOperations<String, String> values;
    private SetOperations<String, String> sets;
    private RedisSlotLockService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        redis = mock(StringRedisTemplate.class);
        values = mock(ValueOperations.class);
        sets = mock(SetOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        when(redis.opsForSet()).thenReturn(sets);
        service = new RedisSlotLockService(redis, json);
        ReflectionTestUtils.setField(service, "ttlMinutes", 10);
    }

    private SlotLockService.Hold hold(String token, Instant expiresAt) {
        return new SlotLockService.Hold(token, 7L, 1L, 2L, null, DATE, LocalTime.of(10, 0),
                Instant.parse("2030-01-09T10:00:00Z"), Instant.parse("2030-01-09T10:30:00Z"), expiresAt);
    }

    private void stored(SlotLockService.Hold h) throws JsonProcessingException {
        when(values.get("slothold:" + h.token())).thenReturn(json.writeValueAsString(h));
    }

    @Test
    void createStoresTheHoldWithATtlAndIndexesIt() throws Exception {
        SlotLockService.Hold h = service.create(7L, 1L, 2L, 3L, DATE, LocalTime.of(10, 0),
                Instant.parse("2030-01-09T10:00:00Z"), Instant.parse("2030-01-09T10:30:00Z"));

        assertThat(h.token()).matches("[A-Za-z0-9_-]{43}");
        assertThat(h.staffId()).isEqualTo(3L);
        assertThat(h.expiresAt()).isBetween(Instant.now().plus(Duration.ofMinutes(9)), Instant.now().plus(Duration.ofMinutes(11)));
        verify(values).set(eq("slothold:" + h.token()), eq(json.writeValueAsString(h)), eq(Duration.ofMinutes(10)));
        verify(sets).add(DAY_KEY, h.token());
        verify(redis).expire(DAY_KEY, Duration.ofMinutes(11));
        verify(sets).add(USER_KEY, h.token());
        verify(redis).expire(USER_KEY, Duration.ofMinutes(11));
    }

    @Test
    void createFailsLoudlyWhenTheHoldCannotBeSerialised() throws Exception {
        ObjectMapper broken = mock(ObjectMapper.class);
        when(broken.writeValueAsString(any())).thenThrow(new JsonProcessingException("nope") { });
        RedisSlotLockService failing = new RedisSlotLockService(redis, broken);
        ReflectionTestUtils.setField(failing, "ttlMinutes", 10);

        assertThatThrownBy(() -> failing.create(7L, 1L, 2L, null, DATE, LocalTime.NOON, Instant.now(), Instant.now()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Could not store slot hold");
    }

    @Test
    void findReturnsOnlyReadableUnexpiredHolds() throws Exception {
        stored(hold("live", Instant.now().plusSeconds(300)));
        stored(hold("stale", Instant.now().minusSeconds(1)));
        when(values.get("slothold:garbage")).thenReturn("{not json");

        assertThat(service.find("live")).isPresent().get().extracting(SlotLockService.Hold::userId).isEqualTo(7L);
        assertThat(service.find("stale")).isEmpty();
        assertThat(service.find("garbage")).isEmpty();
        assertThat(service.find("missing")).isEmpty();
    }

    @Test
    void activeListsLiveHoldsAndPrunesTheIndex() throws Exception {
        stored(hold("t1", Instant.now().plusSeconds(300)));
        when(sets.members(DAY_KEY)).thenReturn(new LinkedHashSet<>(List.of("t1", "gone")));

        List<SlotLockService.Hold> active = service.active(1L, DATE);

        assertThat(active).extracting(SlotLockService.Hold::token).containsExactly("t1");
        verify(sets).remove(DAY_KEY, "gone");

        when(sets.members("slothold:idx:1:2030-01-10")).thenReturn(Set.of());
        assertThat(service.active(1L, DATE.plusDays(1))).isEmpty();
        assertThat(service.active(2L, DATE)).as("null member set").isEmpty();
    }

    @Test
    void releaseRemovesTheKeyAndIndexEntries() throws Exception {
        stored(hold("t1", Instant.now().plusSeconds(300)));

        service.release("t1");
        service.release("unknown");

        verify(sets).remove(DAY_KEY, "t1");
        verify(sets).remove(USER_KEY, "t1");
        verify(redis).delete("slothold:t1");
        verify(redis).delete("slothold:unknown");
        verify(sets, never()).remove(anyString(), eq("unknown"));
    }

    @Test
    void releaseForUserReleasesEveryHoldOfThatUserAndProvider() throws Exception {
        stored(hold("a", Instant.now().plusSeconds(300)));
        stored(hold("b", Instant.now().plusSeconds(300)));
        when(sets.members(USER_KEY)).thenReturn(Set.of("a", "b"));

        service.releaseForUser(7L, 1L);
        service.releaseForUser(8L, 1L); // nothing indexed

        verify(redis).delete("slothold:a");
        verify(redis).delete("slothold:b");
        verify(redis).delete(USER_KEY);
        verify(redis).delete("slothold:user:8:1");
        service.purgeExpired(); // native TTLs: nothing to do
    }
}
