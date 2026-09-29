package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record AuthResponse(
        String accessToken,
        String refreshToken,
        String tokenType,
        long expiresIn,
        UserResponse user
) {}
