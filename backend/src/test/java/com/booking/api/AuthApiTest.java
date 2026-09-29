package com.booking.api;

import com.booking.dto.response.AuthResponse;
import com.booking.dto.response.UserResponse;
import com.booking.entity.AuditLog;
import com.booking.entity.Category;
import com.booking.entity.User;
import com.booking.enums.UserRole;
import com.booking.enums.VerificationPurpose;
import com.booking.repository.AuditLogRepository;
import com.booking.repository.NotificationRepository;
import com.booking.repository.UserRepository;
import com.booking.repository.VerificationCodeRepository;
import com.booking.security.GoogleTokenVerifier;
import com.booking.support.IntegrationTestBase;
import com.booking.support.TestDataFactory;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Registration, login and lockout, token refresh / revocation, password flows, OTP verification, Google sign-in. */
class AuthApiTest extends IntegrationTestBase {

    private static final String WEAK_PASSWORD_MESSAGE =
            "Password must be at least 8 characters and include upper case, lower case and a number";
    private static final String GENERIC_FORGOT_MESSAGE =
            "If an account exists for this e-mail, a password reset link has been sent.";

    @Autowired private UserRepository userRepository;
    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private VerificationCodeRepository codeRepository;

    private Map<String, Object> registration(String email, String password) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", "New Person");
        body.put("email", email);
        body.put("password", password);
        body.put("phone", "+919876543210");
        return body;
    }

    private AuthResponse register(Map<String, Object> body) throws Exception {
        return read(post("/api/auth/register", null, body).andExpect(status().isCreated()), AuthResponse.class);
    }

    private org.springframework.test.web.servlet.ResultActions login(String email, String password) throws Exception {
        return post("/api/auth/login", null, Map.of("email", email, "password", password));
    }

    private String otpFor(String email) {
        return sixDigits(lastEmailText(email, "Verify your e-mail"));
    }

    private static String sixDigits(String text) {
        Matcher m = Pattern.compile("(\\d{6})").matcher(text);
        assertThat(m.find()).as("a 6 digit code in: " + text).isTrue();
        return m.group(1);
    }

    private String resetToken(String email) {
        String link = lastEmailLink(email, "Reset your password");
        assertThat(link).startsWith("http://localhost:5173/reset-password?token=");
        return link.substring(link.indexOf("token=") + 6);
    }

    private List<String> auditActions() {
        return auditLogRepository.findAll().stream().map(AuditLog::getAction).toList();
    }

    // ------------------------------------------------------------------ registration

    @Test
    void customerRegistrationReturnsTokensAndSendsAVerificationCode() throws Exception {
        AuthResponse res = register(registration("New.Person@Example.test", "Password1"));

        assertThat(res.accessToken()).isNotBlank();
        assertThat(res.refreshToken()).isNotBlank();
        assertThat(res.tokenType()).isEqualTo("Bearer");
        assertThat(res.expiresIn()).isEqualTo(900);
        assertThat(res.user().email()).isEqualTo("new.person@example.test");
        assertThat(res.user().role()).isEqualTo(UserRole.CUSTOMER);
        assertThat(res.user().verified()).isFalse();
        assertThat(res.user().phone()).isEqualTo("+919876543210");

        assertThat(otpFor("new.person@example.test")).hasSize(6);
        verify(emailSender).send(eq("new.person@example.test"), eq("Verify your e-mail"), any(),
                eq("Verify e-mail"), eq("http://localhost:5173/verify?email=new.person%40example.test"));
        assertThat(notificationRepository.findByUserIdOrderByCreatedAtDesc(res.user().id(), PageRequest.of(0, 10))).hasSize(1);
        assertThat(auditActions()).contains("USER_REGISTERED");

        get("/api/auth/me", res.accessToken())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("new.person@example.test"));
    }

    @Test
    void weakPasswordsAndInvalidFieldsAreRejectedWithFieldErrors() throws Exception {
        post("/api/auth/register", null, registration("weak@example.test", "password"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(WEAK_PASSWORD_MESSAGE))
                .andExpect(jsonPath("$.errors.password").value(WEAK_PASSWORD_MESSAGE));

        Map<String, Object> bad = registration("not-an-email", "Password1");
        bad.put("phone", "12ab");
        bad.put("name", "X");
        post("/api/auth/register", null, bad)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.email").exists())
                .andExpect(jsonPath("$.errors.phone").value("Phone must be 10-15 digits, optionally starting with +"))
                .andExpect(jsonPath("$.errors.name").exists());
        assertThat(userRepository.count()).isZero();
    }

    @Test
    void duplicateEmailIsAConflictRegardlessOfCase() throws Exception {
        register(registration("dup@example.test", "Password1"));

        post("/api/auth/register", null, registration("DUP@example.test", "Password1"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("An account with this e-mail already exists"));
    }

    @Test
    void onlyCustomersAndProvidersCanSelfRegister() throws Exception {
        for (String role : List.of("ADMIN", "STAFF", "GUEST")) {
            Map<String, Object> body = registration(TestDataFactory.uniqueEmail("role"), "Password1");
            body.put("role", role);
            post("/api/auth/register", null, body)
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("Only CUSTOMER and PROVIDER accounts can be self-registered"));
        }
    }

    @Test
    void providerRegistrationCreatesAPendingProviderAndNotifiesAdmins() throws Exception {
        User admin = data.admin();
        Category salon = data.category("Salon");
        Map<String, Object> body = registration("owner@example.test", "Password1");
        body.put("role", "PROVIDER");
        body.put("businessName", "Glow Salon");
        body.put("categoryId", salon.getId());

        AuthResponse res = register(body);

        assertThat(res.user().role()).isEqualTo(UserRole.PROVIDER);
        assertThat(res.user().providerId()).isNotNull();
        get("/api/provider/me", res.accessToken())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.businessName").value("Glow Salon"))
                .andExpect(jsonPath("$.category.name").value("Salon"));
        get("/api/providers/{id}", null, res.user().providerId()).andExpect(status().isNotFound());
        assertThat(notificationRepository.findByUserIdOrderByCreatedAtDesc(admin.getId(), PageRequest.of(0, 10)))
                .extracting(n -> n.getTitle()).containsExactly("Provider awaiting approval");

        // without a business name the person's name is used
        Map<String, Object> plain = registration("solo@example.test", "Password1");
        plain.put("role", "PROVIDER");
        AuthResponse solo = register(plain);
        get("/api/provider/me", solo.accessToken()).andExpect(jsonPath("$.businessName").value("New Person"));
        assertThat(data.inTransaction(() -> userRepository.findById(solo.user().id()).orElseThrow().getRole()))
                .isEqualTo(UserRole.PROVIDER);
    }

    // ------------------------------------------------------------------ login & lockout

    @Test
    void loginWithWrongCredentialsIsUnauthorized() throws Exception {
        User user = data.customer();

        login(user.getEmail(), "WrongPass1")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
        login("nobody@example.test", "Password1")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
        login(user.getEmail().toUpperCase(), TestDataFactory.PASSWORD)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.lastLoginAt").exists());
        post("/api/auth/login", null, Map.of("email", "bad", "password", ""))
                .andExpect(status().isBadRequest());
    }

    @Test
    void fiveFailedLoginsLockTheAccount() throws Exception {
        User user = data.customer();
        for (int i = 0; i < 5; i++) {
            login(user.getEmail(), "WrongPass" + i).andExpect(status().isUnauthorized());
        }

        login(user.getEmail(), TestDataFactory.PASSWORD)
                .andExpect(status().isLocked())
                .andExpect(jsonPath("$.status").value(423))
                .andExpect(jsonPath("$.message").value(startsWith("Too many failed attempts")));
        assertThat(auditActions()).contains("ACCOUNT_LOCKED");

        // a password reset unlocks the account
        post("/api/auth/forgot-password", null, Map.of("email", user.getEmail())).andExpect(status().isOk());
        post("/api/auth/reset-password", null, Map.of("token", resetToken(user.getEmail()), "newPassword", "Unlocked9"))
                .andExpect(status().isOk());
        login(user.getEmail(), "Unlocked9").andExpect(status().isOk());
    }

    @Test
    void successfulLoginResetsTheFailureCounter() throws Exception {
        User user = data.customer();
        for (int i = 0; i < 4; i++) {
            login(user.getEmail(), "WrongPass" + i).andExpect(status().isUnauthorized());
        }
        login(user.getEmail(), TestDataFactory.PASSWORD).andExpect(status().isOk());
        for (int i = 0; i < 4; i++) {
            login(user.getEmail(), "WrongPass" + i).andExpect(status().isUnauthorized());
        }
        login(user.getEmail(), TestDataFactory.PASSWORD).andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ tokens

    @Test
    void refreshTokenIssuesNewTokensAndTokenTypesCannotBeSwapped() throws Exception {
        User user = data.customer();
        AuthResponse session = auth.loginResponse(user.getEmail(), TestDataFactory.PASSWORD);

        AuthResponse refreshed = read(post("/api/auth/refresh", null, Map.of("refreshToken", session.refreshToken()))
                .andExpect(status().isOk()), AuthResponse.class);
        assertThat(refreshed.accessToken()).isNotBlank().isNotEqualTo(session.accessToken());
        get("/api/auth/me", refreshed.accessToken()).andExpect(status().isOk());

        post("/api/auth/refresh", null, Map.of("refreshToken", session.accessToken()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Session expired. Please sign in again."));
        post("/api/auth/refresh", null, Map.of("refreshToken", "garbage.token.value"))
                .andExpect(status().isUnauthorized());
        get("/api/auth/me", session.refreshToken())
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Authentication required"));
        get("/api/auth/me", "not-a-jwt").andExpect(status().isUnauthorized());
        get("/api/auth/me", null).andExpect(status().isUnauthorized());
    }

    @Test
    void logoutRevokesAllTokens() throws Exception {
        User user = data.customer();
        AuthResponse session = auth.loginResponse(user.getEmail(), TestDataFactory.PASSWORD);

        post("/api/auth/logout", session.accessToken(), null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Signed out"));

        get("/api/auth/me", session.accessToken()).andExpect(status().isUnauthorized());
        post("/api/auth/refresh", null, Map.of("refreshToken", session.refreshToken())).andExpect(status().isUnauthorized());
        post("/api/auth/logout", null, null).andExpect(status().isUnauthorized());
        assertThat(auditActions()).contains("LOGOUT");
        // a fresh login works again
        get("/api/auth/me", auth.token(user)).andExpect(status().isOk());
    }

    @Test
    void changingThePasswordRevokesOldTokensAndReturnsNewOnes() throws Exception {
        User user = data.customer();
        String oldToken = auth.token(user);

        put("/api/auth/password", oldToken, Map.of("currentPassword", "Nope12345", "newPassword", "Changed99"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Current password is incorrect"));
        put("/api/auth/password", oldToken, Map.of("currentPassword", TestDataFactory.PASSWORD, "newPassword", TestDataFactory.PASSWORD))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("New password must be different from the current one"));
        put("/api/auth/password", oldToken, Map.of("currentPassword", TestDataFactory.PASSWORD, "newPassword", "short"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.newPassword").value(WEAK_PASSWORD_MESSAGE));

        AuthResponse fresh = read(put("/api/auth/password", oldToken,
                Map.of("currentPassword", TestDataFactory.PASSWORD, "newPassword", "Changed99")).andExpect(status().isOk()),
                AuthResponse.class);

        get("/api/auth/me", oldToken).andExpect(status().isUnauthorized());
        get("/api/auth/me", fresh.accessToken()).andExpect(status().isOk());
        login(user.getEmail(), TestDataFactory.PASSWORD).andExpect(status().isUnauthorized());
        login(user.getEmail(), "Changed99").andExpect(status().isOk());
        assertThat(auditActions()).contains("PASSWORD_CHANGED");
    }

    // ------------------------------------------------------------------ forgot / reset password

    @Test
    void forgotPasswordAnswersGenericallyForUnknownEmails() throws Exception {
        post("/api/auth/forgot-password", null, Map.of("email", "ghost@example.test"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value(GENERIC_FORGOT_MESSAGE));

        verify(emailSender, never()).send(any(), eq("Reset your password"), any(), any(), any());
        post("/api/auth/forgot-password", null, Map.of("email", "not an email")).andExpect(status().isBadRequest());
    }

    @Test
    void resetPasswordWithTheEmailedTokenWorksOnce() throws Exception {
        User user = data.unverifiedCustomer();
        String oldToken = auth.token(user);

        post("/api/auth/forgot-password", null, Map.of("email", user.getEmail()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value(GENERIC_FORGOT_MESSAGE));
        String token = resetToken(user.getEmail());

        post("/api/auth/reset-password", null, Map.of("token", token, "newPassword", "weak"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.newPassword").value(WEAK_PASSWORD_MESSAGE));
        post("/api/auth/reset-password", null, Map.of("token", "made-up-token", "newPassword", "BrandNew9"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("This reset link is invalid or has expired. Request a new one."));

        post("/api/auth/reset-password", null, Map.of("token", token, "newPassword", "BrandNew9"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Password updated. You can now sign in."));

        AuthResponse session = auth.loginResponse(user.getEmail(), "BrandNew9");
        assertThat(session.user().verified()).as("the reset link proves ownership of the inbox").isTrue();
        get("/api/auth/me", oldToken).andExpect(status().isUnauthorized());
        verify(emailSender).send(eq(user.getEmail()), eq("Password changed"), any(), any(), any());
        post("/api/auth/reset-password", null, Map.of("token", token, "newPassword", "Another9x"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void requestingANewResetLinkInvalidatesThePreviousOne() throws Exception {
        User user = data.customer();
        post("/api/auth/forgot-password", null, Map.of("email", user.getEmail())).andExpect(status().isOk());
        String first = resetToken(user.getEmail());
        post("/api/auth/forgot-password", null, Map.of("email", user.getEmail())).andExpect(status().isOk());
        String second = resetToken(user.getEmail());
        assertThat(second).isNotEqualTo(first);

        post("/api/auth/reset-password", null, Map.of("token", first, "newPassword", "BrandNew9"))
                .andExpect(status().isBadRequest());
        post("/api/auth/reset-password", null, Map.of("token", second, "newPassword", "BrandNew9"))
                .andExpect(status().isOk());
    }

    @Test
    void deactivatedUsersGetNoResetLink() throws Exception {
        User user = data.customer();
        data.updateUser(user.getId(), u -> u.setActive(false));

        post("/api/auth/forgot-password", null, Map.of("email", user.getEmail())).andExpect(status().isOk());

        verify(emailSender, never()).send(eq(user.getEmail()), eq("Reset your password"), any(), any(), any());
    }

    // ------------------------------------------------------------------ e-mail / phone verification

    @Test
    void emailVerificationWithTheEmailedCode() throws Exception {
        AuthResponse res = register(registration("verify.me@example.test", "Password1"));
        String code = otpFor("verify.me@example.test");

        post("/api/auth/verify", res.accessToken(), Map.of("channel", "EMAIL", "code", "12ab"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.code").value("Code must be 6 digits"));
        UserResponse verified = read(post("/api/auth/verify", res.accessToken(), Map.of("channel", "EMAIL", "code", code))
                .andExpect(status().isOk()), UserResponse.class);

        assertThat(verified.verified()).isTrue();
        assertThat(verified.emailVerified()).isTrue();
        assertThat(auditActions()).contains("VERIFIED_EMAIL");
        post("/api/auth/send-verification", res.accessToken(), Map.of("channel", "EMAIL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("E-mail already verified"));
        post("/api/auth/verify", res.accessToken(), Map.of("channel", "EMAIL", "code", code))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("No pending code. Request a new one."));
    }

    @Test
    void wrongCodesAreLimitedToFiveAttempts() throws Exception {
        AuthResponse res = register(registration("attempts@example.test", "Password1"));
        String code = otpFor("attempts@example.test");
        String wrong = code.equals("000000") ? "111111" : "000000";

        for (int i = 0; i < 5; i++) {
            post("/api/auth/verify", res.accessToken(), Map.of("channel", "EMAIL", "code", wrong))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("Invalid code"));
        }
        post("/api/auth/verify", res.accessToken(), Map.of("channel", "EMAIL", "code", code))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Too many attempts. Request a new code."));
        post("/api/auth/verify", res.accessToken(), Map.of("channel", "EMAIL", "code", code))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("No pending code. Request a new one."));
        get("/api/auth/me", res.accessToken()).andExpect(jsonPath("$.verified").value(false));
    }

    @Test
    void newCodesAreThrottledAndExpiredCodesRejected() throws Exception {
        AuthResponse res = register(registration("throttle@example.test", "Password1"));

        post("/api/auth/send-verification", res.accessToken(), Map.of("channel", "EMAIL"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.message").value("Please wait a minute before requesting another code"));

        String code = otpFor("throttle@example.test");
        data.inTransaction(() -> codeRepository
                .findFirstByUserIdAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(res.user().id(), VerificationPurpose.EMAIL_VERIFY)
                .orElseThrow().setExpiresAt(LocalDateTime.now().minusMinutes(1)));

        post("/api/auth/verify", res.accessToken(), Map.of("channel", "EMAIL", "code", code))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Code has expired. Request a new one."));

        // the expired code was consumed, so a new one can be requested right away
        post("/api/auth/send-verification", res.accessToken(), Map.of("channel", "EMAIL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Verification code sent to t***@example.test"));
        String fresh = otpFor("throttle@example.test");
        post("/api/auth/verify", res.accessToken(), Map.of("channel", "EMAIL", "code", fresh)).andExpect(status().isOk());
    }

    @Test
    void publicOtpEndpointVerifiesByEmailAndCode() throws Exception {
        register(registration("public.otp@example.test", "Password1"));
        String code = otpFor("public.otp@example.test");

        post("/api/auth/verify-otp", null, Map.of("email", "nobody@example.test", "otp", code))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Invalid code"));
        post("/api/auth/verify-otp", null, Map.of("email", "public.otp@example.test", "otp", code))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("E-mail verified successfully"));
        post("/api/auth/verify-otp", null, Map.of("email", "public.otp@example.test", "otp", code))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("E-mail already verified"));
    }

    @Test
    void phoneVerificationUsesAnSmsCode() throws Exception {
        User noPhone = data.user("No Phone", TestDataFactory.uniqueEmail("nophone"), UserRole.CUSTOMER, true, null);
        post("/api/auth/send-verification", auth.token(noPhone), Map.of("channel", "PHONE"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Add a phone number to your profile first"));

        User user = data.customer();
        String token = auth.token(user);
        post("/api/auth/send-verification", token, Map.of("channel", "PHONE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Verification code sent by SMS"));
        ArgumentCaptor<String> sms = ArgumentCaptor.forClass(String.class);
        verify(smsSender, atLeastOnce()).send(eq(user.getPhone()), sms.capture());
        String code = sixDigits(sms.getValue());

        post("/api/auth/verify", token, Map.of("channel", "PHONE", "code", code))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phoneVerified").value(true));
        post("/api/auth/send-verification", token, Map.of("channel", "PHONE"))
                .andExpect(jsonPath("$.message").value("Phone already verified"));
    }

    // ------------------------------------------------------------------ account state

    @Test
    void deactivatedUserCannotLoginAndExistingTokensStopWorking() throws Exception {
        User user = data.customer();
        String token = auth.token(user);
        String adminToken = auth.token(data.admin());

        patch("/api/admin/users/" + user.getId() + "/active", adminToken, Map.of("active", false))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false));

        get("/api/auth/me", token).andExpect(status().isUnauthorized());
        login(user.getEmail(), TestDataFactory.PASSWORD)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("This account has been deactivated. Contact support."));

        patch("/api/admin/users/" + user.getId() + "/active", adminToken, Map.of("active", true)).andExpect(status().isOk());
        login(user.getEmail(), TestDataFactory.PASSWORD).andExpect(status().isOk());
    }

    @Test
    void profileCanBeReadAndUpdated() throws Exception {
        User user = data.customer();
        data.updateUser(user.getId(), u -> u.setPhoneVerified(true));
        String token = auth.token(user);

        put("/api/auth/profile", token, Map.of("timezone", "Mars/Olympus"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Unknown timezone: Mars/Olympus"));
        put("/api/auth/profile", token, Map.of("language", "fr"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors.language").value("Unsupported language"));

        UserResponse updated = read(put("/api/auth/profile", token, Map.of("name", "  Renamed Person ", "phone", "+919999999999",
                "timezone", "Europe/London", "language", "hi", "notifSms", false, "notifEmail", false, "notifPush", false,
                "photoUrl", "https://img.example/p.png")).andExpect(status().isOk()), UserResponse.class);
        assertThat(updated.name()).isEqualTo("Renamed Person");
        assertThat(updated.phone()).isEqualTo("+919999999999");
        assertThat(updated.phoneVerified()).as("a new number must be verified again").isFalse();
        assertThat(updated.timezone()).isEqualTo("Europe/London");
        assertThat(updated.language()).isEqualTo("hi");
        assertThat(updated.notifSms()).isFalse();
        assertThat(updated.notifEmail()).isFalse();
        assertThat(updated.notifPush()).isFalse();
        assertThat(updated.photoUrl()).isEqualTo("https://img.example/p.png");

        UserResponse cleared = read(put("/api/auth/profile", token, Map.of("timezone", "", "photoUrl", ""))
                .andExpect(status().isOk()), UserResponse.class);
        assertThat(cleared.timezone()).isNull();
        assertThat(cleared.photoUrl()).isNull();
        get("/api/auth/me", token).andExpect(jsonPath("$.name").value("Renamed Person"));
    }

    // ------------------------------------------------------------------ Google sign-in

    @Test
    void googleLoginIsUnavailableWhenNotConfigured() throws Exception {
        post("/api/auth/google", null, Map.of("idToken", "anything"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("Google sign-in is not configured on this server"));
        post("/api/auth/google", null, Map.of("idToken", "")).andExpect(status().isBadRequest());
    }

    @Test
    void googleLoginCreatesOrLinksAccounts() throws Exception {
        doReturn(new GoogleTokenVerifier.GoogleUser("g-1", "g.user@example.test", "G User", "https://pic.example/g.png"))
                .when(googleTokenVerifier).verify("new-user-token");
        AuthResponse created = read(post("/api/auth/google", null, Map.of("idToken", "new-user-token"))
                .andExpect(status().isOk()), AuthResponse.class);
        assertThat(created.user().email()).isEqualTo("g.user@example.test");
        assertThat(created.user().verified()).isTrue();
        assertThat(created.user().role()).isEqualTo(UserRole.CUSTOMER);
        assertThat(created.user().photoUrl()).isEqualTo("https://pic.example/g.png");
        assertThat(auditLogRepository.findAll()).anyMatch(l -> l.getAction().equals("USER_REGISTERED")
                && "via Google".equals(l.getDetails()));

        // same Google account again -> same user
        AuthResponse again = read(post("/api/auth/google", null, Map.of("idToken", "new-user-token"))
                .andExpect(status().isOk()), AuthResponse.class);
        assertThat(again.user().id()).isEqualTo(created.user().id());

        // an existing password account with that e-mail is linked and marked verified
        User existing = data.unverifiedCustomer();
        doReturn(new GoogleTokenVerifier.GoogleUser("g-2", existing.getEmail(), "Existing", null))
                .when(googleTokenVerifier).verify("existing-token");
        AuthResponse linked = read(post("/api/auth/google", null, Map.of("idToken", "existing-token"))
                .andExpect(status().isOk()), AuthResponse.class);
        assertThat(linked.user().id()).isEqualTo(existing.getId());
        assertThat(linked.user().verified()).isTrue();
        assertThat(data.inTransaction(() -> userRepository.findById(existing.getId()).orElseThrow().getGoogleId()))
                .isEqualTo("g-2");

        // deactivated accounts are refused
        data.updateUser(existing.getId(), u -> u.setActive(false));
        post("/api/auth/google", null, Map.of("idToken", "existing-token"))
                .andExpect(status().isForbidden());
    }
}
