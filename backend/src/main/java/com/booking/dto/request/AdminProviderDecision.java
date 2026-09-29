package com.booking.dto.request;

import com.booking.enums.ProviderStatus;
import jakarta.validation.constraints.NotNull;

public record AdminProviderDecision(
        @NotNull ProviderStatus status,
        String note
) {}