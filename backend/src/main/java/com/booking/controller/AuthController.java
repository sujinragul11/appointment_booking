package com.booking.controller;

import com.booking.dto.request.*;
import com.booking.dto.response.AuthResponse;
import com.booking.dto.response.MessageResponse;
import com.booking.dto.response.UserResponse;
import com.booking.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Tag(name = "Authentication")
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register a customer or provider (FR-1); an e-mail verification code is sent")
    public AuthResponse register(@Valid @RequestBody RegisterRequest request) {
        return authService.register(request);
    }

    @PostMapping("/login")
    @Operation(summary = "Login with e-mail/password; returns access + refresh JWT (FR-3)")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/refresh")
    @Operation(summary = "Exchange a refresh token for new tokens")
    public AuthResponse refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return authService.refresh(request);
    }

    @PostMapping("/logout")
    @Operation(summary = "Revoke all tokens of the current user (FR-7)")
    public MessageResponse logout() {
        return authService.logout();
    }

    @PostMapping("/google")
    @Operation(summary = "Sign in with a Google ID token (FR-6)")
    public AuthResponse google(@Valid @RequestBody GoogleLoginRequest request) {
        return authService.googleLogin(request);
    }

    @PostMapping("/send-verification")
    @Operation(summary = "Send an e-mail or SMS verification code (FR-2)")
    public MessageResponse sendVerification(@Valid @RequestBody SendCodeRequest request) {
        return authService.sendVerification(request);
    }

    @PostMapping("/verify")
    @Operation(summary = "Verify e-mail or phone with the code (FR-2)")
    public UserResponse verify(@Valid @RequestBody VerifyCodeRequest request) {
        return authService.verify(request);
    }

    @PostMapping("/verify-otp")
    @Operation(summary = "Public e-mail verification with e-mail + code")
    public MessageResponse verifyOtp(@Valid @RequestBody OtpVerifyRequest request) {
        return authService.verifyEmailPublic(request);
    }

    @PostMapping("/forgot-password")
    @Operation(summary = "E-mail a password reset link (FR-4)")
    public MessageResponse forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        return authService.forgotPassword(request);
    }

    @PostMapping("/reset-password")
    @Operation(summary = "Set a new password using the token from the reset link")
    public MessageResponse resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        return authService.resetPassword(request);
    }

    @GetMapping("/me")
    public UserResponse me() {
        return authService.me();
    }

    @PutMapping("/profile")
    public UserResponse updateProfile(@Valid @RequestBody UpdateProfileRequest request) {
        return authService.updateProfile(request);
    }

    @PutMapping("/password")
    @Operation(summary = "Change password; other sessions are signed out and new tokens returned")
    public AuthResponse changePassword(@Valid @RequestBody ChangePasswordRequest request) {
        return authService.changePassword(request);
    }
}
