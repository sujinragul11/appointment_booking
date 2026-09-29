package com.booking.dto.request;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

public record StaffRequest(
        @NotBlank String name,
        String designation,
        String photoUrl,
        String bio,
        Boolean active,
        List<Long> serviceIds
) {}