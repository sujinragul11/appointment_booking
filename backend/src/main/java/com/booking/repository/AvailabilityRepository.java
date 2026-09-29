package com.booking.repository;

import com.booking.entity.Availability;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AvailabilityRepository extends JpaRepository<Availability, Long> {

    List<Availability> findByProviderIdOrderByDayOfWeekAscStartTimeAsc(Long providerId);

    List<Availability> findByProviderIdAndStaffIsNullAndDayOfWeekAndActiveTrue(Long providerId, int dayOfWeek);

    List<Availability> findByProviderIdAndStaffIdAndDayOfWeekAndActiveTrue(Long providerId, Long staffId, int dayOfWeek);

    boolean existsByProviderIdAndActiveTrueAndDayOfWeek(Long providerId, int dayOfWeek);
}
