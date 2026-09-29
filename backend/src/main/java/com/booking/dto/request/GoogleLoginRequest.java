package com.booking.dto.request;

import com.booking.enums.*;
import com.booking.validation.StrongPassword;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** idToken is the credential returned by Google Identity Services. */
public record GoogleLoginRequest(@NotBlank String idToken) {}
