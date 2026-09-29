package com.booking.entity;

import com.booking.enums.*;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.*;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "payments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Payment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "appointment_id", nullable = false, unique = true)
    private Appointment appointment;

    /** Amount charged online now (full price or deposit). */
    @Column(nullable = false)
    private double amount;

    /** Remainder payable at the venue. */
    @Column(name = "balance_due", nullable = false)
    @Builder.Default
    private double balanceDue = 0;

    @Column(nullable = false, length = 3)
    @Builder.Default
    private String currency = "INR";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private PaymentMethod method;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_option", nullable = false, length = 20)
    @Builder.Default
    private PaymentOption option = PaymentOption.FULL;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private PaymentStatus status = PaymentStatus.PENDING;

    @Column(name = "order_id", length = 100, unique = true)
    private String orderId;

    @Column(name = "transaction_id", length = 100, unique = true)
    private String transactionId;

    @Column(name = "refund_id", length = 100)
    private String refundId;

    @Column(name = "refund_amount", nullable = false)
    @Builder.Default
    private double refundAmount = 0;

    @Column(name = "invoice_number", length = 40, unique = true)
    private String invoiceNumber;

    @Column(name = "paid_at")
    private LocalDateTime paidAt;

    @Column(name = "refunded_at")
    private LocalDateTime refundedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
