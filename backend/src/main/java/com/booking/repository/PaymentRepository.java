package com.booking.repository;

import com.booking.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

    Optional<Payment> findByAppointmentId(Long appointmentId);

    List<Payment> findByAppointmentCustomerIdOrderByAppointmentDateDesc(Long customerId);

    Optional<Payment> findByOrderId(String orderId);
}