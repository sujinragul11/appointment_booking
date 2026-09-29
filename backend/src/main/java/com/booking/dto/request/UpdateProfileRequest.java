package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record UpdateProfileRequest(
        @Size(min = 2, max = 100) String name,
        @Pattern(regexp = "^[+]?[0-9]{10,15}$", message = "Phone must be 10-15 digits, optionally starting with +") String phone,
        @Size(max = 500) String photoUrl,
        Boolean notifEmail,
        Boolean notifSms,
        Boolean notifPush,
        @Pattern(regexp = "^(en|hi|ta)$", message = "Unsupported language") String language,
        @Size(max = 60) String timezone
) {}
