package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record ProviderResponse(
        Long id,
        String businessName,
        String description,
        String specialty,
        String logoUrl,
        String coverUrl,
        CategoryResponse category,
        String city,
        String state,
        String country,
        String address,
        Double latitude,
        Double longitude,
        String phone,
        String website,
        String timezone,
        ProviderStatus status,
        double rating,
        int reviewCount,
        Double minPrice,
        Double maxPrice,
        Policy policy,
        String ownerName,
        String ownerEmail,
        String adminNote,
        LocalDateTime createdAt,
        List<ServiceResponse> services,
        List<StaffResponse> staff,
        List<BranchResponse> branches
) {
    /** Scheduling and cancellation rules (FR-16, FR-17, FR-28, FR-29). */
    public record Policy(
            int slotIntervalMin,
            int maxBookingsPerDay,
            int maxBookingsPerSlot,
            int minNoticeMin,
            int maxAdvanceBookingDays,
            boolean autoConfirm,
            int cancellationCutoffHours,
            int lateCancelRefundPercent,
            int rescheduleCutoffHours,
            int maxReschedules,
            String cancellationPolicy
    ) {}
}
