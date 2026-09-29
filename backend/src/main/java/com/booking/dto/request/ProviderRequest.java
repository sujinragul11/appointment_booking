package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record ProviderRequest(
        @NotBlank @Size(max = 120) String businessName,
        @Size(max = 5000) String description,
        @Size(max = 120) String specialty,
        Long categoryId,
        @Size(max = 100) String city,
        @Size(max = 100) String state,
        @Size(max = 100) String country,
        @Size(max = 255) String address,
        @DecimalMin("-90") @DecimalMax("90") Double latitude,
        @DecimalMin("-180") @DecimalMax("180") Double longitude,
        @Pattern(regexp = "^[+]?[0-9]{10,15}$", message = "Invalid phone number") String phone,
        @Size(max = 200) String website,
        @Size(max = 500) String logoUrl,
        @Size(max = 500) String coverUrl,
        @Size(max = 60) String timezone,
        @Min(0) @Max(480) Integer slotIntervalMin,
        @Min(0) @Max(500) Integer maxBookingsPerDay,
        @Min(1) @Max(100) Integer maxBookingsPerSlot,
        @Min(0) @Max(10080) Integer minNoticeMin,
        @Min(1) @Max(365) Integer maxAdvanceBookingDays,
        Boolean autoConfirm,
        @Min(0) @Max(720) Integer cancellationCutoffHours,
        @Min(0) @Max(100) Integer lateCancelRefundPercent,
        @Min(0) @Max(720) Integer rescheduleCutoffHours,
        @Min(0) @Max(10) Integer maxReschedules,
        @Size(max = 500) String cancellationPolicy
) {}
