package com.booking.service;

import com.booking.dto.request.*;
import com.booking.dto.response.AuthResponse;
import com.booking.dto.response.MessageResponse;
import com.booking.dto.response.UserResponse;
import com.booking.entity.Provider;
import com.booking.entity.User;
import com.booking.enums.NotifType;
import com.booking.enums.ProviderStatus;
import com.booking.enums.UserRole;
import com.booking.exception.ApiException;
import com.booking.repository.CategoryRepository;
import com.booking.repository.ProviderRepository;
import com.booking.repository.UserRepository;
import com.booking.security.JwtService;
import com.booking.security.SecurityUtils;
import com.booking.security.UserPrincipal;
import com.booking.util.BookingUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final ProviderRepository providerRepository;
    private final CategoryRepository categoryRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;
    private final NotificationService notificationService;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw ApiException.conflict("Email already registered");
        }
        UserRole role = request.role() == null ? UserRole.CUSTOMER : request.role();
        if (role != UserRole.CUSTOMER && role != UserRole.PROVIDER) {
            throw ApiException.badRequest("Only CUSTOMER and PROVIDER roles can self-register");
        }

        User user = User.builder()
                .name(request.name())
                .email(request.email().toLowerCase())
                .phone(request.phone())
                .password(passwordEncoder.encode(request.password()))
                .role(role)
                .verified(true)
                .otp(BookingUtils.generateOtp())
                .otpExpiry(LocalDateTime.now().plusMinutes(10))
                .build();
        user = userRepository.save(user);

        Long providerId = null;
        if (role == UserRole.PROVIDER) {
            Provider provider = Provider.builder()
                    .user(user)
                    .businessName(request.businessName() == null ? request.name() + "'s Business" : request.businessName())
                    .status(ProviderStatus.PENDING)
                    .category(request.categoryId() == null ? null : categoryRepository.findById(request.categoryId()).orElse(null))
                    .build();
            provider = providerRepository.save(provider);
            providerId = provider.getId();
            notificationService.notifyUser(user.getId(), "Welcome Provider",
                    "Your business profile has been created and is pending admin approval.", NotifType.ADMIN);
        } else {
            notificationService.notifyUser(user.getId(), "Welcome to Booking",
                    "Your customer account is ready. Search providers and book instantly.", NotifType.INFO);
        }

        log.info("[OTP-DEMO] email={} otp={}", user.getEmail(), user.getOtp());
        return buildAuthResponse(user, providerId);
    }

    @Transactional
    public AuthResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email(), request.password()));
        User user = userRepository.findByEmail(request.email().toLowerCase())
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
        }
        if (!user.getOtp().equals(otp)) {
            throw ApiException.badRequest("Invalid OTP");
        }
        if (user.getOtpExpiry().isBefore(LocalDateTime.now())) {
            throw ApiException.badRequest("OTP has expired");
        }
    }

    @Transactional
    public AuthResponse googleLogin(GoogleLoginRequest request) {
        User user = userRepository.findByGoogleId(request.googleId())
                .or(() -> userRepository.findByEmail(request.email().toLowerCase()))
                .orElseGet(() -> User.builder()
                        .name(request.name())
                        .email(request.email().toLowerCase())
                        .googleId(request.googleId())
                        .password(passwordEncoder.encode(UUID.randomUUID().toString()))
                        .role(UserRole.CUSTOMER)
                        .verified(true)
                        .emailVerified(true)
                        .photoUrl(request.photoUrl())
                        .build());
        if (user.getGoogleId() == null) {
            user.setGoogleId(request.googleId());
        }
        if (user.getPhotoUrl() == null) {
            user.setPhotoUrl(request.photoUrl());
        }
        user = userRepository.save(user);
        Long providerId = providerRepository.findByUserId(user.getId()).map(Provider::getId).orElse(null);
        return buildAuthResponse(user, providerId);
    }

    public UserResponse me() {
        return UserResponse.of(currentUserEntity());
    }

    @Transactional
    public UserResponse updateProfile(UpdateProfileRequest req) {
        User user = currentUserEntity();
        if (req.name() != null && !req.name().isBlank()) user.setName(req.name());
        if (req.phone() != null) user.setPhone(req.phone());
        if (req.photoUrl() != null) user.setPhotoUrl(req.photoUrl());
        if (req.notifEmail() != null) user.setNotifEmail(req.notifEmail());
        if (req.notifSms() != null) user.setNotifSms(req.notifSms());
        if (req.notifPush() != null) user.setNotifPush(req.notifPush());
        return UserResponse.of(userRepository.save(user),
                providerRepository.findByUserId(user.getId()).map(Provider::getId).orElse(null));
    }

    @Transactional
    public MessageResponse changePassword(ChangePasswordRequest req) {
        User user = currentUserEntity();
        if (!passwordEncoder.matches(req.currentPassword(), user.getPassword())) {
            throw ApiException.badRequest("Current password is incorrect");
        }
        user.setPassword(passwordEncoder.encode(req.newPassword()));
        userRepository.save(user);
        return new MessageResponse("Password changed successfully");
    }

    private User currentUserEntity() {
        return userRepository.findById(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.unauthorized("User no longer exists"));
    }

    private AuthResponse buildAuthResponse(User user, Long providerId) {
        UserPrincipal principal = UserPrincipal.from(user);
        return new AuthResponse(
                jwtService.generateAccessToken(principal),
                jwtService.generateRefreshToken(principal),
                "Bearer",
                UserResponse.of(user, providerId));
    }
}