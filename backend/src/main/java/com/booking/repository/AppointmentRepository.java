package com.booking.repository;

import com.booking.entity.Appointment;
import com.booking.enums.AppointmentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface AppointmentRepository extends JpaRepository<Appointment, Long> {

    List<Appointment> findByCustomerIdOrderByDateDescStartTimeDesc(Long customerId);

    List<Appointment> findByProviderIdOrderByDateDescStartTimeDesc(Long providerId);

    List<Appointment> findByProviderIdAndDateOrderByStartTimeAsc(Long providerId, LocalDate date);

    Optional<Appointment> findByBookingRef(String bookingRef);

    long countByStatus(AppointmentStatus status);

    List<Appointment> findByStatus(AppointmentStatus status);

    @Query("select coalesce(sum(a.finalAmount),0) from Appointment a where a.status in (com.booking.enums.AppointmentStatus.COMPLETED, com.booking.enums.AppointmentStatus.CONFIRMED, com.booking.enums.AppointmentStatus.IN_PROGRESS)")
    double totalRevenue();

    @Query("select coalesce(sum(a.finalAmount),0) from Appointment a where a.provider.id = :providerId and a.status in (com.booking.enums.AppointmentStatus.COMPLETED, com.booking.enums.AppointmentStatus.IN_PROGRESS)")
    double providerRevenue(@Param("providerId") Long providerId);

    @Query("select count(a) from Appointment a where a.provider.id = :providerId and a.date = :date")
    long countByProviderAndDate(@Param("providerId") Long providerId, @Param("date") LocalDate date);

    @Query("select count(a) from Appointment a where a.customer.id = :customerId")
    long countByCustomer(@Param("customerId") Long customerId);
}