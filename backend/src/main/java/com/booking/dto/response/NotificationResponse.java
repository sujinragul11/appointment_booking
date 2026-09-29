package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record NotificationResponse(
        Long id,
        String title,
        String message,
        NotifType type,
        String link,
        boolean read,
        LocalDateTime createdAt
) {}
