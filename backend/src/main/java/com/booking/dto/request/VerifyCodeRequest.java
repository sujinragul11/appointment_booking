package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record VerifyCodeRequest(
        @NotNull SendCodeRequest.VerificationChannel channel,
        @NotBlank @Pattern(regexp = "^[0-9]{6}$", message = "Code must be 6 digits") String code
) {}
