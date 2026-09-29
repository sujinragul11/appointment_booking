package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record CancellationPreviewResponse(
        boolean allowed,
        String message,
        double paidAmount,
        int refundPercent,
        double refundAmount,
        int cutoffHours,
        Instant cutoffAt
) {}
