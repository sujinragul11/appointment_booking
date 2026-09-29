package com.booking.messaging;

import jakarta.mail.BodyPart;
import jakarta.mail.Multipart;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.ArrayList;
import java.util.List;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** SMTP delivery (with a mocked JavaMailSender) and the log-only fallback. */
class EmailSenderTest {

    private JavaMailSender mailSender;
    private ObjectProvider<JavaMailSender> provider;
    private EmailSender sender;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        mailSender = mock(JavaMailSender.class);
        when(mailSender.createMimeMessage()).thenAnswer(inv -> new MimeMessage(Session.getInstance(new Properties())));
        provider = mock(ObjectProvider.class);
        when(provider.getIfAvailable()).thenReturn(mailSender);
        sender = new EmailSender(provider);
        ReflectionTestUtils.setField(sender, "from", "no-reply@test.local");
        ReflectionTestUtils.setField(sender, "appName", "TestApp");
    }

    private static List<String> textParts(Object content) throws Exception {
        List<String> parts = new ArrayList<>();
        if (content instanceof String s) {
            parts.add(s);
        } else if (content instanceof Multipart mp) {
            for (int i = 0; i < mp.getCount(); i++) {
                BodyPart part = mp.getBodyPart(i);
                parts.addAll(textParts(part.getContent()));
            }
        }
        return parts;
    }

    @Test
    void disabledMailOnlyLogs() {
        ReflectionTestUtils.setField(sender, "enabled", false);

        sender.send("jane@example.test", "Hello", "Body");

        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void enabledButWithoutAMailServerOnlyLogs() {
        ReflectionTestUtils.setField(sender, "enabled", true);
        when(provider.getIfAvailable()).thenReturn(null);

        sender.send("jane@example.test", "Hello", "Body", "Open", "http://localhost/x");

        verify(mailSender, never()).send(any(MimeMessage.class));
    }

    @Test
    void sendsABrandedHtmlAndPlainTextMessage() throws Exception {
        ReflectionTestUtils.setField(sender, "enabled", true);

        sender.send("jane@example.test", "Reset <your> password", "Hi Jane,\nclick <b>below</b> & go",
                "Reset password", "http://localhost:5173/reset-password?token=a&b");

        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(captor.capture());
        MimeMessage msg = captor.getValue();
        assertThat(msg.getSubject()).isEqualTo("[TestApp] Reset <your> password");
        assertThat(msg.getFrom()[0].toString()).isEqualTo("no-reply@test.local");
        assertThat(msg.getAllRecipients()[0].toString()).isEqualTo("jane@example.test");

        List<String> parts = textParts(msg.getContent());
        assertThat(parts).anySatisfy(p -> assertThat(p).isEqualTo("Hi Jane,\nclick <b>below</b> & go\n\n"
                + "Reset password: http://localhost:5173/reset-password?token=a&b"));
        assertThat(parts).anySatisfy(p -> assertThat(p)
                .contains("<h2 style=\"color:#4f46e5\">TestApp</h2>")
                .contains("Hi Jane,<br>click &lt;b&gt;below&lt;/b&gt; &amp; go")
                .contains("<h3>Reset &lt;your&gt; password</h3>")
                .contains("href=\"http://localhost:5173/reset-password?token=a&amp;b\"")
                .contains(">Reset password</a>"));
    }

    @Test
    void messagesWithoutALinkHaveNoButton() throws Exception {
        ReflectionTestUtils.setField(sender, "enabled", true);

        sender.send("jane@example.test", "Plain", "Just text");

        ArgumentCaptor<MimeMessage> captor = ArgumentCaptor.forClass(MimeMessage.class);
        verify(mailSender).send(captor.capture());
        List<String> parts = textParts(captor.getValue().getContent());
        assertThat(parts).contains("Just text");
        assertThat(parts).allSatisfy(p -> assertThat(p).doesNotContain("<a href"));
    }

    @Test
    void deliveryFailuresAreSwallowed() {
        ReflectionTestUtils.setField(sender, "enabled", true);
        doThrow(new MailSendException("SMTP down")).when(mailSender).send(any(MimeMessage.class));

        assertThatCode(() -> sender.send("jane@example.test", "Hello", "Body", null, null)).doesNotThrowAnyException();
    }
}
