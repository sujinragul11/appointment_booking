package com.booking.entity;

import com.booking.enums.DiscountType;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

@Entity
@Table(name = "coupons")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Coupon {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 40)
    private String code;

    @Enumerated(EnumType.STRING)
    @Column(name = "discount_type", nullable = false, length = 20)
    private DiscountType discountType;

    @Column(name = "discount_value", nullable = false)
    private double value;

    @Column(name = "min_order")
    @Builder.Default
    private double minOrder = 0;

    @Column(name = "max_discount")
    @Builder.Default
    private double maxDiscount = 0;

    @Column(name = "valid_from")
    private LocalDate validFrom;

    @Column(name = "valid_to")
    private LocalDate validTo;

    @Column(name = "usage_limit", nullable = false)
    @Builder.Default
    private int usageLimit = 0;

    @Column(name = "used_count", nullable = false)
    @Builder.Default
    private int usedCount = 0;

    /** Maximum uses per customer; 0 = unlimited. */
    @Column(name = "per_user_limit", nullable = false)
    @Builder.Default
    private int perUserLimit = 0;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @org.hibernate.annotations.CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private java.time.LocalDateTime createdAt;
}