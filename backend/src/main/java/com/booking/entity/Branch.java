package com.booking.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "provider_branches")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Branch {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "provider_id", nullable = false)
    private Provider provider;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(length = 255)
    private String address;
    @Column(length = 100)
    private String city;
    @Column(length = 100)
    private String state;
    @Column(length = 100)
    private String country;

    private Double latitude;
    private Double longitude;

    @Column(length = 20)
    private String phone;

    @Column(name = "is_main", nullable = false)
    @Builder.Default
    private boolean main = false;
}