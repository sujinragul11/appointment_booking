package com.booking.dto.response;

public record AddressResponse(
        Long id,
        String label,
        String addressLine,
        String city,
        String state,
        String country,
        String zip,
        Double latitude,
        Double longitude,
        boolean defaultAddress
) {}