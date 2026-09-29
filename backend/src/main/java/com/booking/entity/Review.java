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
@Table(name = "reviews", indexes = {
        @Index(name = "idx_review_provider_status", columnList = "provider_id, status")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "appointment_id", nullable = false, unique = true)
    private Appointment appointment;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "customer_id", nullable = false)
    private User customer;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "provider_id", nullable = false)
    private Provider provider;

    @Column(nullable = false)
    private int rating;

    @Column(columnDefinition = "TEXT")
    private String comment;

    /** Written reviews wait for moderation; rating-only reviews are approved immediately (FR-42). */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ReviewStatus status = ReviewStatus.PENDING;

    @Column(name = "moderation_note", length = 500)
    private String moderationNote;

    @Column(name = "moderated_at")
    private LocalDateTime moderatedAt;

    @Column(columnDefinition = "TEXT")
    private String reply;

    @Column(name = "reply_at")
    private LocalDateTime replyAt;

    @Column(name = "is_flagged", nullable = false)
    @Builder.Default
    private boolean flagged = false;

    @Column(name = "flag_reason", length = 255)
    private String flagReason;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
