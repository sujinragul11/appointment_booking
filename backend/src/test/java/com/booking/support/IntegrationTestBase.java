package com.booking.support;

import com.booking.dto.response.AppointmentResponse;
import com.booking.dto.response.SlotResponse;
import com.booking.dto.response.SlotsResponse;
import com.booking.enums.PaymentMethod;
import com.booking.messaging.EmailSender;
import com.booking.messaging.SmsSender;
import com.booking.security.GoogleTokenVerifier;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Shared base for all Spring integration tests. Every subclass inherits the same configuration
 * (profile "test", MockMvc, {@link TestConfig}, the same mocked beans), so the application
 * context is started once and reused by the whole suite. Data is wiped before each test.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import({TestConfig.class, TestDataFactory.class, AuthHelper.class, DatabaseCleaner.class})
public abstract class IntegrationTestBase {

    /** Outgoing e-mail is captured (links / codes are read from the mock's arguments). */
    @MockitoBean
    protected EmailSender emailSender;

    @MockitoBean
    protected SmsSender smsSender;

    /** Real bean (Google sign-in not configured) that individual tests may stub. */
    @MockitoSpyBean
    protected GoogleTokenVerifier googleTokenVerifier;

    @Autowired protected MockMvc mvc;
    @Autowired protected ObjectMapper objectMapper;
    @Autowired protected TestDataFactory data;
    @Autowired protected AuthHelper auth;
    @Autowired protected MutableClock clock;
    @Autowired private DatabaseCleaner databaseCleaner;

    @BeforeEach
    void resetSharedState() {
        SecurityContextHolder.clearContext();
        databaseCleaner.clean();
        clock.setInstant(TestConfig.BASE_INSTANT);
    }

    // ------------------------------------------------------------------ time

    /** Today's date according to the test clock (UTC). */
    protected LocalDate today() {
        return LocalDate.ofInstant(clock.instant(), ZoneOffset.UTC);
    }

    protected LocalDate inDays(int days) {
        return today().plusDays(days);
    }

    // ------------------------------------------------------------------ HTTP helpers

    protected ResultActions get(String url, String token, Object... uriVars) throws Exception {
        return mvc.perform(withAuth(MockMvcRequestBuilders.get(url, uriVars), token));
    }

    protected ResultActions post(String url, String token, Object body) throws Exception {
        return mvc.perform(withBody(withAuth(MockMvcRequestBuilders.post(url), token), body));
    }

    protected ResultActions put(String url, String token, Object body) throws Exception {
        return mvc.perform(withBody(withAuth(MockMvcRequestBuilders.put(url), token), body));
    }

    protected ResultActions patch(String url, String token, Object body) throws Exception {
        return mvc.perform(withBody(withAuth(MockMvcRequestBuilders.patch(url), token), body));
    }

    protected ResultActions delete(String url, String token) throws Exception {
        return mvc.perform(withAuth(MockMvcRequestBuilders.delete(url), token));
    }

    protected MockHttpServletRequestBuilder withAuth(MockHttpServletRequestBuilder builder, String token) {
        if (token != null) {
            builder.header(HttpHeaders.AUTHORIZATION, AuthHelper.bearer(token));
        }
        return builder;
    }

    private MockHttpServletRequestBuilder withBody(MockHttpServletRequestBuilder builder, Object body) throws Exception {
        if (body != null) {
            builder.contentType(MediaType.APPLICATION_JSON)
                    .content(body instanceof String s ? s : objectMapper.writeValueAsString(body));
        }
        return builder;
    }

    protected <T> T read(ResultActions result, Class<T> type) throws Exception {
        return objectMapper.readValue(result.andReturn().getResponse().getContentAsString(), type);
    }

    protected <T> T read(ResultActions result, TypeReference<T> type) throws Exception {
        return objectMapper.readValue(result.andReturn().getResponse().getContentAsString(), type);
    }

    // ------------------------------------------------------------------ booking helpers

    protected Map<String, Object> bookingBody(Long providerId, Long serviceId, LocalDate date, String startTime,
                                              PaymentMethod method) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("providerId", providerId);
        body.put("serviceId", serviceId);
        body.put("date", date.toString());
        body.put("startTime", startTime);
        body.put("paymentMethod", method.name());
        return body;
    }

    protected AppointmentResponse book(String token, Map<String, Object> body) throws Exception {
        return read(post("/api/appointments", token, body).andExpect(status().isCreated()), AppointmentResponse.class);
    }

    protected AppointmentResponse book(String token, Long providerId, Long serviceId, LocalDate date, String startTime,
                                       PaymentMethod method) throws Exception {
        return book(token, bookingBody(providerId, serviceId, date, startTime, method));
    }

    protected AppointmentResponse getAppointment(Long id, String token) throws Exception {
        return read(get("/api/appointments/{id}", token, id).andExpect(status().isOk()), AppointmentResponse.class);
    }

    protected SlotsResponse slots(Long providerId, Long serviceId, LocalDate date, String token) throws Exception {
        return read(get("/api/slots?providerId={p}&serviceId={s}&date={d}", token, providerId, serviceId, date)
                .andExpect(status().isOk()), SlotsResponse.class);
    }

    protected SlotResponse slotAt(SlotsResponse slots, String time) {
        LocalTime t = LocalTime.parse(time);
        return slots.slots().stream().filter(s -> s.startTime().equals(t)).findFirst()
                .orElseThrow(() -> new AssertionError("No slot at " + time + " in " + slots.slots()));
    }

    protected List<LocalTime> startTimes(SlotsResponse slots) {
        return slots.slots().stream().map(SlotResponse::startTime).toList();
    }

    // ------------------------------------------------------------------ captured messages

    /** Action URL of the most recent e-mail with this subject sent to {@code to}. */
    protected String lastEmailLink(String to, String subject) {
        ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
        verify(emailSender, atLeastOnce()).send(eq(to), eq(subject), any(), any(), link.capture());
        return link.getValue();
    }

    /** Body text of the most recent e-mail with this subject sent to {@code to}. */
    protected String lastEmailText(String to, String subject) {
        ArgumentCaptor<String> text = ArgumentCaptor.forClass(String.class);
        verify(emailSender, atLeastOnce()).send(eq(to), eq(subject), text.capture(), any(), any());
        return text.getValue();
    }
}
