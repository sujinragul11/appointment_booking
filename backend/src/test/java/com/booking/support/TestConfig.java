package com.booking.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.time.ZoneOffset;

/**
 * Shared test beans. Every integration test imports exactly this configuration so the Spring
 * context is built once and cached for the whole run.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestConfig {

    /** Monday 2030-01-07 10:00 UTC: the same calendar date in UTC, London, New York and Kolkata. */
    public static final Instant BASE_INSTANT = Instant.parse("2030-01-07T10:00:00Z");

    /** Controllable "now" for every service that injects {@link java.time.Clock} (primary over ClockConfig#clock). */
    @Bean
    @Primary
    public MutableClock testClock() {
        return new MutableClock(BASE_INSTANT, ZoneOffset.UTC);
    }

    /** Same algorithm as production (BCrypt) with a low cost factor so the suite stays fast. */
    @Bean
    @Primary
    public PasswordEncoder testPasswordEncoder() {
        return new BCryptPasswordEncoder(4);
    }

    /** Scheduled jobs never fire on their own; tests invoke SchedulerJobs directly. */
    @Bean
    public SchedulingConfigurer noOpSchedulingConfigurer() {
        return registrar -> registrar.setTaskScheduler(new NoOpTaskScheduler());
    }
}
