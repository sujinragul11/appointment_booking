package com.booking.service;

import com.booking.dto.request.*;
import com.booking.dto.response.AuthResponse;
import com.booking.dto.response.MessageResponse;
import com.booking.dto.response.UserResponse;
import com.booking.entity.PasswordResetToken;
import com.booking.entity.Provider;
import com.booking.entity.User;
import com.booking.enums.NotifType;
import com.booking.enums.ProviderStatus;
import com.booking.enums.UserRole;
import com.booking.enums.VerificationPurpose;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
import com.booking.messaging.EmailSender;
import com.booking.repository.CategoryRepository;
import com.booking.repository.PasswordResetTokenRepository;
import com.booking.repository.ProviderRepository;
import com.booking.repository.UserRepository;
import com.booking.security.GoogleTokenVerifier;
import com.booking.security.JwtService;
import com.booking.security.SecurityUtils;
import com.booking.util.BookingUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

/** Registration, login, token refresh/revocation, verification and password flows (FR-1..8). */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final ProviderRepository providerRepository;
    private final CategoryRepository categoryRepository;
    private final PasswordResetTokenRepository resetTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final VerificationService verificationService;
    private final NotificationService notificationService;
    private final GoogleTokenVerifier googleTokenVerifier;
    private final EmailSender emailSender;
    private final AuditService auditService;
    private final DtoMapper mapper;

    @Value("${app.security.max-failed-logins:5}")
    private int maxFailedLogins;

    @Value("${app.security.lockout-minutes:15}")
    private int lockoutMinutes;

    @Value("${app.security.reset-token-ttl-minutes:30}")
    private int resetTtlMinutes;

    @Value("${app.app-url:http://localhost:5173}")
    private String appUrl;

    /** Pre-computed hash so unknown e-mails take as long as wrong passwords (no user enumeration by timing). */
    private String dummyHash;

    private String dummyHash() {
        if (dummyHash == null) {
            dummyHash = passwordEncoder.encode(UUID.randomUUID().toString());
        }
        return dummyHash;
    }

    @Transactional
<<<<<<< HEAD
    public AuthResponse register(RegisterRequest req) {
        String email = req.email().trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw ApiException.conflict("An account with this e-mail already exists");
=======
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email().toLowerCase())) {
            throw ApiException.conflict("Email already registered");
>>>>>>> a52368e (backendcommit)
        }
        UserRole role = req.role() == null ? UserRole.CUSTOMER : req.role();
        if (role != UserRole.CUSTOMER && role != UserRole.PROVIDER) {
            throw ApiException.badRequest("Only CUSTOMER and PROVIDER accounts can be self-registered");
        }
        User user = userRepository.save(User.builder()
                .name(req.name().trim())
                .email(email)
                .phone(blankToNull(req.phone()))
                .password(passwordEncoder.encode(req.password()))
                .role(role)
                .build());
        if (role == UserRole.PROVIDER) {
            Provider provider = providerRepository.save(Provider.builder()
                    .user(user)
                    .businessName(req.businessName() == null || req.businessName().isBlank()
                            ? req.name().trim() : req.businessName().trim())
                    .category(req.categoryId() == null ? null : categoryRepository.findById(req.categoryId()).orElse(null))
                    .status(ProviderStatus.PENDING)
                    .build());
            notificationService.inApp(user, "Welcome to Sloto",
                    "Your business profile was created and is awaiting admin approval. Meanwhile, add your services and working hours.",
                    NotifType.ADMIN, "/dashboard/provider/settings");
            userRepository.findByRoleAndActiveTrueAndDeletedFalse(UserRole.ADMIN).forEach(admin ->
                    notificationService.inApp(admin, "Provider awaiting approval",
                            provider.getBusinessName() + " registered and needs review.", NotifType.ADMIN, "/dashboard/admin/providers"));
        } else {
            notificationService.inApp(user, "Welcome to Sloto",
                    "Your account is ready. Verify your e-mail, then find a provider and book in a few clicks.",
                    NotifType.INFO, "/providers");
        }
        verificationService.send(user, VerificationPurpose.EMAIL_VERIFY);
        auditService.record(user.getId(), user.getEmail(), role.name(), "USER_REGISTERED", "User", user.getId(), null);
        return tokens(user);
    }

