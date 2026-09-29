package com.booking.service;

import com.booking.dto.response.ReportResponse;
import com.booking.dto.response.ReportResponse.*;
import com.booking.entity.Appointment;
import com.booking.entity.Payment;
import com.booking.enums.AppointmentStatus;

import com.booking.exception.ApiException;
import com.booking.repository.AppointmentRepository;
import com.booking.repository.PaymentRepository;
import com.booking.util.BookingUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

/** Revenue, bookings, cancellations and peak-hour reports (FR-46). */
@Service
@RequiredArgsConstructor
public class ReportService {

    private final AppointmentRepository appointmentRepository;
    private final PaymentRepository paymentRepository;
    private final Clock clock;

    @Transactional(readOnly = true)
    public ReportResponse bookings(LocalDate from, LocalDate to, Long providerId) {
        // default: the last 30 days plus the next 30 (so upcoming load is visible)
        LocalDate today = LocalDate.now(clock);
        LocalDate start = from == null ? (to == null ? today.minusDays(29) : to.minusDays(29)) : from;
        LocalDate end = to == null ? (from == null ? today.plusDays(30) : from.plusDays(59)) : to;
        if (start.isAfter(end)) {
            throw ApiException.badRequest("'from' must be before 'to'");
        }
        if (start.plusDays(366).isBefore(end)) {
            throw ApiException.badRequest("The report range is limited to one year");
        }
        List<Appointment> appts = providerId == null
                ? appointmentRepository.findBetween(start, end)
                : appointmentRepository.findForProviderBetween(providerId, start, end);
        Map<Long, Payment> pay = appts.isEmpty() ? Map.of() : paymentRepository
                .findByAppointmentIdIn(appts.stream().map(Appointment::getId).toList()).stream()
                .collect(Collectors.toMap(p -> p.getAppointment().getId(), Function.identity()));

        long total = appts.size();
        long completed = count(appts, AppointmentStatus.COMPLETED);
        long cancelled = count(appts, AppointmentStatus.CANCELLED);
        long noShows = count(appts, AppointmentStatus.NO_SHOW);
        long upcoming = appts.stream().filter(a -> a.getStatus().isActive()).count();
        double revenue = appts.stream().mapToDouble(a -> collected(pay.get(a.getId()))).sum();
        double refunds = appts.stream().mapToDouble(a -> pay.containsKey(a.getId()) ? pay.get(a.getId()).getRefundAmount() : 0).sum();
        long nonCancelled = total - cancelled;
        Totals totals = new Totals(total, completed, cancelled, noShows, upcoming, BookingUtils.money(revenue),
                BookingUtils.money(refunds), pct(cancelled, total), pct(noShows, completed + noShows),
                nonCancelled == 0 ? 0 : BookingUtils.money(appts.stream().filter(a -> a.getStatus() != AppointmentStatus.CANCELLED)
                        .mapToDouble(Appointment::getFinalAmount).sum() / nonCancelled));

        List<DayRow> byDay = new ArrayList<>();
        Map<LocalDate, List<Appointment>> perDay = appts.stream().collect(Collectors.groupingBy(Appointment::getDate));
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            List<Appointment> list = perDay.getOrDefault(d, List.of());
            byDay.add(new DayRow(d, list.size(), count(list, AppointmentStatus.CANCELLED),
                    BookingUtils.money(list.stream().mapToDouble(a -> collected(pay.get(a.getId()))).sum())));
        }
        List<Appointment> kept = appts.stream().filter(a -> a.getStatus() != AppointmentStatus.CANCELLED).toList();
        List<HourRow> byHour = new ArrayList<>();
        for (int h = 0; h < 24; h++) {
            int hour = h;
            long c = kept.stream().filter(a -> a.getStartTime().getHour() == hour).count();
            if (c > 0) byHour.add(new HourRow(h, c));
        }
        List<WeekdayRow> byWeekday = new ArrayList<>();
        for (int d = 1; d <= 7; d++) {
            int dow = d;
            byWeekday.add(new WeekdayRow(d, BookingUtils.dayName(d),
                    kept.stream().filter(a -> a.getDate().getDayOfWeek().getValue() == dow).count()));
        }
        List<NameCount> byStatus = Arrays.stream(AppointmentStatus.values())
                .map(s -> new NameCount(s.name(), count(appts, s))).filter(n -> n.count() > 0).toList();
        List<RankRow> topProviders = rank(kept, a -> a.getProvider().getId(), a -> a.getProvider().getBusinessName(), pay);
        List<RankRow> topServices = rank(kept, a -> a.getService().getId(), a -> a.getService().getName(), pay);
        return new ReportResponse(start, end, totals, byDay, byHour, byWeekday, byStatus, topProviders, topServices);
    }

    private static List<RankRow> rank(List<Appointment> list, Function<Appointment, Long> id, Function<Appointment, String> name,
                                      Map<Long, Payment> pay) {
        return list.stream().collect(Collectors.groupingBy(id)).values().stream()
                .map(g -> new RankRow(id.apply(g.get(0)), name.apply(g.get(0)), g.size(),
                        BookingUtils.money(g.stream().mapToDouble(a -> collected(pay.get(a.getId()))).sum())))
                .sorted(Comparator.comparingLong(RankRow::bookings).reversed().thenComparing(RankRow::name))
                .limit(10).toList();
    }

    private static double collected(Payment p) {
        if (p == null) return 0;
        return switch (p.getStatus()) {
            case SUCCESS, PARTIALLY_REFUNDED, REFUNDED -> p.getAmount() - p.getRefundAmount();
            default -> 0;
        };
    }

    private static long count(List<Appointment> list, AppointmentStatus s) {
        return list.stream().filter(a -> a.getStatus() == s).count();
    }

    private static double pct(long part, long whole) {
        return whole == 0 ? 0 : Math.round(part * 1000.0 / whole) / 10.0;
    }

}
