package com.booking.dto.request;

import jakarta.validation.constraints.NotBlank;

public record BranchRequest(
        @NotBlank String name,
        String address,
        String city,
        String state,
        String country,
        Double latitude,
        Double longitude,
        String phone,
        Boolean main
) {}