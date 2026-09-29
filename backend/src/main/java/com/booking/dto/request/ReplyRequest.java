package com.booking.dto.request;

import jakarta.validation.constraints.NotBlank;

public record ReplyRequest(
        @NotBlank String reply
) {}