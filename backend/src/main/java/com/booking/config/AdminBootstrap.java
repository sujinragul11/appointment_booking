package com.booking.config;

import com.booking.entity.User;
import com.booking.enums.UserRole;
import com.booking.repository.UserRepository;
import com.booking.validation.StrongPasswordValidator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Creates the first admin from ADMIN_EMAIL / ADMIN_PASSWORD when no admin exists (production setup). */
@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class AdminBootstrap implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.bootstrap-admin.email:}")
    private String email;

    @Value("${app.bootstrap-admin.password:}")
    private String password;

    @Override
    @Transactional
    public void run(String... args) {
        if (email.isBlank() || password.isBlank() || userRepository.existsByRole(UserRole.ADMIN)) {
            return;
        }
        if (!StrongPasswordValidator.isStrong(password)) {
            throw new IllegalStateException("ADMIN_PASSWORD must be 8+ characters with upper case, lower case and a number");
        }
        userRepository.save(User.builder().name("Administrator").email(email.trim().toLowerCase())
                .password(passwordEncoder.encode(password)).role(UserRole.ADMIN).verified(true).build());
        log.info("Bootstrap admin account created for {}", email);
    }
}
