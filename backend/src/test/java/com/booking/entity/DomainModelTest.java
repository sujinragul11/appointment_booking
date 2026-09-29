package com.booking.entity;

import com.booking.enums.ServiceMode;
import com.booking.mapper.DtoMapper;
import com.booking.service.ExportService;
import org.junit.jupiter.api.Test;

import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Small rules that live on entities, enums and static helpers. */
class DomainModelTest {

    @Test
    void serviceModeAllows() {
        assertThat(ServiceMode.BOTH.allows(ServiceMode.ONLINE)).isTrue();
        assertThat(ServiceMode.BOTH.allows(ServiceMode.IN_PERSON)).isTrue();
        assertThat(ServiceMode.ONLINE.allows(ServiceMode.ONLINE)).isTrue();
        assertThat(ServiceMode.ONLINE.allows(ServiceMode.IN_PERSON)).isFalse();
        assertThat(ServiceMode.IN_PERSON.allows(ServiceMode.ONLINE)).isFalse();
    }

    @Test
    void providerZoneFallsBackToUtcForUnknownZones() {
        assertThat(Provider.builder().build().zone()).isEqualTo(ZoneId.of("Asia/Kolkata"));
        assertThat(Provider.builder().timezone("Europe/London").build().zone()).isEqualTo(ZoneId.of("Europe/London"));
        assertThat(Provider.builder().timezone("Mars/Olympus").build().zone()).isEqualTo(ZoneId.of("UTC"));
        assertThat(Provider.builder().timezone(null).build().zone()).isEqualTo(ZoneId.of("UTC"));
    }

    @Test
    void usersCanLogInOnlyWhenActiveAndNotDeleted() {
        assertThat(User.builder().build().canLogin()).isTrue();
        assertThat(User.builder().active(false).build().canLogin()).isFalse();
        assertThat(User.builder().deleted(true).build().canLogin()).isFalse();
    }

    @Test
    void generatedPolicyText() {
        Provider p = Provider.builder().cancellationCutoffHours(12).lateCancelRefundPercent(0).maxReschedules(1)
                .rescheduleCutoffHours(3).build();
        assertThat(DtoMapper.describePolicy(p)).isEqualTo("Free cancellation up to 12 hours before the appointment; "
                + "later cancellations are not refunded. Reschedule up to 1 time(s), at least 3 hours before the start.");
    }

    @Test
    void exportFormatParsing() {
        assertThat(ExportService.format(null)).isEqualTo(ExportService.Format.CSV);
        assertThat(ExportService.format("CSV")).isEqualTo(ExportService.Format.CSV);
        assertThat(ExportService.format("pdf")).isEqualTo(ExportService.Format.PDF);
        assertThatThrownBy(() -> ExportService.format("xml")).hasMessage("format must be csv or pdf");
    }
}
