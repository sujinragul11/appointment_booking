package com.booking.dto.request;

import jakarta.validation.constraints.NotBlank;

public record OtpVerifyRequest(
        @NotBlank String email,
        @NotBlank String otp
) {}