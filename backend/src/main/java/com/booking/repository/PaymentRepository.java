package com.booking.repository;

import com.booking.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByAppointmentId(Long appointmentId);

    List<Payment> findByAppointmentIdIn(Collection<Long> appointmentIds);

    Optional<Payment> findByOrderId(String orderId);

    @Query("select coalesce(sum(p.amount - p.refundAmount), 0) from Payment p where p.status in "
            + "(com.booking.enums.PaymentStatus.SUCCESS, com.booking.enums.PaymentStatus.PARTIALLY_REFUNDED, "
            + "com.booking.enums.PaymentStatus.REFUNDED)")
    double netCollected();

    @Query("select p from Payment p join fetch p.appointment a join fetch a.provider join fetch a.service "
            + "where a.customer.id = :customerId order by p.createdAt desc")
    List<Payment> findHistoryForCustomer(@Param("customerId") Long customerId);

    @Query("select p from Payment p join fetch p.appointment a join fetch a.customer join fetch a.service "
            + "where a.provider.id = :providerId order by p.createdAt desc")
    List<Payment> findHistoryForProvider(@Param("providerId") Long providerId);
}
