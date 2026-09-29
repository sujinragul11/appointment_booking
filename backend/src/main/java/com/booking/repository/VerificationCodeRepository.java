package com.booking.repository;

import com.booking.entity.VerificationCode;
import com.booking.enums.VerificationPurpose;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface VerificationCodeRepository extends JpaRepository<VerificationCode, Long> {

    Optional<VerificationCode> findFirstByUserIdAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(Long userId, VerificationPurpose purpose);

    List<VerificationCode> findByUserIdAndPurposeAndConsumedAtIsNull(Long userId, VerificationPurpose purpose);
}
