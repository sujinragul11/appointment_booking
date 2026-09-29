package com.booking.repository;

import com.booking.entity.Staff;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StaffRepository extends JpaRepository<Staff, Long> {

    List<Staff> findByProviderId(Long providerId);

    List<Staff> findByProviderIdAndActiveTrue(Long providerId);

    Optional<Staff> findByIdAndProviderId(Long id, Long providerId);
}