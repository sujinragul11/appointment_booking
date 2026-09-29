package com.booking.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class StrongPasswordValidator implements ConstraintValidator<StrongPassword, String> {

    public static final int MIN_LENGTH = 8;
    public static final int MAX_LENGTH = 128;

    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) {
        return value == null || isStrong(value);
    }

    public static boolean isStrong(String pw) {
        if (pw.length() < MIN_LENGTH || pw.length() > MAX_LENGTH) {
            return false;
        }
        boolean upper = false, lower = false, digit = false;
        for (char c : pw.toCharArray()) {
            if (Character.isUpperCase(c)) upper = true;
            else if (Character.isLowerCase(c)) lower = true;
            else if (Character.isDigit(c)) digit = true;
        }
        return upper && lower && digit;
    }
}
