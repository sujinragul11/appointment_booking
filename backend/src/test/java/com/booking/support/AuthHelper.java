package com.booking.support;

import com.booking.dto.response.AuthResponse;
import com.booking.entity.User;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Signs users in through the real API (POST /api/auth/login) and returns their bearer tokens. */
@TestComponent
public class AuthHelper {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    public AuthResponse loginResponse(String email, String password) {
        try {
            MvcResult result = mockMvc.perform(post("/api/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("email", email, "password", password))))
                    .andExpect(status().isOk())
                    .andReturn();
            return objectMapper.readValue(result.getResponse().getContentAsString(), AuthResponse.class);
        } catch (Exception e) {
            throw new IllegalStateException("Login failed for " + email, e);
        }
    }

    /** Access token for the given credentials. */
    public String login(String email, String password) {
        return loginResponse(email, password).accessToken();
    }

    /** Access token for a user created by {@link TestDataFactory} (standard password). */
    public String token(User user) {
        return login(user.getEmail(), TestDataFactory.PASSWORD);
    }

    public static String bearer(String token) {
        return "Bearer " + token;
    }
}
