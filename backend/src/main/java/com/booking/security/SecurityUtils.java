package com.booking.security;

import com.booking.enums.UserRole;
import com.booking.exception.ApiException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

public final class SecurityUtils {

    private SecurityUtils() {
    }

    public static Optional<UserPrincipal> current() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof UserPrincipal principal) {
            return Optional.of(principal);
        }
        return Optional.empty();
    }

    public static UserPrincipal currentUser() {
        return current().orElseThrow(() -> ApiException.unauthorized("Not authenticated"));
    }

    public static Long currentUserId() {
        return currentUser().getId();
    }

    public static boolean hasRole(UserRole role) {
        return current().map(p -> p.getRole() == role).orElse(false);
    }
}
