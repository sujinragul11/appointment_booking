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
@Table(name = "services", indexes = {
        @Index(name = "idx_services_provider", columnList = "provider_id"),
        @Index(name = "idx_services_category", columnList = "category_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DomainService {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** The provider this service is assigned to (FR-10). */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "provider_id", nullable = false)
    private Provider provider;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "duration_min", nullable = false)
    private int durationMin;

    @Column(name = "buffer_min", nullable = false)
    @Builder.Default
    private int bufferMin = 0;

    @Column(nullable = false)
    private double price;

    /** 0 = full payment only; otherwise the customer may pay this percentage upfront. */
    @Column(name = "deposit_percent", nullable = false)
    @Builder.Default
    private int depositPercent = 0;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ServiceMode mode = ServiceMode.IN_PERSON;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;

    @Column(name = "image_url", length = 500)
    private String imageUrl;

    /** 0 = use the provider default. */
    @Column(name = "max_advance_booking_days", nullable = false)
    @Builder.Default
    private int maxAdvanceBookingDays = 0;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @ManyToMany(fetch = FetchType.LAZY)
    @JoinTable(
            name = "staff_services",
            joinColumns = @JoinColumn(name = "service_id"),
            inverseJoinColumns = @JoinColumn(name = "staff_id"))
    @Builder.Default
    private Set<Staff> staff = new HashSet<>();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
