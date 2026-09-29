package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record CouponValidateResponse(
        boolean valid,
        String message,
        String code,
        double amount,
        double discount,
        double finalAmount
) {}
