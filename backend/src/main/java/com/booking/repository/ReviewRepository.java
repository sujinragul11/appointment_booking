package com.booking.repository;

import com.booking.entity.Review;
import com.booking.enums.ReviewStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    @EntityGraph(attributePaths = {"customer"})
    List<Review> findByProviderIdAndStatusOrderByCreatedAtDesc(Long providerId, ReviewStatus status);

    @EntityGraph(attributePaths = {"customer"})
    List<Review> findByProviderIdOrderByCreatedAtDesc(Long providerId);

    @EntityGraph(attributePaths = {"customer", "provider"})
    Page<Review> findByStatus(ReviewStatus status, Pageable pageable);

    @EntityGraph(attributePaths = {"customer", "provider"})
    Page<Review> findByFlaggedTrue(Pageable pageable);

    Optional<Review> findByAppointmentId(Long appointmentId);

    long countByStatus(ReviewStatus status);

    @Query("select coalesce(avg(r.rating), 0) from Review r where r.provider.id = :providerId "
            + "and r.status = com.booking.enums.ReviewStatus.APPROVED")
    double approvedAverage(@Param("providerId") Long providerId);

    @Query("select count(r) from Review r where r.provider.id = :providerId and r.status = com.booking.enums.ReviewStatus.APPROVED")
    long approvedCount(@Param("providerId") Long providerId);
}
