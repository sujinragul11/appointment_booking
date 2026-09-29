package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record StaffRequest(
        @NotBlank @Size(max = 120) String name,
        @Size(max = 120) String designation,
        @Size(max = 500) String photoUrl,
        @Size(max = 5000) String bio,
        Boolean active,
        List<Long> serviceIds,
        /** When set, a STAFF login is created and a set-password link is e-mailed. */
        @Email @Size(max = 150) String email
) {}
