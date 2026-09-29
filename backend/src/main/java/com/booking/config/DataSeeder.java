package com.booking.config;

import com.booking.booking.SlotEngine;
import com.booking.entity.*;
import com.booking.enums.*;
import com.booking.repository.*;
import com.booking.util.BookingUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.List;
import java.util.Set;

/**
 * Demo data for local development and demos. Enabled only with app.seed.demo-data=true
 * (the dev profile, or SEED_DEMO_DATA=true) and only on an empty database - never in production.
 */
@Slf4j
@Component
@Order(2)
@RequiredArgsConstructor
@ConditionalOnProperty(name = "app.seed.demo-data", havingValue = "true")
public class DataSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final ProviderRepository providerRepository;
    private final CategoryRepository categoryRepository;
    private final DomainServiceRepository serviceRepository;
    private final StaffRepository staffRepository;
    private final AvailabilityRepository availabilityRepository;
    private final BlockedDateRepository blockedDateRepository;
    private final AppointmentRepository appointmentRepository;
    private final PaymentRepository paymentRepository;
    private final ReviewRepository reviewRepository;
    private final CouponRepository couponRepository;
    private final NotificationRepository notificationRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(String... args) {
        if (userRepository.count() > 0) {
            log.info("Demo seed skipped - database is not empty");
            return;
        }
        log.info("Seeding demo data...");

        Category doctor = category("Doctor", "🩺", "General physicians and specialists");
        Category dentist = category("Dentist", "🦷", "Dental care and cosmetic dentistry");
        Category salon = category("Salon & Spa", "💇", "Hair, skin and wellness");
        Category consultant = category("Consultant", "💼", "Legal, financial and career advice");
        Category tutor = category("Tutor", "📚", "Academic tutoring and coaching");
        Category fitness = category("Fitness", "💪", "Personal training and yoga");
        Category derma = category("Dermatology", "🧴", "Skin, hair and laser clinics");
        Category physio = category("Physiotherapy", "🧘", "Rehab and sports therapy");

        user("Platform Admin", "admin@booking.com", "Admin@123", UserRole.ADMIN, null);
        User customer = user("Rajesh Kumar", "customer@booking.com", "Customer@123", UserRole.CUSTOMER, "+919876543210");
        User customer2 = user("Anita Desai", "anita@booking.com", "Customer@123", UserRole.CUSTOMER, "+919876500001");

        Provider dental = provider(user("Dr. Meera Nair", "provider@booking.com", "Provider@123", UserRole.PROVIDER, "+919812345670"),
                "Smile Dental Clinic", "Cosmetic & family dentistry", dentist,
                "City's most trusted dental clinic with painless treatments and modern equipment.",
                "Chennai", "Tamil Nadu", "India", "42, MG Road, T Nagar", 13.0418, 80.2341, "+919812345670", "Asia/Kolkata");
        Provider glow = provider(user("Ananya Shah", "salon@booking.com", "Salon@123", UserRole.PROVIDER, "+919900011122"),
                "Glow & Glam Salon", "Unisex salon & spa", salon, "Premium unisex salon & spa with certified stylists.",
                "Mumbai", "Maharashtra", "India", "15, Link Road, Andheri West", 19.1136, 72.8697, "+919900011122", "Asia/Kolkata");
        glow.setMaxBookingsPerSlot(3);
        Provider physioP = provider(user("Dr. Arjun Menon", "physio@booking.com", "Physio@123", UserRole.PROVIDER, "+919811122233"),
                "CareWell Physiotherapy", "Sports injury rehab", physio, "Sports injury rehab, physiotherapy and chiropractic care.",
                "Delhi", "Delhi", "India", "88, Sector 18, Noida", 28.5712, 77.3198, "+919811122233", "Asia/Kolkata");
        Provider tutorP = provider(user("Emma Watson", "tutor@booking.com", "Tutor@123", UserRole.PROVIDER, "+447700900456"),
                "Bright Minds Tutoring", "Maths & science tutor", tutor, "Online & offline tutoring for maths, science and languages.",
                "London", "England", "UK", "221 Baker Street, Marylebone", 51.5207, -0.1569, "+447700900456", "Europe/London");
        Provider skin = provider(user("Dr. Kavya Iyer", "skin@booking.com", "Skin@123", UserRole.PROVIDER, "+919822233344"),
                "Perfect Skin Clinic", "Dermatologist", derma, "Advanced dermatology, laser and aesthetic skin care.",
                "Bangalore", "Karnataka", "India", "5, 100 Feet Road, Indiranagar", 12.9716, 77.5946, "+919822233344", "Asia/Kolkata");
        Provider gym = provider(user("Chris Miller", "fitness@booking.com", "Fitness@123", UserRole.PROVIDER, "+19175551234"),
                "Nova Fitness Studio", "Strength & yoga coach", fitness, "Personal training, strength, yoga and nutrition coaching.",
                "New York", "NY", "USA", "10 W 18th St, Manhattan", 40.7396, -73.9933, "+19175551234", "America/New_York");
        Provider gp = provider(user("Dr. Sameer Khan", "doctor@booking.com", "Doctor@123", UserRole.PROVIDER, "+919833344455"),
                "HealthFirst Clinic", "General physician", doctor, "Family medicine, check-ups and tele-consultations.",
                "Hyderabad", "Telangana", "India", "7, Banjara Hills Road 12", 17.4126, 78.4482, "+919833344455", "Asia/Kolkata");
        Provider advisor = provider(user("Priya Menon", "consultant@booking.com", "Consult@123", UserRole.PROVIDER, "+919844455566"),
                "Menon Career Advisors", "Career & finance consultant", consultant, "Career counselling and personal finance planning.",
                "Kochi", "Kerala", "India", "3, Marine Drive", 9.9816, 76.2755, "+919844455566", "Asia/Kolkata");
        Provider pending = provider(user("Rahul Verma", "newclinic@booking.com", "Provider@123", UserRole.PROVIDER, "+919855566677"),
                "Verma Eye Care", "Ophthalmologist", doctor, "Eye check-ups and vision care.",
                "Pune", "Maharashtra", "India", "21, FC Road", 18.5204, 73.8567, "+919855566677", "Asia/Kolkata");
        pending.setStatus(ProviderStatus.PENDING);

        DomainService cleaning = service(dental, "Teeth Cleaning", 30, 10, 400, 0, ServiceMode.IN_PERSON, dentist, "Polishing, scaling and oral hygiene.");
        service(dental, "Root Canal Treatment", 60, 15, 3000, 30, ServiceMode.IN_PERSON, dentist, "Single-sitting painless root canal.");
        DomainService checkup = service(dental, "Dental Checkup", 20, 10, 300, 0, ServiceMode.IN_PERSON, dentist, "Complete oral examination & consultation.");
        service(dental, "Teeth Whitening", 45, 15, 2500, 20, ServiceMode.IN_PERSON, dentist, "Advanced laser whitening treatment.");

        DomainService haircut = service(glow, "Hair Cut & Styling", 45, 15, 500, 0, ServiceMode.IN_PERSON, salon, "Trendy haircuts by senior stylists.");
        service(glow, "Signature Facial", 60, 15, 1200, 0, ServiceMode.IN_PERSON, salon, "Hydrating & glowing skin facial.");
        service(glow, "Manicure + Pedicure", 60, 15, 799, 0, ServiceMode.IN_PERSON, salon, "Complete nail care spa combo.");

        service(physioP, "Physiotherapy Session", 45, 15, 800, 0, ServiceMode.IN_PERSON, physio, "Personalised rehab session.");
        service(physioP, "Sports Massage", 60, 15, 1000, 0, ServiceMode.IN_PERSON, physio, "Deep tissue recovery massage.");
        service(physioP, "Tele-Rehab Consultation", 30, 0, 500, 0, ServiceMode.ONLINE, physio, "Video consultation with exercise plan.");

        service(tutorP, "Maths Tutoring", 60, 0, 1500, 0, ServiceMode.BOTH, tutor, "One-on-one maths coaching, online or in person.");
        service(tutorP, "Science Tutoring", 60, 0, 1400, 0, ServiceMode.ONLINE, tutor, "Physics & chemistry foundation.");
        service(tutorP, "Exam Prep Bootcamp", 90, 15, 2500, 25, ServiceMode.IN_PERSON, tutor, "Intensive exam preparation.");

        service(skin, "Acne Treatment", 30, 10, 1200, 0, ServiceMode.IN_PERSON, derma, "Advanced acne & scar therapy.");
        service(skin, "Laser Hair Removal", 45, 15, 8000, 25, ServiceMode.IN_PERSON, derma, "Laser session on a selected area.");
        service(skin, "Skin Consultation (Video)", 20, 5, 600, 0, ServiceMode.ONLINE, derma, "Online dermatologist consultation.");

        service(gym, "Personal Training", 60, 15, 2500, 0, ServiceMode.IN_PERSON, fitness, "1-on-1 strength & conditioning.");
        service(gym, "Yoga Class", 60, 0, 800, 0, ServiceMode.BOTH, fitness, "Yoga & mobility, in the studio or online.");
        service(gym, "Nutrition Coaching", 45, 0, 1500, 0, ServiceMode.ONLINE, fitness, "Custom diet & nutrition plan.");

        service(gp, "General Consultation", 15, 5, 500, 0, ServiceMode.BOTH, doctor, "Consultation in clinic or by video.");
        service(gp, "Full Body Check-up", 60, 15, 2500, 20, ServiceMode.IN_PERSON, doctor, "Comprehensive health screening.");

        service(advisor, "Career Counselling", 45, 15, 1800, 0, ServiceMode.BOTH, consultant, "Plan your next career move.");
        service(advisor, "Financial Planning", 60, 15, 2500, 50, ServiceMode.ONLINE, consultant, "Budgeting, savings and investment plan.");

        service(pending, "Eye Examination", 30, 10, 700, 0, ServiceMode.IN_PERSON, doctor, "Complete vision check.");

        Staff priya = staff(dental, "Dr. Priya Sharma", "Dental Surgeon", "Specialist in cosmetic dentistry.", Set.of(cleaning, checkup));
        Staff arun = staff(dental, "Dr. Arun Prakash", "Endodontist", "Root canal specialist.", Set.of(cleaning, checkup));
        // Staff with their own login (manages own hours & appointments)
        User arunUser = user("Dr. Arun Prakash", "staff@booking.com", "Staff@123", UserRole.STAFF, "+919800000011");
        arun.setUser(arunUser);
        staff(glow, "Sneha", "Senior Stylist", "Hair expert.", Set.of());
        staff(glow, "Ritu", "Skin Therapist", "Facial & skincare specialist.", Set.of());

        LocalTime nine = LocalTime.of(9, 0), one = LocalTime.of(13, 0), two = LocalTime.of(14, 0), six = LocalTime.of(18, 0);
        for (Provider p : List.of(dental, physioP, skin, gp, advisor, pending)) {
            week(p, null, 1, 6, nine, one);
            week(p, null, 1, 6, two, six);
        }
        week(glow, null, 2, 7, LocalTime.of(10, 0), LocalTime.of(20, 0));
        week(tutorP, null, 1, 5, LocalTime.of(8, 0), LocalTime.of(20, 0));
        week(gym, null, 1, 7, LocalTime.of(6, 0), LocalTime.of(21, 0));
        // Dr. Arun works mornings only
        week(dental, arun, 1, 6, nine, one);

        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        blockedDateRepository.save(BlockedDate.builder().provider(dental).date(nextSunday(today).plusDays(7))
                .reason("Clinic maintenance").build());

        coupon("FIRST50", DiscountType.FLAT, 50, 0, 0, 500, 1);
        coupon("SAVE20", DiscountType.PERCENT, 20, 500, 200, 1000, 0);
        coupon("WELCOME100", DiscountType.FLAT, 100, 800, 100, 300, 1);

        // A completed visit with a paid invoice and an approved review
        Appointment past = appointment(customer, dental, cleaning, priya, today.minusDays(6), LocalTime.of(10, 30), AppointmentStatus.COMPLETED);
        past.setProviderNotes("Mild plaque removed. Brush twice daily and floss; next cleaning in 6 months.");
        paymentRepository.save(Payment.builder().appointment(past).amount(400).method(PaymentMethod.RAZORPAY)
                .option(PaymentOption.FULL).status(PaymentStatus.SUCCESS).orderId("order_demo_seed1")
                .transactionId("pay_demo_seed1").invoiceNumber(BookingUtils.generateInvoiceNumber(today.minusDays(6)))
                .paidAt(LocalDateTime.now().minusDays(7)).build());
        past.setPaymentStatus(PaymentStatus.SUCCESS);
        reviewRepository.save(Review.builder().appointment(past).customer(customer).provider(dental).rating(5)
                .comment("Great experience, gentle treatment!").status(ReviewStatus.APPROVED).build());
        dental.setRating(5.0);
        dental.setReviewCount(1);

        Appointment past2 = appointment(customer2, glow, haircut, null, today.minusDays(3), LocalTime.of(11, 0), AppointmentStatus.COMPLETED);
        paymentRepository.save(Payment.builder().appointment(past2).amount(500).method(PaymentMethod.PAY_AT_VENUE)
                .option(PaymentOption.PAY_AT_VENUE).status(PaymentStatus.SUCCESS).transactionId("venue_seed2")
                .invoiceNumber(BookingUtils.generateInvoiceNumber(today.minusDays(3))).paidAt(LocalDateTime.now().minusDays(3)).build());
        past2.setPaymentStatus(PaymentStatus.SUCCESS);
        reviewRepository.save(Review.builder().appointment(past2).customer(customer2).provider(glow).rating(4)
                .comment("Nice haircut, a bit of waiting time.").status(ReviewStatus.PENDING).build());

        // Upcoming bookings (pay at venue)
        LocalDate next = nextWorkingDay(today.plusDays(2));
        Appointment upcoming = appointment(customer, dental, checkup, arun, next, LocalTime.of(11, 0), AppointmentStatus.CONFIRMED);
        paymentRepository.save(Payment.builder().appointment(upcoming).amount(0).balanceDue(300).method(PaymentMethod.PAY_AT_VENUE)
                .option(PaymentOption.PAY_AT_VENUE).status(PaymentStatus.PENDING).build());
        Appointment cancelled = appointment(customer, glow, haircut, null, next.plusDays(1), LocalTime.of(15, 0), AppointmentStatus.CANCELLED);
        cancelled.setCancelledBy(ActorType.CUSTOMER);
        cancelled.setCancelReason("Change of plans");
        cancelled.setCancelledAt(Instant.now().minus(Duration.ofDays(1)));
        paymentRepository.save(Payment.builder().appointment(cancelled).amount(0).method(PaymentMethod.PAY_AT_VENUE)
                .option(PaymentOption.PAY_AT_VENUE).status(PaymentStatus.FAILED).build());
        cancelled.setPaymentStatus(PaymentStatus.FAILED);

        notificationRepository.save(Notification.builder().user(customer).title("Welcome to Sloto")
                .message("Your account is ready - find a provider and book in a few clicks.").type(NotifType.INFO).link("/providers").build());

        log.info("Demo data ready: users={} providers={} services={} (password for all demo accounts is listed in the README)",
                userRepository.count(), providerRepository.count(), serviceRepository.count());
    }

    private static LocalDate nextSunday(LocalDate d) {
        return d.plusDays(7 - d.getDayOfWeek().getValue());
    }

    private static LocalDate nextWorkingDay(LocalDate d) {
        return d.getDayOfWeek() == DayOfWeek.SUNDAY ? d.plusDays(1) : d;
    }

    private Category category(String name, String icon, String desc) {
        return categoryRepository.save(Category.builder().name(name).icon(icon).description(desc)
                .slug(name.toLowerCase().replaceAll("[^a-z0-9]+", "-")).build());
    }

    private User user(String name, String email, String rawPassword, UserRole role, String phone) {
        return userRepository.save(User.builder().name(name).email(email).phone(phone)
                .password(passwordEncoder.encode(rawPassword)).role(role).verified(true)
                .phoneVerified(phone != null).build());
    }

    private Provider provider(User owner, String name, String specialty, Category cat, String desc, String city, String state,
                              String country, String address, double lat, double lng, String phone, String tz) {
        return providerRepository.save(Provider.builder().user(owner).businessName(name).specialty(specialty).category(cat)
                .description(desc).city(city).state(state).country(country).address(address).latitude(lat).longitude(lng)
                .phone(phone).timezone(tz).status(ProviderStatus.VERIFIED).build());
    }

    private DomainService service(Provider p, String name, int dur, int buffer, double price, int deposit, ServiceMode mode,
                                  Category cat, String desc) {
        DomainService s = serviceRepository.save(DomainService.builder().provider(p).name(name).durationMin(dur).bufferMin(buffer)
                .price(price).depositPercent(deposit).mode(mode).category(cat).description(desc).build());
        p.getServices().add(s);
        return s;
    }

    private Staff staff(Provider p, String name, String designation, String bio, Set<DomainService> services) {
        Staff s = staffRepository.save(Staff.builder().provider(p).name(name).designation(designation).bio(bio).build());
        services.forEach(svc -> { svc.getStaff().add(s); s.getServices().add(svc); });
        p.getStaff().add(s);
        return s;
    }

    private void week(Provider p, Staff staff, int fromDow, int toDow, LocalTime start, LocalTime end) {
        for (int d = fromDow; d <= toDow; d++) {
            availabilityRepository.save(Availability.builder().provider(p).staff(staff).dayOfWeek(d)
                    .startTime(start).endTime(end).build());
        }
    }

    private void coupon(String code, DiscountType type, double value, double minOrder, double maxDiscount, int limit, int perUser) {
        couponRepository.save(Coupon.builder().code(code).discountType(type).value(value).minOrder(minOrder)
                .maxDiscount(maxDiscount).usageLimit(limit).perUserLimit(perUser)
                .validFrom(LocalDate.now().minusDays(1)).validTo(LocalDate.now().plusDays(180)).build());
    }

    private Appointment appointment(User customer, Provider p, DomainService s, Staff staff, LocalDate date, LocalTime start,
                                    AppointmentStatus status) {
        ZoneId zone = p.zone();
        Instant startAt = date.atTime(start).atZone(zone).toInstant();
        Instant endAt = startAt.plus(Duration.ofMinutes(s.getDurationMin()));
        return appointmentRepository.save(Appointment.builder()
                .bookingRef(BookingUtils.generateBookingRef(date))
                .customer(customer).provider(p).service(s).staff(staff)
                .date(date).startTime(start).endTime(start.plusMinutes(s.getDurationMin()))
                .startAt(startAt).endAt(endAt).busyUntil(endAt.plus(Duration.ofMinutes(s.getBufferMin())))
                .timezone(p.getTimezone())
                .slotKey(status.isActive() ? SlotEngine.slotKey(p.getId(), staff == null ? null : staff.getId(), startAt, 1) : null)
                .status(status).mode(s.getMode() == ServiceMode.ONLINE ? ServiceMode.ONLINE : ServiceMode.IN_PERSON)
                .amount(s.getPrice()).finalAmount(s.getPrice())
                .build());
    }
}
