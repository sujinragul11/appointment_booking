package com.booking.dto.request;

import com.booking.enums.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Size(min = 2, max = 100) String name,
        @NotBlank @Email String email,
        @Pattern(regexp = "^[+]?[0-9]{10,15}$", message = "Invalid phone number") String phone,
        @NotBlank @Size(min = 6, message = "Password must be at least 6 characters") String password,
        UserRole role,
        String businessName,
        Long categoryId
) {}