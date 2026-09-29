package com.booking.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record GoogleLoginRequest(
        @NotBlank @Email String email,
        @NotBlank String name,
        @NotBlank String googleId,
        String photoUrl
) {}