package com.booking.messaging;

import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

/**
 * Sends e-mail through SMTP (SendGrid, SES, Gmail, MailHog...) when app.mail.enabled=true,
 * otherwise logs the message so local development needs no mail server (FR-24, FR-33).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EmailSender {

    private final ObjectProvider<JavaMailSender> mailSender;

    @Value("${app.mail.enabled:false}")
    private boolean enabled;

    @Value("${app.mail.from:no-reply@sloto.local}")
    private String from;

    @Value("${app.name:Sloto}")
    private String appName;

    @Async
    public void send(String to, String subject, String text) {
        send(to, subject, text, null, null);
    }

    /** Sends a simple branded HTML e-mail with an optional call-to-action link. */
    @Async
    public void send(String to, String subject, String text, String actionLabel, String actionUrl) {
        JavaMailSender sender = mailSender.getIfAvailable();
        if (!enabled || sender == null) {
            log.info("[EMAIL:log] to={} subject=\"{}\" body=\"{}\"{}", to, subject, text,
                    actionUrl == null ? "" : " link=" + actionUrl);
            return;
        }
        try {
            MimeMessage msg = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, true, "UTF-8");
            helper.setFrom(from);
            helper.setTo(to);
            helper.setSubject("[" + appName + "] " + subject);
            helper.setText(text + (actionUrl == null ? "" : "\n\n" + actionLabel + ": " + actionUrl), html(subject, text, actionLabel, actionUrl));
            sender.send(msg);
            log.info("[EMAIL] sent to={} subject=\"{}\"", to, subject);
        } catch (Exception e) {
            log.warn("[EMAIL] failed to={} subject=\"{}\": {}", to, subject, e.getMessage());
        }
    }

    private String html(String subject, String text, String actionLabel, String actionUrl) {
        String body = HtmlUtils.htmlEscape(text).replace("\n", "<br>");
        String button = actionUrl == null ? "" :
                "<p style=\"margin:24px 0\"><a href=\"" + HtmlUtils.htmlEscape(actionUrl) + "\" style=\"background:#4f46e5;color:#fff;"
                        + "padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600\">"
                        + HtmlUtils.htmlEscape(actionLabel) + "</a></p>";
        return "<div style=\"font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937\">"
                + "<h2 style=\"color:#4f46e5\">" + HtmlUtils.htmlEscape(appName) + "</h2>"
                + "<h3>" + HtmlUtils.htmlEscape(subject) + "</h3><p>" + body + "</p>" + button
                + "<p style=\"color:#6b7280;font-size:12px\">You received this e-mail because of activity on your "
                + HtmlUtils.htmlEscape(appName) + " account.</p></div>";
    }
}
