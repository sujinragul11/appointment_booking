package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record AddressRequest(
        @Size(max = 60) String label,
        @NotBlank @Size(max = 255) String addressLine,
        @Size(max = 100) String city,
        @Size(max = 100) String state,
        @Size(max = 60) String country,
        @Size(max = 20) String zip,
        Double latitude,
        Double longitude,
        Boolean defaultAddress
) {}
