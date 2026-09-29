package com.booking.repository;

import com.booking.entity.SlotHold;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface SlotHoldRepository extends JpaRepository<SlotHold, Long> {

    List<SlotHold> findByProviderIdAndDateAndExpiresAtAfter(Long providerId, LocalDate date, Instant now);

    Optional<SlotHold> findByToken(String token);

    List<SlotHold> findByUserIdAndProviderId(Long userId, Long providerId);

    @Modifying
    @Query("delete from SlotHold h where h.expiresAt < :now")
    int deleteExpired(@Param("now") Instant now);
}
