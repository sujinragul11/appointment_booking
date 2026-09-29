package com.booking.repository;

import com.booking.entity.DomainService;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DomainServiceRepository extends JpaRepository<DomainService, Long> {

    List<DomainService> findByProviderId(Long providerId);

    List<DomainService> findByProviderIdAndActiveTrue(Long providerId);
}