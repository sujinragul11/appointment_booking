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
@Table(name = "providers", indexes = {
        @Index(name = "idx_providers_city", columnList = "city"),
        @Index(name = "idx_providers_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Provider {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(name = "business_name", nullable = false, length = 120)
    private String businessName;

    /** Bio shown on the public profile (FR-13). */
    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(length = 120)
    private String specialty;

    @Column(name = "logo_url", length = 500)
    private String logoUrl;

    @Column(name = "cover_url", length = 500)
    private String coverUrl;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    @Column(length = 100)
    private String city;

    @Column(length = 100)
    private String state;

    @Column(length = 100)
    private String country;

    @Column(length = 255)
    private String address;

    private Double latitude;
    private Double longitude;

    @Column(length = 20)
    private String phone;

    @Column(length = 200)
    private String website;

    /** IANA zone the provider works in; all slot times are local to it (NFR-9). */
    @Column(nullable = false, length = 60)
    @Builder.Default
    private String timezone = "Asia/Kolkata";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ProviderStatus status = ProviderStatus.PENDING;

    @Column(name = "rating_avg", nullable = false)
    @Builder.Default
    private double rating = 0.0;

    @Column(name = "review_count", nullable = false)
    @Builder.Default
    private int reviewCount = 0;

    // ---- Scheduling rules (FR-16, FR-17) ----
    /** Minutes between slot starts; 0 = service duration + buffer. */
    @Column(name = "slot_interval_min", nullable = false)
    @Builder.Default
    private int slotIntervalMin = 0;

    /** 0 = unlimited. */
    @Column(name = "max_bookings_per_day", nullable = false)
    @Builder.Default
    private int maxBookingsPerDay = 0;

    /** Parallel bookings allowed for services that are not tied to a staff member. */
    @Column(name = "max_bookings_per_slot", nullable = false)
    @Builder.Default
    private int maxBookingsPerSlot = 1;

    @Column(name = "min_notice_min", nullable = false)
    @Builder.Default
    private int minNoticeMin = 60;

    @Column(name = "max_advance_booking_days", nullable = false)
    @Builder.Default
    private int maxAdvanceBookingDays = 30;

    @Column(name = "auto_confirm", nullable = false)
    @Builder.Default
    private boolean autoConfirm = true;

    // ---- Cancellation / reschedule policy (FR-28, FR-29, FR-39) ----
    @Column(name = "cancellation_cutoff_hours", nullable = false)
    @Builder.Default
    private int cancellationCutoffHours = 24;

    /** Refund percentage for customer cancellations inside the cut-off window. */
    @Column(name = "late_cancel_refund_percent", nullable = false)
    @Builder.Default
    private int lateCancelRefundPercent = 50;

    @Column(name = "reschedule_cutoff_hours", nullable = false)
    @Builder.Default
    private int rescheduleCutoffHours = 12;

    @Column(name = "max_reschedules", nullable = false)
    @Builder.Default
    private int maxReschedules = 2;

    @Column(name = "cancellation_policy", length = 500)
    private String cancellationPolicy;

    @Column(name = "admin_note", length = 500)
    private String adminNote;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @OneToMany(mappedBy = "provider", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private Set<Branch> branches = new HashSet<>();

    @OneToMany(mappedBy = "provider")
    @Builder.Default
    private Set<DomainService> services = new HashSet<>();

    @OneToMany(mappedBy = "provider")
    @Builder.Default
    private Set<Staff> staff = new HashSet<>();

    public ZoneId zone() {
        try {
            return ZoneId.of(timezone);
        } catch (Exception e) {
            return ZoneId.of("UTC");
        }
    }
}
