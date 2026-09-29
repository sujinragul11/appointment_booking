package com.booking.security;

import com.booking.entity.User;
import com.booking.enums.UserRole;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;

@Getter
public class UserPrincipal implements UserDetails {

    private final Long id;
    private final String email;
    private final String name;
    private final String password;
    private final UserRole role;
    private final boolean verified;

    public UserPrincipal(Long id, String email, String name, String password, UserRole role, boolean verified) {
        this.id = id;
        this.email = email;
        this.name = name;
        this.password = password;
        this.role = role;
        this.verified = verified;
    }

    public static UserPrincipal from(User user) {
        return new UserPrincipal(user.getId(), user.getEmail(), user.getName(),
                user.getPassword(), user.getRole(), user.isVerified());
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        String roleName = switch (role) {
            case PROVIDER -> "PROVIDER";
            case CUSTOMER -> "CUSTOMER";
            case STAFF -> "STAFF";
            case ADMIN -> "ADMIN";
            default -> "GUEST";
        };
        return List.of(new SimpleGrantedAuthority("ROLE_" + roleName));
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return true;
    }
}