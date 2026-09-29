package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record ReviewResponse(
        Long id,
        Long appointmentId,
        Long providerId,
        String providerName,
        Long customerId,
        String customerName,
        String customerPhoto,
        int rating,
        String comment,
        ReviewStatus status,
        String moderationNote,
        boolean flagged,
        String flagReason,
        String reply,
        LocalDateTime replyAt,
        LocalDateTime createdAt
) {}
