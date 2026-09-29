package com.booking.dto.response;

import com.booking.enums.NotifType;

import java.time.LocalDateTime;

public record NotificationResponse(
        Long id,
        String title,
        String message,
        NotifType type,
        boolean read,
        LocalDateTime createdAt
) {}