package com.booking.it;

import com.booking.dto.response.AppointmentResponse;
import com.booking.dto.response.PaymentResponse;
import com.booking.dto.response.ReportResponse;
import com.booking.dto.response.SlotsResponse;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.entity.User;
import com.booking.enums.AppointmentStatus;
import com.booking.enums.PaymentMethod;
import com.booking.enums.PaymentStatus;
import com.booking.enums.SlotStatus;
import com.booking.support.IntegrationTestBase;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import javax.sql.DataSource;
import java.sql.Connection;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Boots the application against a real PostgreSQL (Flyway migration + Hibernate ddl validation)
 * and runs a booking smoke flow. Skipped unless IT_POSTGRES=true; uses the dedicated booking_it
 * database (see application-postgres.yml).
 */
@Tag("postgres")
@ActiveProfiles("postgres")
@EnabledIfEnvironmentVariable(named = "IT_POSTGRES", matches = "true")
class PostgresBookingSmokeTest extends IntegrationTestBase {

    @Autowired private DataSource dataSource;
    @Autowired private JdbcTemplate jdbc;

    private Provider provider;
    private DomainService service;
    private User customer;
    private String customerToken;
    private LocalDate day;

    @BeforeEach
    void setUp() {
        provider = data.provider("Postgres Clinic", "UTC");
        data.openAllWeek(provider, LocalTime.of(9, 0), LocalTime.of(17, 0));
        service = data.service(provider, "Consultation", 30, 0, 1000);
        customer = data.customer();
        customerToken = auth.token(customer);
        day = inDays(2);
    }

    @Test
    void schemaIsMigratedByFlywayAndValidatedByHibernate() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            assertThat(c.getMetaData().getDatabaseProductName()).isEqualTo("PostgreSQL");
            assertThat(c.getCatalog()).isNotEqualTo("booking_db");
        }
        assertThat(jdbc.queryForList("select version from flyway_schema_history where success", String.class))
                .contains("1");
    }

    @Test
    void bookingSmokeFlow() throws Exception {
        SlotsResponse slots = slots(provider.getId(), service.getId(), day, null);
        assertThat(slots.slots()).hasSize(16);

        AppointmentResponse venue = book(customerToken, provider.getId(), service.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE);
        assertThat(venue.status()).isEqualTo(AppointmentStatus.CONFIRMED);
        assertThat(venue.startAt()).isEqualTo(Instant.parse("2030-01-09T10:00:00Z"));
        post("/api/appointments", auth.token(data.customer()),
                bookingBody(provider.getId(), service.getId(), day, "10:00", PaymentMethod.PAY_AT_VENUE))
                .andExpect(status().isConflict());

        AppointmentResponse online = book(customerToken, provider.getId(), service.getId(), day, "11:00", PaymentMethod.RAZORPAY);
        PaymentResponse paid = read(mvc.perform(MockMvcRequestBuilders.post("/api/payments/demo/complete")
                .param("appointmentId", online.id().toString())
                .header("Authorization", "Bearer " + customerToken)).andExpect(status().isOk()), PaymentResponse.class);
        assertThat(paid.status()).isEqualTo(PaymentStatus.SUCCESS);
        assertThat(paid.invoiceNumber()).startsWith("INV-");
        AppointmentResponse cancelled = read(put("/api/appointments/" + online.id() + "/cancel", customerToken,
                Map.of("reason", "Changed plans")).andExpect(status().isOk()), AppointmentResponse.class);
        assertThat(cancelled.payment().refundAmount()).isEqualTo(1000);
        assertThat(slotAt(slots(provider.getId(), service.getId(), day, null), "11:00").status()).isEqualTo(SlotStatus.AVAILABLE);

        AppointmentResponse moved = read(patch("/api/appointments/" + venue.id() + "/reschedule", customerToken,
                Map.of("date", day.toString(), "startTime", "14:00")).andExpect(status().isOk()), AppointmentResponse.class);
        assertThat(moved.startAt()).isEqualTo(Instant.parse("2030-01-09T14:00:00Z"));

        clock.setInstant(Instant.parse("2030-01-09T14:10:00Z"));
        put("/api/appointments/" + venue.id() + "/status", auth.token(provider.getUser()), Map.of("status", "COMPLETED"))
                .andExpect(status().isOk());
        post("/api/reviews", customerToken, Map.of("appointmentId", venue.id(), "rating", 5)).andExpect(status().isOk());
        get("/api/providers/{id}", null, provider.getId()).andExpect(status().isOk());

        String adminToken = auth.token(data.admin());
        ReportResponse report = read(get("/api/admin/reports/bookings?from=" + day + "&to=" + day, adminToken)
                .andExpect(status().isOk()), ReportResponse.class);
        assertThat(report.totals().bookings()).isEqualTo(2);
        assertThat(report.totals().completed()).isEqualTo(1);
        assertThat(report.totals().cancelled()).isEqualTo(1);
        get("/api/admin/appointments?q=postgres", adminToken).andExpect(status().isOk());
        get("/api/providers?q=consultation&date=" + day, null).andExpect(status().isOk());
    }

    @Test
    void dstInstantsRoundTripThroughTimestamptz() throws Exception {
        clock.setInstant(Instant.parse("2030-03-08T12:00:00Z"));
        Provider ny = data.provider("Manhattan Physio", "America/New_York");
        data.weekly(ny, null, 7, LocalTime.of(0, 0), LocalTime.of(6, 0));
        DomainService s = data.service(ny, "Therapy", 30, 0, 100);

        AppointmentResponse a = book(customerToken, ny.getId(), s.getId(), LocalDate.of(2030, 3, 10), "03:00",
                PaymentMethod.PAY_AT_VENUE);

        assertThat(getAppointment(a.id(), customerToken).startAt()).isEqualTo(Instant.parse("2030-03-10T07:00:00Z"));
        assertThat(slots(ny.getId(), s.getId(), LocalDate.of(2030, 3, 10), null).slots())
                .noneMatch(x -> x.startTime().getHour() == 2);
    }

    @Test
    void concurrentBookingsLetExactlyOneWin() throws Exception {
        int threads = 6;
        List<String> tokens = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            tokens.add(auth.token(data.customer()));
        }
        String json = objectMapper.writeValueAsString(bookingBody(provider.getId(), service.getId(), day, "15:00",
                PaymentMethod.PAY_AT_VENUE));
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (String token : tokens) {
                futures.add(pool.submit(() -> {
                    start.await();
                    return mvc.perform(MockMvcRequestBuilders.post("/api/appointments").contentType(MediaType.APPLICATION_JSON)
                            .content(json).header("Authorization", "Bearer " + token)).andReturn().getResponse().getStatus();
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : futures) {
                statuses.add(f.get(60, TimeUnit.SECONDS));
            }
            assertThat(statuses).filteredOn(s -> s == 201).hasSize(1);
            assertThat(statuses).filteredOn(s -> s == 409).hasSize(threads - 1);
        } finally {
            pool.shutdownNow();
        }
        assertThat(jdbc.queryForObject("select count(*) from appointments", Integer.class)).isEqualTo(1);
    }
}
