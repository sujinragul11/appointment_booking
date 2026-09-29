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
@Table(name = "appointments", indexes = {
        @Index(name = "idx_appt_customer", columnList = "customer_id"),
        @Index(name = "idx_appt_provider_date", columnList = "provider_id, date"),
        @Index(name = "idx_appt_status", columnList = "status"),
        @Index(name = "idx_appt_start_at", columnList = "start_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Appointment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "booking_ref", nullable = false, unique = true, length = 40)
    private String bookingRef;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id", nullable = false)
    private User customer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "provider_id", nullable = false)
    private Provider provider;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "service_id", nullable = false)
    private DomainService service;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "staff_id")
    private Staff staff;

    /** Local date/time in the provider's timezone. */
    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalTime endTime;

    /** Absolute instants (UTC) used for overlap checks and reminders. */
    @Column(name = "start_at", nullable = false)
    private Instant startAt;

    @Column(name = "end_at", nullable = false)
    private Instant endAt;

    /** end_at plus the service buffer; the resource is busy until then. */
    @Column(name = "busy_until", nullable = false)
    private Instant busyUntil;

    @Column(nullable = false, length = 60)
    private String timezone;

    /**
     * Unique while the booking occupies its slot, null once it no longer does.
     * A database-level guard against double booking (FR-22).
     */
    @Column(name = "slot_key", unique = true, length = 120)
    private String slotKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private AppointmentStatus status = AppointmentStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ServiceMode mode = ServiceMode.IN_PERSON;

    @Column(name = "meeting_link", length = 300)
    private String meetingLink;

    /** Customer's notes / reason for visit (FR-25). */
    @Column(columnDefinition = "TEXT")
    private String notes;

    /** Provider's post-appointment notes / prescription (FR-32). */
    @Column(name = "provider_notes", columnDefinition = "TEXT")
    private String providerNotes;

    @Column(nullable = false)
    private double amount;

    @Column(nullable = false)
    @Builder.Default
    private double discount = 0.0;

    @Column(name = "final_amount", nullable = false)
    private double finalAmount;

    @Column(name = "coupon_code", length = 40)
    private String couponCode;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_status", nullable = false, length = 20)
    @Builder.Default
    private PaymentStatus paymentStatus = PaymentStatus.PENDING;

    @Column(name = "cancel_reason", length = 500)
    private String cancelReason;

    @Enumerated(EnumType.STRING)
    @Column(name = "cancelled_by", length = 20)
    private ActorType cancelledBy;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "reschedule_count", nullable = false)
    @Builder.Default
    private int rescheduleCount = 0;

    @Column(name = "reminder_24h_sent", nullable = false)
    @Builder.Default
    private boolean reminder24hSent = false;

    @Column(name = "reminder_1h_sent", nullable = false)
    @Builder.Default
    private boolean reminder1hSent = false;

    /** Unpaid online bookings are released after this instant. */
    @Column(name = "payment_due_at")
    private Instant paymentDueAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
