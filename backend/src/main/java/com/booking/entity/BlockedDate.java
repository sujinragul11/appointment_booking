package com.booking.entity;

import com.booking.enums.*;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.*;
import java.util.HashSet;
import java.util.Set;

/**
 * A whole-day block (holiday / leave) or, when {@code available} is true, custom
 * working hours for one date (FR-15).
 */
@Entity
@Table(name = "blocked_dates", uniqueConstraints = {
        @UniqueConstraint(name = "uk_blocked_provider_staff_date", columnNames = {"provider_id", "staff_id", "date"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BlockedDate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "provider_id", nullable = false)
    private Provider provider;

    /** null = the whole provider (all staff). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "staff_id")
    private Staff staff;

    @Column(nullable = false)
    private LocalDate date;

    /** When set, only this time range is blocked (or, if available=true, these are the hours). */
    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(name = "is_available", nullable = false)
    @Builder.Default
    private boolean available = false;

    @Column(length = 255)
    private String reason;
}
