package com.booking.repository;

import com.booking.entity.Availability;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AvailabilityRepository extends JpaRepository<Availability, Long> {

    List<Availability> findByProviderId(Long providerId);

    List<Availability> findByProviderIdAndStaffIsNull(Long providerId);

    List<Availability> findByProviderIdAndStaffId(Long providerId, Long staffId);
}