package com.booking.repository;

import com.booking.entity.Provider;
import com.booking.enums.ProviderStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ProviderRepository extends JpaRepository<Provider, Long>, JpaSpecificationExecutor<Provider> {

    Optional<Provider> findByUserId(Long userId);

    long countByStatus(ProviderStatus status);

    List<Provider> findByStatus(ProviderStatus status);

    /** Serialises bookings per provider so capacity checks are race-free (FR-22). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Provider p where p.id = :id")
    Optional<Provider> lockById(@Param("id") Long id);
}
