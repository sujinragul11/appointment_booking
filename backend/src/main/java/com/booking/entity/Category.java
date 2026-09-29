package com.booking.entity;

import jakarta.persistence.*;
import lombok.*;

import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "categories")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Category {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 80)
    private String name;

    @Column(length = 100)
    private String icon;

    @Column(length = 120)
    private String slug;

    @OneToMany(mappedBy = "category")
    @Builder.Default
    private Set<Provider> providers = new HashSet<>();
}