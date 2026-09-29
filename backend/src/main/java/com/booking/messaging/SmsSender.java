package com.booking.messaging;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Sends SMS through Twilio's REST API when app.sms.provider=twilio and credentials are set,
 * otherwise logs the message (FR-24, FR-34).
 */
@Slf4j
@Component
public class SmsSender {

    private final RestClient restClient = RestClient.create();

    @Value("${app.sms.provider:log}")
    private String provider;

    @Value("${app.sms.twilio.account-sid:}")
    private String accountSid;

    @Value("${app.sms.twilio.auth-token:}")
    private String authToken;

    @Value("${app.sms.twilio.from-number:}")
    private String fromNumber;

    public boolean isLive() {
        return "twilio".equalsIgnoreCase(provider) && !accountSid.isBlank() && !authToken.isBlank() && !fromNumber.isBlank();
    }

    @Async
    public void send(String to, String text) {
        if (to == null || to.isBlank()) {
            return;
        }
        if (!isLive()) {
            log.info("[SMS:log] to={} text=\"{}\"", to, text);
            return;
        }
        try {
            var form = new LinkedMultiValueMap<String, String>();
            form.add("To", to);
            form.add("From", fromNumber);
            form.add("Body", text);
            String auth = Base64.getEncoder().encodeToString((accountSid + ":" + authToken).getBytes(StandardCharsets.UTF_8));
            restClient.post()
                    .uri("https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json", accountSid)
                    .header("Authorization", "Basic " + auth)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .toBodilessEntity();
            log.info("[SMS] sent to={}", to);
        } catch (Exception e) {
            log.warn("[SMS] failed to={}: {}", to, e.getMessage());
        }
    }
}
