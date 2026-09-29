package com.booking.repository;

import com.booking.entity.Provider;
import com.booking.enums.ProviderStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface ProviderRepository extends JpaRepository<Provider, Long>, JpaSpecificationExecutor<Provider> {

    Optional<Provider> findByUserId(Long userId);

    long countByStatus(ProviderStatus status);

    List<Provider> findTop6ByStatusOrderByRatingDesc(ProviderStatus status);
}