package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record StaffResponse(
        Long id,
        Long providerId,
        String name,
        String designation,
        String photoUrl,
        String bio,
        boolean active,
        List<Long> serviceIds,
        String loginEmail
) {}
