package com.booking.service;

import com.booking.entity.User;
import com.booking.entity.VerificationCode;
import com.booking.enums.VerificationPurpose;
import com.booking.exception.ApiException;
import com.booking.messaging.EmailSender;
import com.booking.messaging.SmsSender;
import com.booking.repository.VerificationCodeRepository;
import com.booking.util.BookingUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * One-time codes for e-mail and phone verification (FR-2). Codes are delivered only by
 * e-mail / SMS, stored hashed, expire, are single-use and allow a limited number of attempts.
 */
@Service
@RequiredArgsConstructor
public class VerificationService {

    private final VerificationCodeRepository codeRepository;
    private final EmailSender emailSender;
    private final SmsSender smsSender;

    @Value("${app.security.otp-ttl-minutes:10}")
    private int ttlMinutes;

    @Value("${app.security.otp-max-attempts:5}")
    private int maxAttempts;

    @Value("${app.app-url:http://localhost:5173}")
    private String appUrl;

    @Transactional
    public void send(User user, VerificationPurpose purpose) {
        if (purpose == VerificationPurpose.PHONE_VERIFY && (user.getPhone() == null || user.getPhone().isBlank())) {
            throw ApiException.badRequest("Add a phone number to your profile first");
        }
        // Throttle: at most one new code per minute
        codeRepository.findFirstByUserIdAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(user.getId(), purpose)
                .filter(c -> c.getCreatedAt() != null && c.getCreatedAt().isAfter(LocalDateTime.now().minusSeconds(60)))
                .ifPresent(c -> {
                    throw new ApiException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,
                            "Please wait a minute before requesting another code");
                });
        codeRepository.findByUserIdAndPurposeAndConsumedAtIsNull(user.getId(), purpose)
                .forEach(c -> c.setConsumedAt(LocalDateTime.now()));
        String code = BookingUtils.generateOtp();
        codeRepository.save(VerificationCode.builder()
                .user(user)
                .purpose(purpose)
                .codeHash(BookingUtils.sha256(user.getId() + ":" + code))
                .expiresAt(LocalDateTime.now().plusMinutes(ttlMinutes))
                .build());
        if (purpose == VerificationPurpose.EMAIL_VERIFY) {
            emailSender.send(user.getEmail(), "Verify your e-mail",
                    "Your verification code is " + code + ". It expires in " + ttlMinutes + " minutes.",
                    "Verify e-mail", appUrl + "/verify?email=" + java.net.URLEncoder.encode(user.getEmail(), java.nio.charset.StandardCharsets.UTF_8));
        } else {
            smsSender.send(user.getPhone(), "Your verification code is " + code + ". It expires in " + ttlMinutes + " minutes.");
        }
    }

    /** Validates and consumes a code; throws with a user-facing message otherwise. */
    @Transactional(noRollbackFor = ApiException.class)
    public void verify(User user, VerificationPurpose purpose, String code) {
        VerificationCode vc = codeRepository
                .findFirstByUserIdAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(user.getId(), purpose)
                .orElseThrow(() -> ApiException.badRequest("No pending code. Request a new one."));
        if (vc.getExpiresAt().isBefore(LocalDateTime.now())) {
            vc.setConsumedAt(LocalDateTime.now());
            throw ApiException.badRequest("Code has expired. Request a new one.");
        }
        if (vc.getAttempts() >= maxAttempts) {
            vc.setConsumedAt(LocalDateTime.now());
            throw ApiException.badRequest("Too many attempts. Request a new code.");
        }
        vc.setAttempts(vc.getAttempts() + 1);
        if (!BookingUtils.constantTimeEquals(vc.getCodeHash(), BookingUtils.sha256(user.getId() + ":" + code))) {
            throw ApiException.badRequest("Invalid code");
        }
        vc.setConsumedAt(LocalDateTime.now());
    }
}
