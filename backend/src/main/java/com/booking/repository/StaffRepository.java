package com.booking.repository;

import com.booking.entity.Staff;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StaffRepository extends JpaRepository<Staff, Long> {

    List<Staff> findByProviderIdOrderByNameAsc(Long providerId);

    List<Staff> findByProviderIdAndActiveTrueOrderByNameAsc(Long providerId);

    Optional<Staff> findByIdAndProviderId(Long id, Long providerId);

    Optional<Staff> findByUserId(Long userId);
}
