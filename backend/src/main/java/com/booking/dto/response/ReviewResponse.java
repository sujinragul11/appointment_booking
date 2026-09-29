package com.booking.dto.response;

import java.time.LocalDateTime;

public record ReviewResponse(
        Long id,
        Long appointmentId,
        Long customerId,
        String customerName,
        String customerPhoto,
        int rating,
        String comment,
        String reply,
        LocalDateTime replyAt,
        LocalDateTime createdAt
) {}