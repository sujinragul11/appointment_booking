package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** Public e-mail verification (e.g. from the link in the verification e-mail). */
public record OtpVerifyRequest(
        @NotBlank @Email String email,
        @NotBlank @Pattern(regexp = "^[0-9]{6}$", message = "Code must be 6 digits") String otp
) {}
