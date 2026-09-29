package com.booking.entity;

import com.booking.enums.*;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.*;
import java.util.HashSet;
import java.util.Set;

/** Temporary lock on a slot while a customer checks out (TTL 10 min). */
@Entity
@Table(name = "slot_holds", indexes = {
        @Index(name = "idx_hold_provider_date", columnList = "provider_id, date"),
        @Index(name = "idx_hold_expires", columnList = "expires_at")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SlotHold {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "hold_token", nullable = false, unique = true, length = 64)
    private String token;

    @Column(name = "provider_id", nullable = false)
    private Long providerId;

    @Column(name = "service_id", nullable = false)
    private Long serviceId;

    @Column(name = "staff_id")
    private Long staffId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "start_at", nullable = false)
    private Instant startAt;

    @Column(name = "end_at", nullable = false)
    private Instant endAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
}
