package com.booking.repository;

import com.booking.entity.Slot;
import com.booking.enums.SlotStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public interface SlotRepository extends JpaRepository<Slot, Long> {

    List<Slot> findByProviderIdAndDateOrderByStartTimeAsc(Long providerId, LocalDate date);

    List<Slot> findByProviderIdAndDateAndStaffIdOrderByStartTimeAsc(Long providerId, LocalDate date, Long staffId);

    boolean existsByProviderIdAndDateAndStartTimeAndStaffId(Long providerId, LocalDate date, LocalTime start, Long staffId);

    void deleteByDateBefore(LocalDate date);

    void deleteByDateBeforeAndStatus(LocalDate date, SlotStatus status);
}