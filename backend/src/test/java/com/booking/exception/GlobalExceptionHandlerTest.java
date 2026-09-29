package com.booking.exception;

import jakarta.validation.ConstraintViolationException;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.validation.ObjectError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/** Every exception type maps to the expected status and a consistent body without internals. */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @SuppressWarnings("unused")
    void target(String value) {
    }

    private static void assertBody(ResponseEntity<Map<String, Object>> res, HttpStatus status, String message) {
        assertThat(res.getStatusCode()).isEqualTo(status);
        assertThat(res.getBody()).containsEntry("status", status.value())
                .containsEntry("error", status.getReasonPhrase())
                .containsEntry("message", message)
                .containsKey("timestamp");
    }

    @Test
    void apiExceptionsKeepTheirStatusAndMessage() {
        assertBody(handler.handleApi(ApiException.badGateway("Upstream down")), HttpStatus.BAD_GATEWAY, "Upstream down");
        assertBody(handler.handleApi(ApiException.unavailable("Later")), HttpStatus.SERVICE_UNAVAILABLE, "Later");
        assertBody(handler.handleApi(ApiException.conflict("Taken")), HttpStatus.CONFLICT, "Taken");
        assertBody(handler.handleApi(new ApiException(HttpStatus.LOCKED, "Locked out")), HttpStatus.LOCKED, "Locked out");
    }

    @Test
    void securityExceptions() {
        assertBody(handler.handleBadCredentials(new BadCredentialsException("x")), HttpStatus.UNAUTHORIZED, "Invalid email or password");
        assertBody(handler.handleLocked(new LockedException("x")), HttpStatus.LOCKED,
                "Too many failed attempts. Account temporarily locked - try again later.");
        assertBody(handler.handleDisabled(new DisabledException("x")), HttpStatus.FORBIDDEN,
                "This account has been deactivated. Contact support.");
        assertBody(handler.handleAccessDenied(new AccessDeniedException("x")), HttpStatus.FORBIDDEN,
                "You do not have permission to perform this action");
    }

    @Test
    void inputProblemsAreBadRequests() throws Exception {
        assertBody(handler.handleConstraintViolation(new ConstraintViolationException(Set.of())), HttpStatus.BAD_REQUEST,
                "Validation failed");
        assertBody(handler.handleBadInput(new IllegalArgumentException("secret internals")), HttpStatus.BAD_REQUEST,
                "Malformed request");
        assertBody(handler.handleBadInput(new HttpMessageNotReadableException("bad", new MockHttpInputMessage(new byte[0]))),
                HttpStatus.BAD_REQUEST, "Malformed request");
        assertBody(handler.handleBadInput(new MissingServletRequestParameterException("date", "LocalDate")),
                HttpStatus.BAD_REQUEST, "Missing parameter: date");
    }

    @Test
    void validationErrorsListFieldAndGlobalErrors() throws Exception {
        MethodParameter param = new MethodParameter(getClass().getDeclaredMethod("target", String.class), 0);
        BeanPropertyBindingResult result = new BeanPropertyBindingResult(new Object(), "request");
        result.addError(new FieldError("request", "email", "must be a well-formed email address"));
        result.addError(new FieldError("request", "email", "second message is ignored"));
        result.addError(new ObjectError("request", "Dates are inconsistent"));

        ResponseEntity<Map<String, Object>> res = handler.handleValidation(new MethodArgumentNotValidException(param, result));

        assertThat(res.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(res.getBody()).containsEntry("message", "must be a well-formed email address");
        assertThat(res.getBody().get("errors")).isEqualTo(Map.of("email", "must be a well-formed email address",
                "request", "Dates are inconsistent"));

        ResponseEntity<Map<String, Object>> empty = handler.handleValidation(
                new MethodArgumentNotValidException(param, new BeanPropertyBindingResult(new Object(), "request")));
        assertThat(empty.getBody()).containsEntry("message", "Validation failed").containsEntry("errors", Map.of());
    }

    @Test
    void routingAndInfrastructureErrors() {
        assertBody(handler.handleMethod(new HttpRequestMethodNotSupportedException("DELETE")), HttpStatus.METHOD_NOT_ALLOWED,
                "Method not allowed");
        assertBody(handler.handleNotFound(new NoResourceFoundException(HttpMethod.GET, "/nope")), HttpStatus.NOT_FOUND, "Not found");
        assertBody(handler.handleUploadSize(new MaxUploadSizeExceededException(2_000_000)), HttpStatus.PAYLOAD_TOO_LARGE,
                "File is too large (max 2 MB)");
        String conflict = "The request conflicts with existing data (it may have just been taken). Please refresh and try again.";
        assertBody(handler.handleConflict(new DataIntegrityViolationException("uk_appt_slot_key")), HttpStatus.CONFLICT, conflict);
        assertBody(handler.handleConflict(new CannotAcquireLockException("timeout")), HttpStatus.CONFLICT, conflict);
        assertBody(handler.handleGeneric(new IllegalStateException("NullPointer in X")), HttpStatus.INTERNAL_SERVER_ERROR,
                "Something went wrong. Please try again.");
    }

    @Test
    void bodyHelperShape() {
        assertThat(GlobalExceptionHandler.body(HttpStatus.I_AM_A_TEAPOT, "short and stout"))
                .containsOnlyKeys("timestamp", "status", "error", "message")
                .containsEntry("status", 418);
    }
}
