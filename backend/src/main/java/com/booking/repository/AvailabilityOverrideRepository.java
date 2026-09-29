package com.booking.repository;

import com.booking.entity.AvailabilityOverride;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface AvailabilityOverrideRepository extends JpaRepository<AvailabilityOverride, Long> {

    List<AvailabilityOverride> findByProviderId(Long providerId);

    Optional<AvailabilityOverride> findByProviderIdAndDate(Long providerId, LocalDate date);
}