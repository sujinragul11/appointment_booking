package com.booking.dto.response;

import com.booking.entity.User;
import com.booking.enums.UserRole;

import java.time.LocalDateTime;

public record UserResponse(
        Long id,
        String name,
        String email,
        String phone,
        UserRole role,
        String photoUrl,
        boolean verified,
        boolean emailVerified,
        Long providerId,
        LocalDateTime createdAt,
        boolean active
) {

    public static UserResponse of(User u) {
        return of(u, null);
    }

    public static UserResponse of(User u, Long providerId) {
        return new UserResponse(
                u.getId(), u.getName(), u.getEmail(), u.getPhone(), u.getRole(),
                u.getPhotoUrl(), u.isVerified(), u.isEmailVerified(), providerId, u.getCreatedAt(),
                u.isActive());
    }
}