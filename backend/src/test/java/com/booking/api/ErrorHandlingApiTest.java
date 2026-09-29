package com.booking.api;

import com.booking.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.util.Map;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Consistent JSON error bodies, routing errors, security headers, CORS and public infrastructure endpoints. */
class ErrorHandlingApiTest extends IntegrationTestBase {

    @Test
    void malformedJsonIsABadRequest() throws Exception {
        post("/api/auth/login", null, "{\"email\": \"broken\"")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.error").value("Bad Request"))
                .andExpect(jsonPath("$.message").value("Malformed request"))
                .andExpect(jsonPath("$.timestamp").exists());
        post("/api/auth/register", null, "[1, 2, 3]").andExpect(status().isBadRequest());
    }

    @Test
    void validationErrorsIncludeAFieldErrorMap() throws Exception {
        post("/api/auth/register", null, Map.of())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty())
                .andExpect(jsonPath("$.errors").isMap())
                .andExpect(jsonPath("$.errors.name").exists())
                .andExpect(jsonPath("$.errors.email").exists())
                .andExpect(jsonPath("$.errors.password").exists());
        post("/api/auth/login", null, Map.of("email", "x@example.test"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.password").value("must not be blank"));
    }

    @Test
    void unknownRoutesAreNotFoundForSignedInUsers() throws Exception {
        String token = auth.token(data.customer());

        get("/api/does-not-exist", token)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.message").value("Not found"));
        // anonymous callers are asked to authenticate first
        get("/api/does-not-exist", null).andExpect(status().isUnauthorized());
        // everything outside /api is denied
        get("/internal/secret", null).andExpect(status().isUnauthorized());
        get("/internal/secret", token)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("You do not have permission to perform this action"));
    }

    @Test
    void unsupportedMethodsAreMethodNotAllowed() throws Exception {
        String token = auth.token(data.customer());

        delete("/api/config", token)
                .andExpect(status().isMethodNotAllowed())
                .andExpect(jsonPath("$.status").value(405))
                .andExpect(jsonPath("$.message").value("Method not allowed"));
        mvc.perform(withAuth(MockMvcRequestBuilders.patch("/api/auth/login"), token)).andExpect(status().isMethodNotAllowed());
    }

    @Test
    void badParametersAreReportedByName() throws Exception {
        get("/api/slots?providerId=abc&serviceId=1&date=2030-01-09", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid value for parameter: providerId"));
        get("/api/slots?serviceId=1&date=2030-01-09", null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Missing parameter: providerId"));
        get("/api/appointments/not-a-number", auth.token(data.customer()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid value for parameter: id"));
    }

    @Test
    void securityHeadersAndCorsAreApplied() throws Exception {
        get("/api/config", null)
                .andExpect(status().isOk())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"));

        mvc.perform(MockMvcRequestBuilders.options("/api/providers")
                        .header(HttpHeaders.ORIGIN, "http://localhost:5173")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isOk())
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_ORIGIN, "http://localhost:5173"))
                .andExpect(header().string(HttpHeaders.ACCESS_CONTROL_ALLOW_CREDENTIALS, "true"));
        mvc.perform(MockMvcRequestBuilders.options("/api/providers")
                        .header(HttpHeaders.ORIGIN, "https://evil.example")
                        .header(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET"))
                .andExpect(status().isForbidden());
    }

    @Test
    void healthAndApiDocsArePublic() throws Exception {
        get("/actuator/health", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
        mvc.perform(MockMvcRequestBuilders.get("/v3/api-docs").accept(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.info.version").value("2.0.0"))
                .andExpect(jsonPath("$.components.securitySchemes.bearerAuth.scheme").value("bearer"));
    }
}
