package com.booking.service;

import com.booking.dto.response.ReportResponse;
import com.booking.entity.Appointment;
import com.booking.entity.Payment;
import com.booking.entity.User;
import com.booking.exception.ApiException;
import com.booking.repository.PaymentRepository;
import com.booking.util.BookingUtils;
import com.booking.util.CsvWriter;
import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** CSV / PDF exports (FR-47) and payment invoices (FR-40). */
@Service
@RequiredArgsConstructor
public class ExportService {

    private static final Font TITLE = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 16, new Color(79, 70, 229));
    private static final Font HEAD = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 8, Color.WHITE);
    private static final Font CELL = FontFactory.getFont(FontFactory.HELVETICA, 8);
    private static final Font BODY = FontFactory.getFont(FontFactory.HELVETICA, 10);
    private static final Font BOLD = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10);

    private final PaymentRepository paymentRepository;

    @Value("${app.name:Sloto}")
    private String appName;

    public enum Format { CSV, PDF }

    public static Format format(String f) {
        if (f == null || f.equalsIgnoreCase("csv")) return Format.CSV;
        if (f.equalsIgnoreCase("pdf")) return Format.PDF;
        throw ApiException.badRequest("format must be csv or pdf");
    }

    // ------------------------------------------------------------------ appointments

    private static final List<String> APPT_HEADERS = List.of("Booking ref", "Date", "Start", "End", "Timezone", "Status",
            "Customer", "Customer e-mail", "Provider", "Service", "Staff", "Mode", "Amount", "Discount", "Final",
            "Payment", "Paid", "Refunded", "Cancelled by", "Cancel reason", "Created");

    @Transactional(readOnly = true)
    public byte[] appointments(List<Appointment> rows, Format format) {
        Map<Long, Payment> pay = rows.isEmpty() ? Map.of() : paymentRepository
                .findByAppointmentIdIn(rows.stream().map(Appointment::getId).toList()).stream()
                .collect(Collectors.toMap(p -> p.getAppointment().getId(), Function.identity()));
        List<List<Object>> data = new ArrayList<>();
        for (Appointment a : rows) {
            Payment p = pay.get(a.getId());
            data.add(List.of(a.getBookingRef(), a.getDate(), a.getStartTime(), a.getEndTime(), a.getTimezone(),
                    a.getStatus(), a.getCustomer().getName(), a.getCustomer().getEmail(), a.getProvider().getBusinessName(),
                    a.getService().getName(), a.getStaff() == null ? "" : a.getStaff().getName(), a.getMode(),
                    a.getAmount(), a.getDiscount(), a.getFinalAmount(), a.getPaymentStatus(),
                    p == null ? 0 : p.getAmount(), p == null ? 0 : p.getRefundAmount(),
                    a.getCancelledBy() == null ? "" : a.getCancelledBy(), nz(a.getCancelReason()),
                    a.getCreatedAt() == null ? "" : a.getCreatedAt().withNano(0)));
        }
        return format == Format.CSV ? csv(APPT_HEADERS, data) : pdf("Appointments", APPT_HEADERS.subList(0, 16),
                data.stream().map(r -> r.subList(0, 16)).toList(), true);
    }

    // ------------------------------------------------------------------ users

    private static final List<String> USER_HEADERS = List.of("ID", "Name", "E-mail", "Phone", "Role", "E-mail verified",
            "Phone verified", "Active", "Created", "Last login");

    public byte[] users(List<User> users, Format format) {
        List<List<Object>> data = users.stream().map(u -> List.<Object>of(u.getId(), u.getName(), u.getEmail(), nz(u.getPhone()),
                u.getRole(), u.isVerified(), u.isPhoneVerified(), u.isActive(),
                u.getCreatedAt() == null ? "" : u.getCreatedAt().withNano(0),
                u.getLastLoginAt() == null ? "" : u.getLastLoginAt().withNano(0))).toList();
        return format == Format.CSV ? csv(USER_HEADERS, data) : pdf("Users", USER_HEADERS, data, true);
    }

    // ------------------------------------------------------------------ report

    public byte[] report(ReportResponse r, Format format) {
        if (format == Format.CSV) {
            CsvWriter w = new CsvWriter();
            w.row("Report", r.from() + " to " + r.to());
            var t = r.totals();
            w.row("Bookings", t.bookings()).row("Completed", t.completed()).row("Cancelled", t.cancelled())
                    .row("No-shows", t.noShows()).row("Upcoming", t.upcoming()).row("Revenue", t.revenue())
                    .row("Refunds", t.refunds()).row("Cancellation rate %", t.cancellationRate())
                    .row("No-show rate %", t.noShowRate()).row("Average booking value", t.averageBookingValue()).row();
            w.row("Date", "Bookings", "Cancellations", "Revenue");
            r.byDay().forEach(d -> w.row(d.date(), d.bookings(), d.cancellations(), d.revenue()));
            w.row().row("Hour", "Bookings");
            r.byHour().forEach(h -> w.row(String.format("%02d:00", h.hour()), h.bookings()));
            w.row().row("Weekday", "Bookings");
            r.byWeekday().forEach(d -> w.row(d.day(), d.bookings()));
            w.row().row("Top providers", "Bookings", "Revenue");
            r.topProviders().forEach(p -> w.row(p.name(), p.bookings(), p.revenue()));
            w.row().row("Top services", "Bookings", "Revenue");
            r.topServices().forEach(p -> w.row(p.name(), p.bookings(), p.revenue()));
            return w.toBytes();
        }
        return render(doc -> {
            doc.add(new Paragraph(appName + " - Booking report", TITLE));
            doc.add(new Paragraph(r.from() + " to " + r.to(), BODY));
            doc.add(Chunk.NEWLINE);
            var t = r.totals();
            doc.add(table(List.of("Bookings", "Completed", "Cancelled", "No-shows", "Revenue", "Refunds", "Cancel %", "No-show %"),
                    List.of(List.of(t.bookings(), t.completed(), t.cancelled(), t.noShows(), t.revenue(), t.refunds(),
                            t.cancellationRate(), t.noShowRate()))));
            doc.add(new Paragraph("Peak hours", BOLD));
            doc.add(table(List.of("Hour", "Bookings"), r.byHour().stream()
                    .map(h -> List.<Object>of(String.format("%02d:00", h.hour()), h.bookings())).toList()));
            doc.add(new Paragraph("By weekday", BOLD));
            doc.add(table(List.of("Day", "Bookings"), r.byWeekday().stream().map(d -> List.<Object>of(d.day(), d.bookings())).toList()));
            doc.add(new Paragraph("Top providers", BOLD));
            doc.add(table(List.of("Provider", "Bookings", "Revenue"), r.topProviders().stream()
                    .map(p -> List.<Object>of(p.name(), p.bookings(), p.revenue())).toList()));
            doc.add(new Paragraph("Top services", BOLD));
            doc.add(table(List.of("Service", "Bookings", "Revenue"), r.topServices().stream()
                    .map(p -> List.<Object>of(p.name(), p.bookings(), p.revenue())).toList()));
            doc.add(new Paragraph("Daily", BOLD));
            doc.add(table(List.of("Date", "Bookings", "Cancellations", "Revenue"), r.byDay().stream()
                    .map(d -> List.<Object>of(d.date(), d.bookings(), d.cancellations(), d.revenue())).toList()));
        }, false);
    }

    // ------------------------------------------------------------------ invoice (FR-40)

    public byte[] invoice(Payment p) {
        if (p.getInvoiceNumber() == null) {
            throw ApiException.badRequest("An invoice is available once a payment has been received");
        }
        Appointment a = p.getAppointment();
        return render(doc -> {
            doc.add(new Paragraph(appName, TITLE));
            doc.add(new Paragraph("INVOICE " + p.getInvoiceNumber(), BOLD));
            doc.add(new Paragraph("Date: " + (p.getPaidAt() == null ? "" : p.getPaidAt().toLocalDate()), BODY));
            doc.add(Chunk.NEWLINE);
            doc.add(new Paragraph("Billed to: " + a.getCustomer().getName() + " <" + a.getCustomer().getEmail() + ">", BODY));
            doc.add(new Paragraph("Provider: " + a.getProvider().getBusinessName()
                    + (a.getProvider().getAddress() == null ? "" : ", " + a.getProvider().getAddress())
                    + (a.getProvider().getCity() == null ? "" : ", " + a.getProvider().getCity()), BODY));
            doc.add(new Paragraph("Booking: " + a.getBookingRef() + " - " + a.getDate() + " " + a.getStartTime()
                    + " (" + a.getTimezone() + ")", BODY));
            doc.add(Chunk.NEWLINE);
            doc.add(table(List.of("Description", "Amount (" + p.getCurrency() + ")"), List.of(
                    List.of(a.getService().getName() + (a.getStaff() == null ? "" : " with " + a.getStaff().getName()), money(a.getAmount())),
                    List.of("Discount" + (a.getCouponCode() == null ? "" : " (" + a.getCouponCode() + ")"), "-" + money(a.getDiscount())),
                    List.of("Total", money(a.getFinalAmount())),
                    List.of("Paid (" + p.getMethod() + ", " + p.getOption() + ")", money(p.getAmount())),
                    List.of("Refunded", money(p.getRefundAmount())),
                    List.of("Balance due at venue", money(p.getBalanceDue())))));
            doc.add(new Paragraph("Transaction: " + nz(p.getTransactionId()), CELL));
            doc.add(new Paragraph("Status: " + p.getStatus(), CELL));
        }, false);
    }

    // ------------------------------------------------------------------ helpers

    private static byte[] csv(List<String> headers, List<List<Object>> rows) {
        CsvWriter w = new CsvWriter();
        w.row(headers);
        rows.forEach(w::row);
        return w.toBytes();
    }

    private byte[] pdf(String title, List<String> headers, List<List<Object>> rows, boolean landscape) {
        return render(doc -> {
            doc.add(new Paragraph(appName + " - " + title, TITLE));
            doc.add(new Paragraph("Generated " + LocalDateTime.now().withNano(0).format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
                    + " - " + rows.size() + " rows", BODY));
            doc.add(Chunk.NEWLINE);
            doc.add(table(headers, rows));
        }, landscape);
    }

    private interface DocWriter {
        void write(Document doc) throws DocumentException;
    }

    private static byte[] render(DocWriter writer, boolean landscape) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(landscape ? PageSize.A4.rotate() : PageSize.A4, 24, 24, 24, 24);
        try {
            PdfWriter.getInstance(doc, out);
            doc.open();
            writer.write(doc);
        } catch (DocumentException e) {
            throw new IllegalStateException("PDF generation failed", e);
        } finally {
            doc.close();
        }
        return out.toByteArray();
    }

    private static PdfPTable table(List<String> headers, List<List<Object>> rows) {
        PdfPTable t = new PdfPTable(headers.size());
        t.setWidthPercentage(100);
        t.setSpacingBefore(4);
        t.setSpacingAfter(10);
        t.setHeaderRows(1);
        for (String h : headers) {
            PdfPCell c = new PdfPCell(new Phrase(h, HEAD));
            c.setBackgroundColor(new Color(79, 70, 229));
            c.setPadding(4);
            t.addCell(c);
        }
        for (List<Object> r : rows) {
            for (Object v : r) {
                PdfPCell c = new PdfPCell(new Phrase(v == null ? "" : v.toString(), CELL));
                c.setPadding(3);
                t.addCell(c);
            }
        }
        return t;
    }

    private static String money(double v) {
        return String.format("%.2f", BookingUtils.money(v));
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }
}
