package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record UserResponse(
        Long id,
        String name,
        String email,
        String phone,
        UserRole role,
        String photoUrl,
        boolean verified,
        boolean emailVerified,
        boolean phoneVerified,
        Long providerId,
        Long staffId,
        String language,
        String timezone,
        boolean notifEmail,
        boolean notifSms,
        boolean notifPush,
        boolean active,
        LocalDateTime createdAt,
        LocalDateTime lastLoginAt
) {}
