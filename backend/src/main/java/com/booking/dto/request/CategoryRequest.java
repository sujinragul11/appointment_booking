package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record CategoryRequest(
        @NotBlank @Size(max = 80) String name,
        @Size(max = 100) String icon,
        @Size(max = 255) String description
) {}
