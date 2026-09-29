package com.booking.api;

import com.booking.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Per-IP fixed-window rate limiting, switched on for this class only (its own application context
 * and in-memory database). Each test uses its own client IP.
 */
@TestPropertySource(properties = {
        "app.security.rate-limit.enabled=true",
        "spring.datasource.url=jdbc:h2:mem:booking_ratelimit;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;"
                + "DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1"
})
class RateLimitApiTest extends IntegrationTestBase {

    /** The limiter counts per wall-clock minute: start each test well inside a minute. */
    @BeforeEach
    void startInsideAFreshMinuteWindow() throws InterruptedException {
        long secondOfMinute = (System.currentTimeMillis() / 1000) % 60;
        if (secondOfMinute >= 45) {
            Thread.sleep((61 - secondOfMinute) * 1000);
        }
    }

    private ResultActions from(String ip, MockHttpServletRequestBuilder request) throws Exception {
        return mvc.perform(request.with(r -> {
            r.setRemoteAddr(ip);
            return r;
        }));
    }

    private MockHttpServletRequestBuilder login() {
        return MockMvcRequestBuilders.post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"someone@example.test\",\"password\":\"Wrong1234\"}");
    }

    @Test
    void eleventhLoginWithinAMinuteFromTheSameIpIsRejected() throws Exception {
        String ip = "10.20.30.40";
        for (int i = 1; i <= 10; i++) {
            from(ip, login()).andExpect(status().isUnauthorized());
        }

        from(ip, login())
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER))
                .andExpect(jsonPath("$.status").value(429))
                .andExpect(jsonPath("$.message").value("Too many requests. Please try again in a minute."));
        // the whole auth bucket is shared (same IP, other sensitive endpoint)
        from(ip, MockMvcRequestBuilders.post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"someone@example.test\"}"))
                .andExpect(status().isTooManyRequests());

        // other clients and non-limited endpoints are unaffected
        from("10.20.30.41", login()).andExpect(status().isUnauthorized());
        from(ip, MockMvcRequestBuilders.get("/api/config")).andExpect(status().isOk());
    }

    @Test
    void bookingCreationIsLimitedPerIp() throws Exception {
        String ip = "10.20.31.1";
        String body = "{\"providerId\":1,\"serviceId\":1,\"date\":\"2030-01-09\",\"startTime\":\"10:00\",\"paymentMethod\":\"PAY_AT_VENUE\"}";
        for (int i = 1; i <= 20; i++) {
            from(ip, MockMvcRequestBuilders.post("/api/appointments").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isUnauthorized());
        }
        from(ip, MockMvcRequestBuilders.post("/api/appointments").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void publicSlotAndCouponLookupsAreLimitedPerIp() throws Exception {
        String ip = "10.20.32.1";
        for (int i = 1; i <= 120; i++) {
            from(ip, MockMvcRequestBuilders.get("/api/coupons/validate").param("code", "NONE").param("amount", "10"))
                    .andExpect(status().isBadRequest());
        }
        from(ip, MockMvcRequestBuilders.get("/api/slots").param("providerId", "1").param("serviceId", "1")
                .param("date", "2030-01-09"))
                .andExpect(status().isTooManyRequests());
    }
}
