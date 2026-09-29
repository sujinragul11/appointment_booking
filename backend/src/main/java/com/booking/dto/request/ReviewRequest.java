package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record ReviewRequest(
        @NotNull Long appointmentId,
        @Min(1) @Max(5) int rating,
        @Size(max = 2000) String comment
) {}
