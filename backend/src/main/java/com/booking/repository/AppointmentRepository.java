package com.booking.repository;

import com.booking.entity.Appointment;
import com.booking.enums.AppointmentStatus;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface AppointmentRepository extends JpaRepository<Appointment, Long>, JpaSpecificationExecutor<Appointment> {

    @EntityGraph(attributePaths = {"customer", "provider", "service", "staff"})
    List<Appointment> findByCustomerIdOrderByDateDescStartTimeDesc(Long customerId);

    @EntityGraph(attributePaths = {"customer", "provider", "service", "staff"})
    List<Appointment> findByProviderIdOrderByDateDescStartTimeDesc(Long providerId);

    @EntityGraph(attributePaths = {"customer", "provider", "service", "staff"})
    List<Appointment> findByProviderIdAndDateOrderByStartTimeAsc(Long providerId, LocalDate date);

    @EntityGraph(attributePaths = {"customer", "provider", "service", "staff"})
    List<Appointment> findByStaffIdOrderByDateDescStartTimeDesc(Long staffId);

    boolean existsByBookingRef(String bookingRef);

    long countByStatus(AppointmentStatus status);

    /** Appointments that may overlap a window on a provider's calendar. */
    @Query("select a from Appointment a where a.provider.id = :providerId and a.status in :statuses "
            + "and a.startAt < :to and a.busyUntil > :from")
    List<Appointment> findOverlapping(@Param("providerId") Long providerId,
                                      @Param("statuses") Collection<AppointmentStatus> statuses,
                                      @Param("from") Instant from,
                                      @Param("to") Instant to);

    @Query("select count(a) from Appointment a where a.provider.id = :providerId and a.date = :date and a.status in :statuses")
    long countOnDate(@Param("providerId") Long providerId, @Param("date") LocalDate date,
                     @Param("statuses") Collection<AppointmentStatus> statuses);

    @Query("select count(a) from Appointment a where a.customer.id = :customerId and upper(a.couponCode) = upper(:code) "
            + "and a.status <> com.booking.enums.AppointmentStatus.CANCELLED")
    long countCouponUses(@Param("customerId") Long customerId, @Param("code") String code);

    @EntityGraph(attributePaths = {"customer", "provider", "service", "staff"})
    @Query("select a from Appointment a where a.status in :statuses and a.startAt > :from and a.startAt <= :to")
    List<Appointment> findStartingBetween(@Param("statuses") Collection<AppointmentStatus> statuses,
                                          @Param("from") Instant from, @Param("to") Instant to);

    @Query("select a.id from Appointment a where a.status = com.booking.enums.AppointmentStatus.PENDING "
            + "and a.paymentDueAt is not null and a.paymentDueAt < :now")
    List<Long> findExpiredUnpaid(@Param("now") Instant now);

    @EntityGraph(attributePaths = {"customer", "provider", "service", "staff"})
    Optional<Appointment> findWithDetailsById(Long id);

    @EntityGraph(attributePaths = {"customer", "provider", "service", "staff"})
    @Query("select a from Appointment a where a.date between :from and :to")
    List<Appointment> findBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @EntityGraph(attributePaths = {"customer", "provider", "service", "staff"})
    @Query("select a from Appointment a where a.provider.id = :providerId and a.date between :from and :to")
    List<Appointment> findForProviderBetween(@Param("providerId") Long providerId,
                                             @Param("from") LocalDate from, @Param("to") LocalDate to);
}
