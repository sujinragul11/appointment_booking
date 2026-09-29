package com.booking.repository;

import com.booking.entity.Review;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    List<Review> findByProviderIdOrderByCreatedAtDesc(Long providerId);

    Optional<Review> findByAppointmentId(Long appointmentId);

    long countByProviderId(Long providerId);

    @Query("select coalesce(avg(r.rating), 0) from Review r where r.provider.id = :providerId")
    double avgRating(@Param("providerId") Long providerId);
}