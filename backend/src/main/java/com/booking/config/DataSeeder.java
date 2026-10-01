package com.booking.config;

import com.booking.entity.*;
import com.booking.enums.*;
import com.booking.repository.*;
import com.booking.util.BookingUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;

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
    private final AppointmentRepository appointmentRepository;
    private final PaymentRepository paymentRepository;
    private final ReviewRepository reviewRepository;
    private final CouponRepository couponRepository;
    private final NotificationRepository notificationRepository;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.admin.email:admin@booking.com}")
    private String adminEmail;

    @Value("${app.admin.password:Admin@123}")
    private String adminPassword;

    @Override
    @Transactional
    public void run(String... args) {
        if (userRepository.count() > 0) {
            seedCoupons();
            log.info("Seeder skipped — data already present");
            return;
        }

        log.info("Seeding demo data...");

        Category doctor = category("Doctor", "🏥");
        Category dentist = category("Dentist", "🦷");
        Category salon = category("Salon & Spa", "💇");
        Category consultant = category("Consultant", "💼");
        Category tutor = category("Tutor", "📚");
        Category fitness = category("Fitness", "💪");
        Category derma = category("Dermatology", "🧴");
        Category physio = category("Physiotherapy", "🧘");

        User admin = user("Platform Admin", "admin@booking.com", "Admin@123", UserRole.ADMIN, null);
        User customer = user("Rajesh Kumar", "customer@booking.com", "Customer@123", UserRole.CUSTOMER, "+919876543210");
        User providerUser = user("Dr. Meera Nair", "provider@booking.com", "Provider@123", UserRole.PROVIDER, "+919812345670");

        Provider smileDental = provider(providerUser, "Smile Dental Clinic", dentist,
                "City's most trusted dental clinic with painless treatments and modern equipment.",
                "Chennai", "Tamil Nadu", "India", "42, MG Road, T Nagar", 13.0418, 80.2341,
                "+919812345670", "smiledental.in");

        Provider glowSalon = provider(user("Ananya Shah", "salon@booking.com", "Salon@123", UserRole.PROVIDER, "+919900011122"),
                "Glow & Glam Salon", salon, "Premium unisex salon & spa with certified stylists.",
                "Mumbai", "Maharashtra", "India", "15, Link Road, Andheri West", 19.1136, 72.8697,
                "+919900011122", "glowglam.in");

        Provider carePhysio = provider(user("Dr. Arjun Menon", "physio@booking.com", "Physio@123", UserRole.PROVIDER, "+919811122233"),
                "CareWell Physiotherapy", physio, "Sports injury rehab, physiotherapy and chiropractic care.",
                "Delhi", "Delhi", "India", "88, Sector 18, Noida", 28.5712, 77.3198,
                "+919811122233", "carewell.in");

        Provider brightTutor = provider(user("Emma Watson", "tutor@booking.com", "Tutor@123", UserRole.PROVIDER, "+447700900456"),
                "Bright Minds Tutoring", tutor, "Online & offline tutoring for math, science and languages.",
                "London", "England", "UK", "221 Baker Street, Marylebone", 51.5207, -0.1569,
                "+447700900456", "brightminds.co.uk");

        Provider perfectSkin = provider(user("Dr. Kavya Iyer", "skin@booking.com", "Skin@123", UserRole.PROVIDER, "+919822233344"),
                "Perfect Skin Clinic", derma, "Advanced dermatology, laser and aesthetic skin care.",
                "Bangalore", "Karnataka", "India", "5, 100 Feet Road, Indiranagar", 12.9716, 77.5946,
                "+919822233344", "perfectskin.in");

        Provider novaFitness = provider(user("Chris Miller", "fitness@booking.com", "Fitness@123", UserRole.PROVIDER, "+19175551234"),
                "Nova Fitness Studio", fitness, "Personal training, strength, yoga and nutrition coaching.",
                "New York", "NY", "USA", "10 W 18th St, Manhattan", 40.7396, -73.9933,
                "+19175551234", "novafit.nyc");

        seedService(smileDental, "Teeth Cleaning", 30, 5, 400, dentist, "Polishing, scaling and oral hygiene.");
        seedService(smileDental, "Root Canal Treatment", 45, 10, 3000, dentist, "Single-sitting painless root canal.");
        seedService(smileDental, "Dental Checkup", 20, 5, 300, dentist, "Complete oral examination & consultation.");
        seedService(smileDental, "Teeth Whitening", 30, 10, 2500, dentist, "Advanced laser whitening treatment.");

        seedService(glowSalon, "Hair Cut & Styling", 45, 10, 500, salon, "Trendy haircuts by senior stylists.");
        seedService(glowSalon, "Signature Facial", 60, 10, 1200, salon, "Hydrating & glowing skin facial.");
        seedService(glowSalon, "Manicure + Pedicure", 60, 10, 799, salon, "Complete nail care spa combo.");

        seedService(carePhysio, "Physiotherapy Session", 45, 10, 800, physio, "Personalised rehab session.");
        seedService(carePhysio, "Sports Massage", 60, 10, 1000, physio, "Deep tissue recovery massage.");
        seedService(carePhysio, "Chiropractic Care", 45, 15, 1200, physio, "Spinal alignment & adjustment.");

        seedService(brightTutor, "Math Tutoring (Online)", 60, 5, 1500, tutor, "One-on-one online math coaching.");
        seedService(brightTutor, "Science Tutoring", 60, 5, 1400, tutor, "Physics & Chemistry foundation.");
        seedService(brightTutor, "Exam Prep Bootcamp", 90, 10, 2500, tutor, "Intensive exam preparation.");

        seedService(perfectSkin, "Acne Treatment", 30, 5, 1200, derma, "Advanced acne & scar therapy.");
        seedService(perfectSkin, "Laser Hair Removal", 45, 10, 8000, derma, "PDL laser session on selected area.");
        seedService(perfectSkin, "Chemical Peel", 30, 10, 2500, derma, "Deep exfoliation & glow boost.");

        seedService(novaFitness, "Personal Training", 60, 10, 2500, fitness, "1-on-1 strength & conditioning.");
        seedService(novaFitness, "Yoga Class", 60, 0, 800, fitness, "Group yoga & mobility.");
        seedService(novaFitness, "Nutrition Coaching", 45, 5, 1500, fitness, "Custom diet & nutrition plan.");

        Staff priya = seedStaff(smileDental, "Dr. Priya Sharma", "Dental Surgeon", "Specialist in cosmetic dentistry.");
        Staff arun = seedStaff(smileDental, "Dr. Arun Prakash", "Endodontist", "Root canal specialist.");
        Staff meera = seedStaff(smileDental, "Dr. Meera Nair", "Chief Dentist", "Founder & lead dentist.");
        seedStaff(glowSalon, "Sneha", "Senior Stylist", "Hair expert.");
        seedStaff(glowSalon, "Ritu", "Skin Therapist", "Facial & skincare specialist.");
        seedStaff(carePhysio, "Dr. Arjun Menon", "Physiotherapist", "Founder, sports rehab.");
        seedStaff(brightTutor, "Emma Watson", "Lead Tutor", "Math & physics.");
        seedStaff(perfectSkin, "Dr. Kavya Iyer", "Dermatologist", "Laser & aesthetic expert.");
        seedStaff(novaFitness, "Chris Miller", "Personal Trainer", "Certified strength coach.");

        dailyAvailability(smileDental, 1, 6, LocalTime.of(10, 0), LocalTime.of(19, 0));
        dailyAvailability(glowSalon, 2, 7, LocalTime.of(9, 0), LocalTime.of(20, 0));
        dailyAvailability(carePhysio, 1, 6, LocalTime.of(8, 0), LocalTime.of(18, 0));
        dailyAvailability(brightTutor, 1, 7, LocalTime.of(8, 0), LocalTime.of(20, 0));
        dailyAvailability(perfectSkin, 1, 7, LocalTime.of(10, 0), LocalTime.of(20, 0));
        dailyAvailability(novaFitness, 1, 7, LocalTime.of(6, 0), LocalTime.of(21, 0));

        notification(customer, "Welcome to Booking", "Your account is ready — book providers anywhere in the world.", NotifType.INFO);
        notification(providerUser, "Welcome Provider", "Your clinic profile is ready. You are verified as a demo provider.", NotifType.ADMIN);

        seedAppointmentWithPaymentAndReview(customer, smileDental, smileDental.getServices().iterator().next(),
                priya, LocalDate.now().minusDays(6), LocalTime.of(10, 30), LocalTime.of(11, 0),
                AppointmentStatus.COMPLETED, "Great experience, gentle treatment!");

        seedSimpleAppointment(customer, smileDental,
                smileDental.getServices().stream().filter(s -> s.getName().equals("Dental Checkup")).findFirst().orElseThrow(),
                meera, LocalDate.now().plusDays(1), LocalTime.of(11, 0), LocalTime.of(11, 20),
                AppointmentStatus.CONFIRMED);

        seedSimpleAppointment(customer, glowSalon,
                glowSalon.getServices().iterator().next(), null,
                LocalDate.now().plusDays(3), LocalTime.of(15, 0), LocalTime.of(15, 45),
                AppointmentStatus.PENDING);

        seedCoupons();

        log.info("Seeding complete ✅  users={} providers={} categories={}",
                userRepository.count(), providerRepository.count(), categoryRepository.count());
    }

    private void seedCoupons() {
        if (!couponRepository.findByCode("FIRST50").isPresent()) {
            coupon(Coupon.builder().code("FIRST50").discountType(DiscountType.FLAT).value(50)
                    .minOrder(0).maxDiscount(0).usageLimit(500).active(true).build());
            coupon(Coupon.builder().code("SAVE20").discountType(DiscountType.PERCENT).value(20)
                    .minOrder(500).maxDiscount(200).validFrom(LocalDate.now().minusDays(1))
                    .validTo(LocalDate.now().plusDays(90)).usageLimit(1000).active(true).build());
            coupon(Coupon.builder().code("WELCOME100").discountType(DiscountType.FLAT).value(100)
                    .minOrder(800).maxDiscount(100).usageLimit(300).active(true).build());
        }
    }

    private void coupon(Coupon c) {
        couponRepository.save(c);
    }

    private Category category(String name, String icon) {
        return categoryRepository.save(Category.builder()
                .name(name).icon(icon).slug(name.toLowerCase().replace(" ", "-")).build());
    }

    private User user(String name, String email, String rawPassword, UserRole role, String phone) {
        User u = User.builder()
                .name(name).email(email).phone(phone)
                .password(passwordEncoder.encode(rawPassword))
                .role(role).verified(true).emailVerified(true).active(true).build();
        return userRepository.save(u);
    }

    private Provider provider(User user, String businessName, Category cat, String desc,
                              String city, String state, String country, String address,
                              Double lat, Double lng, String phone, String website) {
        Provider p = Provider.builder()
                .user(user).businessName(businessName).category(cat).description(desc)
                .city(city).state(state).country(country).address(address)
                .latitude(lat).longitude(lng).phone(phone).website(website)
                .status(ProviderStatus.VERIFIED)
                .maxAdvanceBookingDays(30)
                .cancellationPolicy("Free cancellation up to 4 hours before the appointment.")
                .rating(4.8).reviewCount(0)
                .build();
        return providerRepository.save(p);
    }

    private void seedService(Provider provider, String name, int dur, int buffer, double price,
                             Category cat, String desc) {
        DomainService svc = serviceRepository.save(DomainService.builder()
                .provider(provider).name(name).durationMin(dur).bufferMin(buffer).price(price)
                .category(cat).description(desc).active(true).build());
        provider.getServices().add(svc);
    }

    private Staff seedStaff(Provider provider, String name, String designation, String bio) {
        Staff s = staffRepository.save(Staff.builder()
                .provider(provider).name(name).designation(designation).bio(bio).active(true).build());
        provider.getStaff().add(s);
        return s;
    }

    private void dailyAvailability(Provider p, int fromDow, int toDow, LocalTime start, LocalTime end) {
        for (int d = fromDow; d <= toDow; d++) {
            Availability a = availabilityRepository.save(Availability.builder()
                    .provider(p).dayOfWeek(d).startTime(start).endTime(end).active(true).build());
            p.getAvailability().add(a);
        }
    }

    private void notification(User user, String title, String message, NotifType type) {
        notificationRepository.save(Notification.builder()
                .user(user).title(title).message(message).type(type).build());
    }

    private void seedAppointmentWithPaymentAndReview(User customer, Provider provider, DomainService service,
                                                     Staff staff, LocalDate date, LocalTime start, LocalTime end,
                                                     AppointmentStatus status, String reviewComment) {
        Appointment a = appointment(date, customer, provider, service, staff, start, end, status, 0, 400);
        paymentRepository.save(Payment.builder().appointment(a).amount(400)
                .method(PaymentMethod.RAZORPAY).status(PaymentStatus.SUCCESS)
                .orderId(BookingUtils.generateOrderId()).txnId(BookingUtils.generateTxnId())
                .paidAt(LocalDateTime.now().minusDays(6)).build());
        reviewRepository.save(Review.builder().appointment(a).customer(customer).provider(provider)
                .rating(5).comment(reviewComment).build());
        provider.setRating(4.9);
        provider.setReviewCount(provider.getReviewCount() + 1);
        providerRepository.save(provider);
    }

    private void seedSimpleAppointment(User customer, Provider provider, DomainService service,
                                       Staff staff, LocalDate date, LocalTime start, LocalTime end,
                                       AppointmentStatus status) {
        appointment(date, customer, provider, service, staff, start, end, status,
                status == AppointmentStatus.CONFIRMED ? 0 : 0, service.getPrice());
        if (status != AppointmentStatus.PENDING) {
            appointmentRepository.findAll().stream()
                    .filter(x -> x.getDate().equals(date) && x.getService().equals(service))
                    .findFirst().ifPresent(a -> paymentRepository.save(Payment.builder()
                            .appointment(a).amount(service.getPrice())
                            .method(PaymentMethod.PAY_AT_VENUE).status(PaymentStatus.SUCCESS)
                            .txnId(BookingUtils.generateTxnId()).paidAt(LocalDateTime.now()).build()));
        }
    }

    private Appointment appointment(LocalDate date, User customer, Provider provider, DomainService service,
                                    Staff staff, LocalTime start, LocalTime end, AppointmentStatus status,
                                    double discount, double amount) {
        Appointment a = Appointment.builder()
                .bookingRef(BookingUtils.generateBookingRef())
                .customer(customer).provider(provider).service(service).staff(staff)
                .date(date).startTime(start).endTime(end)
                .status(status).amount(amount).discount(discount)
                .finalAmount(amount - discount)
                .build();
        return appointmentRepository.save(a);
    }
}
