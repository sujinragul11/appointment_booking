package com.booking.security;

import com.booking.entity.User;
import com.booking.enums.UserRole;
import com.booking.exception.ApiException;
import com.booking.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UsernameNotFoundException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** SecurityUtils, UserPrincipal, UserDetailsServiceImpl and the JWT filter in isolation. */
class SecurityComponentsTest {

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private static User user(boolean active, boolean deleted, LocalDateTime lockedUntil) {
        return User.builder().id(5L).name("Jane").email("jane@example.test").password("hash").role(UserRole.STAFF)
                .active(active).deleted(deleted).lockedUntil(lockedUntil).tokenVersion(2).build();
    }

    @Test
    void securityUtilsWithoutAuthentication() {
        assertThat(SecurityUtils.current()).isEmpty();
        assertThat(SecurityUtils.hasRole(UserRole.ADMIN)).isFalse();
        assertThatThrownBy(SecurityUtils::currentUserId)
                .isInstanceOf(ApiException.class)
                .satisfies(e -> assertThat(((ApiException) e).getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED));

        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("anonymous", null, List.of()));
        assertThat(SecurityUtils.current()).as("non-application principals are ignored").isEmpty();
    }

    @Test
    void securityUtilsWithAUserPrincipal() {
        UserPrincipal principal = UserPrincipal.from(user(true, false, null));
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities()));

        assertThat(SecurityUtils.currentUser()).isSameAs(principal);
        assertThat(SecurityUtils.currentUserId()).isEqualTo(5L);
        assertThat(SecurityUtils.hasRole(UserRole.STAFF)).isTrue();
        assertThat(SecurityUtils.hasRole(UserRole.ADMIN)).isFalse();
    }

    @Test
    void userPrincipalReflectsAccountState() {
        UserPrincipal ok = UserPrincipal.from(user(true, false, LocalDateTime.now().minusMinutes(1)));
        assertThat(ok.getUsername()).isEqualTo("jane@example.test");
        assertThat(ok.getPassword()).isEqualTo("hash");
        assertThat(ok.getName()).isEqualTo("Jane");
        assertThat(ok.isEnabled()).isTrue();
        assertThat(ok.isAccountNonLocked()).isTrue();
        assertThat(ok.getAuthorities()).extracting(GrantedAuthority::getAuthority).containsExactly("ROLE_STAFF");

        assertThat(UserPrincipal.from(user(true, false, LocalDateTime.now().plusMinutes(5))).isAccountNonLocked()).isFalse();
        assertThat(UserPrincipal.from(user(false, false, null)).isEnabled()).isFalse();
        assertThat(UserPrincipal.from(user(true, true, null)).isEnabled()).isFalse();
    }

    @Test
    void userDetailsServiceLooksUpByEmail() {
        UserRepository repo = mock(UserRepository.class);
        when(repo.findByEmailIgnoreCase("jane@example.test")).thenReturn(Optional.of(user(true, false, null)));
        UserDetailsServiceImpl service = new UserDetailsServiceImpl(repo);

        UserDetails details = service.loadUserByUsername("  jane@example.test ");
        assertThat(details.getUsername()).isEqualTo("jane@example.test");
        assertThatThrownBy(() -> service.loadUserByUsername("nobody@example.test"))
                .isInstanceOf(UsernameNotFoundException.class);
    }

    @Test
    void jwtFilterAuthenticatesOnlyCurrentAccessTokensOfActiveUsers() throws Exception {
        JwtService jwt = mock(JwtService.class);
        UserRepository repo = mock(UserRepository.class);
        JwtAuthFilter filter = new JwtAuthFilter(jwt, repo);
        when(jwt.parse("good", JwtService.TYPE_ACCESS)).thenReturn(Optional.of(new JwtService.TokenClaims(5L, 2)));
        when(jwt.parse("old", JwtService.TYPE_ACCESS)).thenReturn(Optional.of(new JwtService.TokenClaims(5L, 1)));
        when(jwt.parse("ghost", JwtService.TYPE_ACCESS)).thenReturn(Optional.of(new JwtService.TokenClaims(9L, 0)));
        when(jwt.parse("bad", JwtService.TYPE_ACCESS)).thenReturn(Optional.empty());
        when(repo.findById(5L)).thenReturn(Optional.of(user(true, false, null)));
        when(repo.findById(9L)).thenReturn(Optional.empty());

        assertThat(authenticate(filter, "Bearer good")).isTrue();
        assertThat(authenticate(filter, "Bearer old")).as("revoked by a newer token version").isFalse();
        assertThat(authenticate(filter, "Bearer ghost")).isFalse();
        assertThat(authenticate(filter, "Bearer bad")).isFalse();
        assertThat(authenticate(filter, "Basic abc")).isFalse();
        assertThat(authenticate(filter, null)).isFalse();

        when(repo.findById(5L)).thenReturn(Optional.of(user(false, false, null)));
        assertThat(authenticate(filter, "Bearer good")).as("deactivated users are not authenticated").isFalse();
        verify(jwt, never()).parse("abc", JwtService.TYPE_ACCESS);
    }

    private static boolean authenticate(JwtAuthFilter filter, String header) throws Exception {
        SecurityContextHolder.clearContext();
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/api/auth/me");
        if (header != null) {
            req.addHeader("Authorization", header);
        }
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(req, new MockHttpServletResponse(), chain);
        assertThat(chain.getRequest()).as("the chain always continues").isNotNull();
        boolean authenticated = SecurityUtils.current().isPresent();
        SecurityContextHolder.clearContext();
        return authenticated;
    }
}
