package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record AppointmentResponse(
        Long id,
        String bookingRef,
        Long customerId,
        String customerName,
        String customerEmail,
        String customerPhone,
        String customerPhoto,
        Long providerId,
        String providerName,
        String providerAddress,
        String providerPhone,
        Long serviceId,
        String serviceName,
        int durationMin,
        Long staffId,
        String staffName,
        LocalDate date,
        LocalTime startTime,
        LocalTime endTime,
        Instant startAt,
        Instant endAt,
        String timezone,
        AppointmentStatus status,
        ServiceMode mode,
        String meetingLink,
        String notes,
        String providerNotes,
        double amount,
        double discount,
        double finalAmount,
        String couponCode,
        PaymentStatus paymentStatus,
        String cancelReason,
        ActorType cancelledBy,
        Instant cancelledAt,
        int rescheduleCount,
        Instant paymentDueAt,
        PaymentResponse payment,
        boolean reviewed,
        Actions actions,
        LocalDateTime createdAt
) {
    /** What the current viewer may do next; the server enforces the same rules. */
    public record Actions(
            boolean canCancel,
            boolean canReschedule,
            boolean canPay,
            boolean canReview,
            boolean canConfirm,
            boolean canReject,
            boolean canComplete,
            boolean canMarkNoShow,
            boolean canAddNotes
    ) {}
}
