package com.booking.dto.request;

import jakarta.validation.constraints.NotBlank;

public record AddressRequest(
        String label,
        @NotBlank String addressLine,
        String city,
        String state,
        String country,
        String zip,
        Double latitude,
        Double longitude,
        Boolean defaultAddress
) {}