<<<<<<< HEAD
    @Transactional(noRollbackFor = ApiException.class)
    public AuthResponse login(LoginRequest req) {
        User user = userRepository.findByEmailIgnoreCase(req.email().trim()).orElse(null);
        if (user == null || user.isDeleted()) {
            passwordEncoder.matches(req.password(), dummyHash());
            throw ApiException.unauthorized("Invalid email or password");
=======
    @Transactional
    public AuthResponse login(LoginRequest request) {
        // Emails are stored lowercase and PostgreSQL compares case-sensitively.
        String email = request.email().toLowerCase();
        authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(email, request.password()));
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> ApiException.unauthorized("Invalid email or password"));
        Long providerId = providerRepository.findByUserId(user.getId()).map(Provider::getId).orElse(null);
        return buildAuthResponse(user, providerId);
    }

    @Transactional
    public AuthResponse refresh(RefreshTokenRequest request) {
        String email = jwtService.extractUsername(request.refreshToken());
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> ApiException.unauthorized("Invalid refresh token"));
        return buildAuthResponse(user, providerRepository.findByUserId(user.getId()).map(Provider::getId).orElse(null));
    }

    @Transactional
    public MessageResponse sendOtpChallenges(SendOtpRequest request) {
        User user = userRepository.findAll().stream()
                .filter(u -> request.phone().replaceAll("[^0-9]", "").equals(u.getPhone() == null ? "" : u.getPhone().replaceAll("[^0-9]", "")))
                .findFirst().orElseThrow(() -> ApiException.notFound("No account found for this phone"));
        user.setOtp(BookingUtils.generateOtp());
        user.setOtpExpiry(LocalDateTime.now().plusMinutes(10));
        userRepository.save(user);
        log.info("[OTP-DEMO] phone={} otp={} (SMS mock)", request.phone(), user.getOtp());
        return new MessageResponse("OTP sent to " + request.phone() + " (demo OTP: " + user.getOtp() + ")");
    }

    @Transactional
    public MessageResponse verifyOtp(OtpVerifyRequest request) {
        User user = userRepository.findByEmail(request.email().toLowerCase())
                .orElseThrow(() -> ApiException.notFound("User not found"));
        validateOtp(user, request.otp());
        user.setOtp(null);
        user.setOtpExpiry(null);
        user.setEmailVerified(true);
        userRepository.save(user);
        return new MessageResponse("Email verified successfully");
    }

    @Transactional
    public MessageResponse forgotPassword(ForgotPasswordRequest request) {
        User user = userRepository.findByEmail(request.email().toLowerCase())
                .orElseThrow(() -> ApiException.notFound("No account found for this email"));
        user.setOtp(BookingUtils.generateOtp());
        user.setOtpExpiry(LocalDateTime.now().plusMinutes(10));
        userRepository.save(user);
        log.info("[OTP-DEMO] email={} otp={}", user.getEmail(), user.getOtp());
        return new MessageResponse("Password reset OTP sent to your email (demo OTP: " + user.getOtp() + ")");
    }

    @Transactional
    public MessageResponse resetPassword(ResetPasswordRequest request) {
        User user = userRepository.findByEmail(request.email().toLowerCase())
                .orElseThrow(() -> ApiException.notFound("User not found"));
        validateOtp(user, request.otp());
        user.setOtp(null);
        user.setOtpExpiry(null);
        user.setPassword(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
        return new MessageResponse("Password reset successfully");
    }

    private void validateOtp(User user, String otp) {
        if (user.getOtp() == null || user.getOtpExpiry() == null) {
            throw ApiException.badRequest("No OTP pending. Request a new one.");
>>>>>>> a52368e (backendcommit)
        }
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(LocalDateTime.now())) {
            throw new ApiException(HttpStatus.LOCKED, "Too many failed attempts. Try again after "
                    + user.getLockedUntil().toLocalTime().withNano(0) + " (server time) or reset your password.");
        }
        if (!passwordEncoder.matches(req.password(), user.getPassword())) {
            int attempts = user.getFailedLoginAttempts() + 1;
            user.setFailedLoginAttempts(attempts);
            if (attempts >= maxFailedLogins) {
                user.setLockedUntil(LocalDateTime.now().plusMinutes(lockoutMinutes));
                user.setFailedLoginAttempts(0);
                auditService.record(user.getId(), user.getEmail(), user.getRole().name(), "ACCOUNT_LOCKED", "User", user.getId(),
                        "Locked for " + lockoutMinutes + " minutes after " + attempts + " failed logins");
            }
            throw ApiException.unauthorized("Invalid email or password");
        }
        if (!user.isActive()) {
            throw ApiException.forbidden("This account has been deactivated. Contact support.");
        }
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        user.setLastLoginAt(LocalDateTime.now());
        auditService.record(user.getId(), user.getEmail(), user.getRole().name(), "LOGIN", "User", user.getId(), null);
        return tokens(user);
    }

    @Transactional
    public AuthResponse refresh(RefreshTokenRequest req) {
        var claims = jwtService.parse(req.refreshToken(), JwtService.TYPE_REFRESH)
                .orElseThrow(() -> ApiException.unauthorized("Session expired. Please sign in again."));
        User user = userRepository.findById(claims.userId())
                .filter(User::canLogin)
                .filter(u -> u.getTokenVersion() == claims.version())
                .orElseThrow(() -> ApiException.unauthorized("Session expired. Please sign in again."));
        return tokens(user);
    }

    /** Revokes every access/refresh token of the user (all devices). */
    @Transactional
    public MessageResponse logout() {
        User user = currentUser();
        user.setTokenVersion(user.getTokenVersion() + 1);
        auditService.record("LOGOUT", "User", user.getId(), null);
        return new MessageResponse("Signed out");
    }

    @Transactional
    public AuthResponse googleLogin(GoogleLoginRequest req) {
        GoogleTokenVerifier.GoogleUser g = googleTokenVerifier.verify(req.idToken());
        User user = userRepository.findByGoogleId(g.googleId())
                .or(() -> userRepository.findByEmailIgnoreCase(g.email()))
                .orElse(null);
        if (user == null) {
            user = userRepository.save(User.builder()
                    .name(g.name())
                    .email(g.email())
                    .googleId(g.googleId())
                    .photoUrl(g.picture())
                    .password(passwordEncoder.encode(UUID.randomUUID().toString()))
                    .role(UserRole.CUSTOMER)
                    .verified(true)
                    .build());
            auditService.record(user.getId(), user.getEmail(), user.getRole().name(), "USER_REGISTERED", "User", user.getId(), "via Google");
        } else {
            if (!user.canLogin()) {
                throw ApiException.forbidden("This account has been deactivated. Contact support.");
            }
            if (user.getGoogleId() == null) {
                user.setGoogleId(g.googleId());
            }
            // Google has verified the address
            user.setVerified(true);
            if (user.getPhotoUrl() == null) {
                user.setPhotoUrl(g.picture());
            }
        }
        user.setLastLoginAt(LocalDateTime.now());
        auditService.record(user.getId(), user.getEmail(), user.getRole().name(), "LOGIN", "User", user.getId(), "via Google");
        return tokens(user);
    }

    // ------------------------------------------------------------------ verification (FR-2)

    @Transactional
    public MessageResponse sendVerification(SendCodeRequest req) {
        User user = currentUser();
        if (req.channel() == SendCodeRequest.VerificationChannel.EMAIL) {
            if (user.isVerified()) return new MessageResponse("E-mail already verified");
            verificationService.send(user, VerificationPurpose.EMAIL_VERIFY);
            return new MessageResponse("Verification code sent to " + BookingUtils.maskEmail(user.getEmail()));
        }
        if (user.isPhoneVerified()) return new MessageResponse("Phone already verified");
        verificationService.send(user, VerificationPurpose.PHONE_VERIFY);
        return new MessageResponse("Verification code sent by SMS");
    }

    @Transactional(noRollbackFor = ApiException.class)
    public UserResponse verify(VerifyCodeRequest req) {
        User user = currentUser();
        if (req.channel() == SendCodeRequest.VerificationChannel.EMAIL) {
            verificationService.verify(user, VerificationPurpose.EMAIL_VERIFY, req.code());
            user.setVerified(true);
        } else {
            verificationService.verify(user, VerificationPurpose.PHONE_VERIFY, req.code());
            user.setPhoneVerified(true);
        }
        auditService.record("VERIFIED_" + req.channel(), "User", user.getId(), null);
        return mapper.user(user);
    }

    /** Public variant used from the link in the verification e-mail. */
    @Transactional(noRollbackFor = ApiException.class)
    public MessageResponse verifyEmailPublic(OtpVerifyRequest req) {
        User user = userRepository.findByEmailIgnoreCase(req.email().trim())
                .orElseThrow(() -> ApiException.badRequest("Invalid code"));
        if (user.isVerified()) {
            return new MessageResponse("E-mail already verified");
        }
        verificationService.verify(user, VerificationPurpose.EMAIL_VERIFY, req.otp());
        user.setVerified(true);
        return new MessageResponse("E-mail verified successfully");
    }

    // ------------------------------------------------------------------ password flows (FR-4, FR-8)

    /** Always answers the same way so the endpoint cannot be used to discover accounts. */
    @Transactional
    public MessageResponse forgotPassword(ForgotPasswordRequest req) {
        userRepository.findByEmailIgnoreCase(req.email().trim()).filter(User::canLogin).ifPresent(this::sendResetLink);
        return new MessageResponse("If an account exists for this e-mail, a password reset link has been sent.");
    }

    /** Also used to let invited staff set their first password. */
    @Transactional
    public void sendResetLink(User user) {
        resetTokenRepository.findByUserIdAndUsedAtIsNull(user.getId()).forEach(t -> t.setUsedAt(LocalDateTime.now()));
        String token = BookingUtils.generateToken();
        resetTokenRepository.save(PasswordResetToken.builder()
                .user(user)
                .tokenHash(BookingUtils.sha256(token))
                .expiresAt(LocalDateTime.now().plusMinutes(resetTtlMinutes))
                .build());
        emailSender.send(user.getEmail(), "Reset your password",
                "Use the button below to choose a new password. The link expires in " + resetTtlMinutes
                        + " minutes and can be used once. If you did not request this, ignore this e-mail.",
                "Reset password", appUrl + "/reset-password?token=" + token);
    }

    @Transactional
    public MessageResponse resetPassword(ResetPasswordRequest req) {
        PasswordResetToken t = resetTokenRepository.findByTokenHash(BookingUtils.sha256(req.token()))
                .filter(x -> x.getUsedAt() == null && x.getExpiresAt().isAfter(LocalDateTime.now()))
                .orElseThrow(() -> ApiException.badRequest("This reset link is invalid or has expired. Request a new one."));
        User user = t.getUser();
        t.setUsedAt(LocalDateTime.now());
        user.setPassword(passwordEncoder.encode(req.newPassword()));
        user.setTokenVersion(user.getTokenVersion() + 1);
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);
        // The link was delivered to the inbox, which proves ownership of the address
        user.setVerified(true);
        auditService.record(user.getId(), user.getEmail(), user.getRole().name(), "PASSWORD_RESET", "User", user.getId(), null);
        notificationService.notify(user, "Password changed", "Your password was reset. If this wasn't you, contact support immediately.",
                NotifType.INFO, "/profile", NotificationService.Channel.IN_APP, NotificationService.Channel.EMAIL);
        return new MessageResponse("Password updated. You can now sign in.");
    }

    @Transactional
    public AuthResponse changePassword(ChangePasswordRequest req) {
        User user = currentUser();
        if (!passwordEncoder.matches(req.currentPassword(), user.getPassword())) {
            throw ApiException.badRequest("Current password is incorrect");
        }
        if (passwordEncoder.matches(req.newPassword(), user.getPassword())) {
            throw ApiException.badRequest("New password must be different from the current one");
        }
        user.setPassword(passwordEncoder.encode(req.newPassword()));
        user.setTokenVersion(user.getTokenVersion() + 1);
        auditService.record("PASSWORD_CHANGED", "User", user.getId(), null);
        // Other sessions are revoked; this one continues with fresh tokens.
        return tokens(user);
    }

    // ------------------------------------------------------------------ profile

    @Transactional(readOnly = true)
    public UserResponse me() {
        return mapper.user(currentUser());
    }

    @Transactional
    public UserResponse updateProfile(UpdateProfileRequest req) {
        User user = currentUser();
        if (req.name() != null && !req.name().isBlank()) user.setName(req.name().trim());
        if (req.phone() != null) {
            String phone = blankToNull(req.phone());
            if (phone == null ? user.getPhone() != null : !phone.equals(user.getPhone())) {
                user.setPhone(phone);
                user.setPhoneVerified(false);
            }
        }
        if (req.photoUrl() != null) user.setPhotoUrl(blankToNull(req.photoUrl()));
        if (req.notifEmail() != null) user.setNotifEmail(req.notifEmail());
        if (req.notifSms() != null) user.setNotifSms(req.notifSms());
        if (req.notifPush() != null) user.setNotifPush(req.notifPush());
        if (req.language() != null) user.setLanguage(req.language());
        if (req.timezone() != null) {
            if (!req.timezone().isBlank()) {
                try {
                    ZoneId.of(req.timezone());
                } catch (Exception e) {
                    throw ApiException.badRequest("Unknown timezone: " + req.timezone());
                }
            }
            user.setTimezone(blankToNull(req.timezone()));
        }
        return mapper.user(user);
    }

    // ------------------------------------------------------------------ helpers

    private User currentUser() {
        return userRepository.findById(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.unauthorized("Account no longer exists"));
    }

    private AuthResponse tokens(User user) {
        return new AuthResponse(jwtService.generateAccessToken(user), jwtService.generateRefreshToken(user), "Bearer",
                jwtService.getAccessTtlSeconds(), mapper.user(user));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
