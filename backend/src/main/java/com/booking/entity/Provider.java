package com.booking.entity;

import com.booking.enums.ProviderStatus;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
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
    @JoinColumn(name = "user_id", unique = true)
    private User user;

    @Column(name = "business_name", nullable = false, length = 120)
    private String businessName;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "logo_url", length = 500)
    private String logoUrl;

    @Column(name = "cover_url", length = 500)
    private String coverUrl;

    @ManyToOne(fetch = FetchType.EAGER)
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

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private ProviderStatus status = ProviderStatus.PENDING;

    @Column(nullable = false)
    @Builder.Default
    private double rating = 0.0;

    @Column(name = "review_count", nullable = false)
    @Builder.Default
    private int reviewCount = 0;

    @Column(name = "max_advance_booking_days", nullable = false)
    @Builder.Default
    private int maxAdvanceBookingDays = 30;

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

    @OneToMany(mappedBy = "provider", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private Set<DomainService> services = new HashSet<>();

    @OneToMany(mappedBy = "provider", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private Set<Staff> staff = new HashSet<>();

    @OneToMany(mappedBy = "provider", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private Set<Availability> availability = new HashSet<>();
}