package com.booking.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

import java.lang.annotation.*;

/** At least 8 characters with upper case, lower case and a digit (FR-8). */
@Documented
@Constraint(validatedBy = StrongPasswordValidator.class)
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT})
@Retention(RetentionPolicy.RUNTIME)
public @interface StrongPassword {

    String message() default "Password must be at least 8 characters and include upper case, lower case and a number";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};
}
