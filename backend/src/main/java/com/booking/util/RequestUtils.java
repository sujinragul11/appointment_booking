package com.booking.util;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

public final class RequestUtils {

    private RequestUtils() {
    }

    /** Client IP; X-Forwarded-For is honoured via server.forward-headers-strategy. */
    public static String clientIp(HttpServletRequest request) {
        return request.getRemoteAddr();
    }

    public static String currentClientIp() {
        if (RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attrs) {
            return clientIp(attrs.getRequest());
        }
        return null;
    }
}
