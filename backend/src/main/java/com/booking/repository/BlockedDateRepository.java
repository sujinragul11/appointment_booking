package com.booking.repository;

import com.booking.entity.BlockedDate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface BlockedDateRepository extends JpaRepository<BlockedDate, Long> {

    List<BlockedDate> findByProviderIdAndDateGreaterThanEqualOrderByDateAsc(Long providerId, LocalDate from);

    List<BlockedDate> findByProviderIdAndDate(Long providerId, LocalDate date);
}
