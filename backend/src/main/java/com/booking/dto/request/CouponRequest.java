package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record CouponRequest(
        @NotBlank @Pattern(regexp = "^[A-Za-z0-9_-]{3,40}$", message = "Code must be 3-40 letters, digits, - or _") String code,
        @NotNull DiscountType discountType,
        @Positive double value,
        @PositiveOrZero double minOrder,
        @PositiveOrZero double maxDiscount,
        LocalDate validFrom,
        LocalDate validTo,
        @Min(0) int usageLimit,
        @Min(0) Integer perUserLimit,
        Boolean active
) {}
