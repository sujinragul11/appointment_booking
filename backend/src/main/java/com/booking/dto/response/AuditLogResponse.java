package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record AuditLogResponse(
        Long id,
        Long actorId,
        String actorEmail,
        String actorRole,
        String action,
        String entityType,
        Long entityId,
        String details,
        String ipAddress,
        LocalDateTime createdAt
) {}
