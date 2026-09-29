package com.booking.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimitFilterTest {

    private static MockHttpServletRequest request(String method, String path, String ip) {
        MockHttpServletRequest r = new MockHttpServletRequest(method, path);
        r.setRemoteAddr(ip);
        return r;
    }

    /** Runs the filter and returns the response; the chain records whether the request got through. */
    private static MockHttpServletResponse run(RateLimitFilter f, MockHttpServletRequest req, MockFilterChain chain) throws Exception {
        MockHttpServletResponse res = new MockHttpServletResponse();
        f.doFilter(req, res, chain);
        return res;
    }

    @ParameterizedTest
    @CsvSource(nullValues = "null", value = {
            "POST, /api/auth/login, auth",
            "POST, /api/auth/register, auth",
            "POST, /api/auth/forgot-password, auth",
            "POST, /api/auth/reset-password, auth",
            "POST, /api/auth/verify, auth",
            "POST, /api/auth/verify-otp, auth",
            "POST, /api/auth/send-verification, auth",
            "POST, /api/auth/google, auth",
            "POST, /api/auth/refresh, auth",
            "POST, /api/appointments, booking",
            "POST, /api/slots/hold, booking",
            "GET, /api/slots, public",
            "GET, /api/coupons/validate, public",
            "GET, /api/auth/me, null",
            "POST, /api/auth/logout, null",
            "PUT, /api/appointments/5/cancel, null",
            "POST, /api/appointments/5/review, null",
            "GET, /api/providers, null",
            "DELETE, /api/slots/hold/abc, null"
    })
    void classifiesSensitiveEndpoints(String method, String path, String bucket) {
        assertThat(RateLimitFilter.bucketFor(new MockHttpServletRequest(method, path))).isEqualTo(bucket);
    }

    @Test
    void limitsEachBucketPerClientIp() throws Exception {
        RateLimitFilter f = new RateLimitFilter(true, 2, 1, 3);

        for (int i = 0; i < 2; i++) {
            MockFilterChain chain = new MockFilterChain();
            assertThat(run(f, request("POST", "/api/auth/login", "1.1.1.1"), chain).getStatus()).isEqualTo(200);
            assertThat(chain.getRequest()).isNotNull();
        }
        MockFilterChain blockedChain = new MockFilterChain();
        MockHttpServletResponse blocked = run(f, request("POST", "/api/auth/login", "1.1.1.1"), blockedChain);
        assertThat(blocked.getStatus()).isEqualTo(429);
        assertThat(blockedChain.getRequest()).as("the request never reaches the application").isNull();
        assertThat(blocked.getHeader("Retry-After")).isNotBlank();
        assertThat(Integer.parseInt(blocked.getHeader("Retry-After"))).isBetween(1, 60);
        assertThat(blocked.getContentType()).isEqualTo("application/json");
        assertThat(blocked.getContentAsString()).isEqualTo("{\"status\":429,\"message\":\"Too many requests. Please try again in a minute.\"}");

        // other IPs, other buckets and unclassified requests are counted separately
        assertThat(run(f, request("POST", "/api/auth/login", "2.2.2.2"), new MockFilterChain()).getStatus()).isEqualTo(200);
        assertThat(run(f, request("POST", "/api/appointments", "1.1.1.1"), new MockFilterChain()).getStatus()).isEqualTo(200);
        assertThat(run(f, request("POST", "/api/appointments", "1.1.1.1"), new MockFilterChain()).getStatus()).isEqualTo(429);
        for (int i = 0; i < 3; i++) {
            assertThat(run(f, request("GET", "/api/slots", "1.1.1.1"), new MockFilterChain()).getStatus()).isEqualTo(200);
        }
        assertThat(run(f, request("GET", "/api/slots", "1.1.1.1"), new MockFilterChain()).getStatus()).isEqualTo(429);
        for (int i = 0; i < 10; i++) {
            assertThat(run(f, request("GET", "/api/providers", "1.1.1.1"), new MockFilterChain()).getStatus()).isEqualTo(200);
        }
    }

    @Test
    void disabledFilterLetsEverythingThrough() throws Exception {
        RateLimitFilter f = new RateLimitFilter(false, 0, 0, 0);

        for (int i = 0; i < 5; i++) {
            MockFilterChain chain = new MockFilterChain();
            assertThat(run(f, request("POST", "/api/auth/login", "3.3.3.3"), chain).getStatus()).isEqualTo(200);
            assertThat(chain.getRequest()).isNotNull();
        }
    }
}
