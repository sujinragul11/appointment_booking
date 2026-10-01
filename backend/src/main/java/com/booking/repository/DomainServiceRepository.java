package com.booking.repository;

import com.booking.entity.DomainService;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface DomainServiceRepository extends JpaRepository<DomainService, Long>, JpaSpecificationExecutor<DomainService> {

    List<DomainService> findByProviderIdOrderByNameAsc(Long providerId);

    List<DomainService> findByProviderIdAndActiveTrueOrderByNameAsc(Long providerId);

    boolean existsByCategoryId(Long categoryId);
}
