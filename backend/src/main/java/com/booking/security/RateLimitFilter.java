package com.booking.security;

import com.booking.util.RequestUtils;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Fixed-window rate limiting per client IP for sensitive endpoints: login, registration,
 * OTP / password reset (brute force) and booking creation. Single-instance, in-memory;
 * put a shared limiter (e.g. at the reverse proxy) in front of multi-instance deployments.
 */
@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final boolean enabled;
    private final int authPerMinute;
    private final int bookingPerMinute;
    private final int publicPerMinute;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    public RateLimitFilter(@Value("${app.security.rate-limit.enabled:true}") boolean enabled,
                           @Value("${app.security.rate-limit.auth-per-minute:10}") int authPerMinute,
                           @Value("${app.security.rate-limit.booking-per-minute:20}") int bookingPerMinute,
                           @Value("${app.security.rate-limit.public-per-minute:120}") int publicPerMinute) {
        this.enabled = enabled;
        this.authPerMinute = authPerMinute;
        this.bookingPerMinute = bookingPerMinute;
        this.publicPerMinute = publicPerMinute;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!enabled) {
            chain.doFilter(request, response);
            return;
        }
        String bucket = bucketFor(request);
        if (bucket != null) {
            int limit = switch (bucket) {
                case "auth" -> authPerMinute;
                case "booking" -> bookingPerMinute;
                default -> publicPerMinute;
            };
            String key = bucket + "|" + RequestUtils.clientIp(request);
            long minute = System.currentTimeMillis() / 60_000;
            Window w = windows.compute(key, (k, old) -> old == null || old.minute != minute ? new Window(minute) : old);
            if (w.count.incrementAndGet() > limit) {
                response.setStatus(429);
                response.setHeader("Retry-After", String.valueOf(60 - (System.currentTimeMillis() / 1000) % 60));
                response.setContentType("application/json");
                response.getWriter().write("{\"status\":429,\"message\":\"Too many requests. Please try again in a minute.\"}");
                return;
            }
            if (windows.size() > 50_000) {
                windows.entrySet().removeIf(e -> e.getValue().minute != minute);
            }
        }
        chain.doFilter(request, response);
    }

    static String bucketFor(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        if ("POST".equals(method) && (path.startsWith("/api/auth/login") || path.startsWith("/api/auth/register")
                || path.startsWith("/api/auth/forgot-password") || path.startsWith("/api/auth/reset-password")
                || path.startsWith("/api/auth/verify") || path.startsWith("/api/auth/send-verification")
                || path.startsWith("/api/auth/google") || path.startsWith("/api/auth/refresh"))) {
            return "auth";
        }
        if ("POST".equals(method) && (path.equals("/api/appointments") || path.startsWith("/api/slots/hold"))) {
            return "booking";
        }
        if ("GET".equals(method) && (path.startsWith("/api/slots") || path.startsWith("/api/coupons/validate"))) {
            return "public";
        }
        return null;
    }

    private static final class Window {
        final long minute;
        final AtomicInteger count = new AtomicInteger();

        Window(long minute) {
            this.minute = minute;
        }
    }
}
