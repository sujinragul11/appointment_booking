package com.booking.support;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.cache.CacheManager;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Objects;

/** Deletes every row in foreign-key-safe order (works on H2 and PostgreSQL) and clears caches. */
@TestComponent
public class DatabaseCleaner {

    private static final List<String> TABLES = List.of(
            "reviews", "payments", "notifications", "audit_logs", "slot_holds", "verification_codes",
            "password_reset_tokens", "addresses", "staff_services", "appointments", "availability",
            "blocked_dates", "provider_branches", "coupons", "services", "staff", "providers", "categories", "users");

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private CacheManager cacheManager;

    public void clean() {
        for (String table : TABLES) {
            jdbc.update("DELETE FROM " + table);
        }
        cacheManager.getCacheNames().forEach(name -> Objects.requireNonNull(cacheManager.getCache(name)).clear());
    }
}
