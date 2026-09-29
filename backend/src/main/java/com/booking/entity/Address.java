package com.booking.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "addresses")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Address {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(length = 60)
    private String label;

    @Column(nullable = false, length = 255)
    private String addressLine;

    @Column(length = 100)
    private String city;

    @Column(length = 100)
    private String state;

    @Column(length = 60)
    private String country;

    @Column(length = 20)
    private String zip;

    private Double latitude;
    private Double longitude;

    @Column(name = "is_default", nullable = false)
    @Builder.Default
    private boolean defaultAddress = false;
}