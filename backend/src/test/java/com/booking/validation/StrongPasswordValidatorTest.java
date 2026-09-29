package com.booking.validation;

import com.booking.dto.request.ChangePasswordRequest;
import com.booking.dto.request.RegisterRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

class StrongPasswordValidatorTest {

    private static ValidatorFactory factory;
    private static Validator validator;
    private final StrongPasswordValidator strong = new StrongPasswordValidator();

    @BeforeAll
    static void createValidator() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void closeValidator() {
        factory.close();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Password1", "Abcdefg1", "Zz9zzzzz", "Pässwörd1", "Very$ecure#Passw0rd!"})
    void acceptsPasswordsWithUpperLowerAndDigit(String password) {
        assertThat(StrongPasswordValidator.isStrong(password)).isTrue();
        assertThat(strong.isValid(password, null)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"Pass1", "Abcdef1", "alllowercase1", "ALLUPPERCASE1", "NoDigitsHere", "12345678", "        "})
    void rejectsShortOrIncompletePasswords(String password) {
        assertThat(StrongPasswordValidator.isStrong(password)).isFalse();
        assertThat(strong.isValid(password, null)).isFalse();
    }

    @Test
    void enforcesTheLengthBoundaries() {
        String base = "Aa1";
        assertThat(StrongPasswordValidator.isStrong(base + "x".repeat(StrongPasswordValidator.MIN_LENGTH - 4))).isFalse(); // 7
        assertThat(StrongPasswordValidator.isStrong(base + "x".repeat(StrongPasswordValidator.MIN_LENGTH - 3))).isTrue(); // 8
        assertThat(StrongPasswordValidator.isStrong(base + "x".repeat(StrongPasswordValidator.MAX_LENGTH - 3))).isTrue(); // 128
        assertThat(StrongPasswordValidator.isStrong(base + "x".repeat(StrongPasswordValidator.MAX_LENGTH - 2))).isFalse(); // 129
    }

    @Test
    void nullIsLeftToNotBlank() {
        assertThat(strong.isValid(null, null)).isTrue();
    }

    @Test
    void annotationReportsTheUserFacingMessage() {
        Set<ConstraintViolation<RegisterRequest>> violations = validator.validate(
                new RegisterRequest("Jane Doe", "jane@example.test", null, "weakpass", null, null, null));

        assertThat(violations).singleElement().satisfies(v -> {
            assertThat(v.getPropertyPath().toString()).isEqualTo("password");
            assertThat(v.getMessage())
                    .isEqualTo("Password must be at least 8 characters and include upper case, lower case and a number");
        });
        assertThat(validator.validate(new RegisterRequest("Jane Doe", "jane@example.test", null, "Strong1pass", null, null, null)))
                .isEmpty();
        assertThat(validator.validate(new ChangePasswordRequest("anything", "short"))).hasSize(1);
    }
}
