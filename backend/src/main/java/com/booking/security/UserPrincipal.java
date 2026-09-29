package com.booking.security;

import com.booking.entity.User;
import com.booking.enums.UserRole;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;

@Getter
public class UserPrincipal implements UserDetails {

    private final Long id;
    private final String email;
    private final String name;
    private final String password;
    private final UserRole role;
    private final boolean enabled;
    private final boolean locked;

    public UserPrincipal(Long id, String email, String name, String password, UserRole role,
                         boolean enabled, boolean locked) {
        this.id = id;
        this.email = email;
        this.name = name;
        this.password = password;
        this.role = role;
        this.enabled = enabled;
        this.locked = locked;
    }

    public static UserPrincipal from(User user) {
        boolean locked = user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now());
        return new UserPrincipal(user.getId(), user.getEmail(), user.getName(), user.getPassword(),
                user.getRole(), user.canLogin(), locked);
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_" + role.name()));
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonLocked() {
        return !locked;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }
}
