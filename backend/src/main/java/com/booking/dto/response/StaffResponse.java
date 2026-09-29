package com.booking.dto.response;

import java.util.List;

public record StaffResponse(
        Long id,
        Long providerId,
        String name,
        String designation,
        String photoUrl,
        String bio,
        boolean active,
        List<Long> serviceIds
) {}