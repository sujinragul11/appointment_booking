package com.booking.config;

import com.booking.entity.User;
import com.booking.enums.UserRole;
import com.booking.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminBootstrapTest {

    private UserRepository users;
    private PasswordEncoder encoder;
    private AdminBootstrap bootstrap;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        encoder = mock(PasswordEncoder.class);
        when(encoder.encode(any())).thenReturn("encoded");
        bootstrap = new AdminBootstrap(users, encoder);
    }

    private void configure(String email, String password) {
        ReflectionTestUtils.setField(bootstrap, "email", email);
        ReflectionTestUtils.setField(bootstrap, "password", password);
    }

    @Test
    void doesNothingWithoutCredentials() {
        configure("", "Secret123");
        bootstrap.run();
        configure("admin@example.test", " ");
        bootstrap.run();

        verify(users, never()).save(any());
    }

    @Test
    void doesNothingWhenAnAdminAlreadyExists() {
        configure("admin@example.test", "Secret123");
        when(users.existsByRole(UserRole.ADMIN)).thenReturn(true);

        bootstrap.run();

        verify(users, never()).save(any());
    }

    @Test
    void refusesAWeakPassword() {
        configure("admin@example.test", "password");

        assertThatThrownBy(bootstrap::run)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("ADMIN_PASSWORD");
        verify(users, never()).save(any());
    }

    @Test
    void createsTheFirstAdmin() {
        configure("  Admin@Example.TEST ", "Secret123");

        bootstrap.run();

        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).save(saved.capture());
        assertThat(saved.getValue().getEmail()).isEqualTo("admin@example.test");
        assertThat(saved.getValue().getRole()).isEqualTo(UserRole.ADMIN);
        assertThat(saved.getValue().isVerified()).isTrue();
        assertThat(saved.getValue().getPassword()).isEqualTo("encoded");
    }
}
