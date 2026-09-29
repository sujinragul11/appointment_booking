package com.booking.config;

import com.booking.security.JwtAuthFilter;
import com.booking.security.RateLimitFilter;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

/**
 * Stateless JWT security. CSRF protection is not needed because authentication is a
 * bearer token in the Authorization header (never a cookie), so browsers do not attach
 * it to cross-site requests. Role checks: URL rules below + @PreAuthorize on controllers.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;
    private final RateLimitFilter rateLimitFilter;

    @Value("${spring.h2.console.enabled:false}")
    private boolean h2Console;

    private static final String[] PUBLIC_POST = {
            "/api/auth/register", "/api/auth/login", "/api/auth/refresh", "/api/auth/google",
            "/api/auth/verify-otp", "/api/auth/forgot-password", "/api/auth/reset-password",
            "/api/payments/webhook"
    };

    private static final String[] PUBLIC_GET = {
            "/api/providers", "/api/providers/**", "/api/categories", "/api/categories/**",
            "/api/services", "/api/services/**", "/api/staff/provider/**",
            "/api/slots", "/api/reviews/provider/**", "/api/uploads/**", "/api/coupons/validate",
            "/api/config", "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html",
            "/actuator/health", "/actuator/health/**", "/actuator/info"
    };

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {})
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .headers(h -> {
                    h.contentTypeOptions(c -> {});
                    h.httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31536000));
                    h.referrerPolicy(r -> r.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN));
                    if (h2Console) {
                        h.frameOptions(f -> f.sameOrigin());
                    } else {
                        h.frameOptions(f -> f.deny());
                    }
                })
                .authorizeHttpRequests(auth -> {
                    if (h2Console) {
                        auth.requestMatchers("/h2-console/**").permitAll();
                    }
                    auth.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                            .requestMatchers(HttpMethod.POST, PUBLIC_POST).permitAll()
                            .requestMatchers(HttpMethod.GET, PUBLIC_GET).permitAll()
                            .requestMatchers("/api/admin/**").hasRole("ADMIN")
                            .requestMatchers("/api/provider/**").hasRole("PROVIDER")
                            .requestMatchers("/api/staff-portal/**").hasRole("STAFF")
                            .requestMatchers("/api/**").authenticated()
                            .anyRequest().denyAll();
                })
                .exceptionHandling(ex -> ex
                        .authenticationEntryPoint((req, res, e) -> writeError(res, HttpServletResponse.SC_UNAUTHORIZED, "Authentication required"))
                        .accessDeniedHandler((req, res, e) -> writeError(res, HttpServletResponse.SC_FORBIDDEN, "You do not have permission to perform this action")))
                .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    private static void writeError(HttpServletResponse res, int status, String message) throws java.io.IOException {
        res.setStatus(status);
        res.setContentType("application/json");
        res.setCharacterEncoding("UTF-8");
        res.getWriter().write("{\"status\":" + status + ",\"message\":\"" + message + "\"}");
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
