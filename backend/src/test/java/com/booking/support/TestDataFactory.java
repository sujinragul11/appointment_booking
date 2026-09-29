package com.booking.support;

import com.booking.entity.*;
import com.booking.enums.DiscountType;
import com.booking.enums.ProviderStatus;
import com.booking.enums.UserRole;
import com.booking.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Builds test data directly through the repositories: users with verified e-mail, verified
 * providers with weekly hours, services with or without staff, blocks, coupons, categories.
 * Every user gets the password {@link #PASSWORD}.
 */
@TestComponent
public class TestDataFactory {

    public static final String PASSWORD = "Password1";

    private static final AtomicInteger SEQ = new AtomicInteger();

    @Autowired private UserRepository userRepository;
    @Autowired private ProviderRepository providerRepository;
    @Autowired private DomainServiceRepository serviceRepository;
    @Autowired private StaffRepository staffRepository;
    @Autowired private AvailabilityRepository availabilityRepository;
    @Autowired private BlockedDateRepository blockedDateRepository;
    @Autowired private CategoryRepository categoryRepository;
    @Autowired private CouponRepository couponRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private PlatformTransactionManager transactionManager;

    private volatile String passwordHash;

    public static String uniqueEmail(String prefix) {
        return prefix + "." + SEQ.incrementAndGet() + "@example.test";
    }

    public static String uniquePhone() {
        return "+9190" + String.format("%08d", SEQ.incrementAndGet());
    }

    private String passwordHash() {
        if (passwordHash == null) {
            passwordHash = passwordEncoder.encode(PASSWORD);
        }
        return passwordHash;
    }

    // ------------------------------------------------------------------ users

    public User customer() {
        return user("Casey Customer", uniqueEmail("customer"), UserRole.CUSTOMER, true, uniquePhone());
    }

    public User unverifiedCustomer() {
        return user("Uma Unverified", uniqueEmail("unverified"), UserRole.CUSTOMER, false, uniquePhone());
    }

    public User admin() {
        return user("Ada Admin", uniqueEmail("admin"), UserRole.ADMIN, true, null);
    }

    public User user(String name, String email, UserRole role, boolean verified, String phone) {
        return userRepository.save(User.builder()
                .name(name)
                .email(email.toLowerCase())
                .phone(phone)
                .password(passwordHash())
                .role(role)
                .verified(verified)
                .build());
    }

    // ------------------------------------------------------------------ providers

    /** A verified provider in UTC (no weekly hours yet). */
    public Provider provider() {
        return provider("Test Clinic " + SEQ.incrementAndGet(), "UTC", ProviderStatus.VERIFIED, p -> { });
    }

    public Provider provider(String businessName, String timezone) {
        return provider(businessName, timezone, ProviderStatus.VERIFIED, p -> { });
    }

    public Provider provider(String businessName, String timezone, ProviderStatus status, Consumer<Provider> customizer) {
        User owner = user("Owner of " + businessName, uniqueEmail("provider"), UserRole.PROVIDER, true, uniquePhone());
        Provider p = Provider.builder()
                .user(owner)
                .businessName(businessName)
                .timezone(timezone)
                .status(status)
                .city("Chennai")
                .address("1 Test Street")
                .build();
        customizer.accept(p);
        return providerRepository.save(p);
    }

    /** Adds the same provider-level window on all seven days. */
    public Provider openAllWeek(Provider p, LocalTime from, LocalTime to) {
        for (int dow = 1; dow <= 7; dow++) {
            weekly(p, null, dow, from, to);
        }
        return p;
    }

    public Availability weekly(Provider p, Staff staff, int dayOfWeek, LocalTime from, LocalTime to) {
        return availabilityRepository.save(Availability.builder()
                .provider(p).staff(staff).dayOfWeek(dayOfWeek).startTime(from).endTime(to).active(true).build());
    }

    // ------------------------------------------------------------------ services & staff

    public DomainService service(Provider p, String name, int durationMin, int bufferMin, double price) {
        return service(p, name, durationMin, bufferMin, price, s -> { });
    }

    public DomainService service(Provider p, String name, int durationMin, int bufferMin, double price,
                                 Consumer<DomainService> customizer) {
        DomainService s = DomainService.builder()
                .provider(p).name(name).description(name + " description")
                .durationMin(durationMin).bufferMin(bufferMin).price(price)
                .build();
        customizer.accept(s);
        return serviceRepository.save(s);
    }

    public Staff staff(Provider p, String name) {
        return staff(p, name, null);
    }

    public Staff staff(Provider p, String name, User login) {
        return staffRepository.save(Staff.builder().provider(p).name(name).designation("Specialist").user(login).build());
    }

    /** Links staff members to a service (owning side of the many-to-many). */
    public void assignStaff(DomainService service, Staff... staff) {
        inTransaction(() -> {
            DomainService s = serviceRepository.findById(service.getId()).orElseThrow();
            for (Staff st : staff) {
                s.getStaff().add(staffRepository.findById(st.getId()).orElseThrow());
            }
        });
    }

    // ------------------------------------------------------------------ calendar overrides

    public BlockedDate closeDay(Provider p, LocalDate date) {
        return blocked(p, null, date, null, null, false, "Holiday");
    }

    public BlockedDate blockTime(Provider p, LocalDate date, LocalTime from, LocalTime to) {
        return blocked(p, null, date, from, to, false, "Meeting");
    }

    public BlockedDate customHours(Provider p, LocalDate date, LocalTime from, LocalTime to) {
        return blocked(p, null, date, from, to, true, "Special hours");
    }

    public BlockedDate blocked(Provider p, Staff staff, LocalDate date, LocalTime from, LocalTime to,
                               boolean available, String reason) {
        return blockedDateRepository.save(BlockedDate.builder()
                .provider(p).staff(staff).date(date).startTime(from).endTime(to).available(available).reason(reason)
                .build());
    }

    // ------------------------------------------------------------------ catalogue extras

    public Category category(String name) {
        return categoryRepository.save(Category.builder()
                .name(name).slug(name.toLowerCase().replaceAll("[^a-z0-9]+", "-")).icon("*").description(name).build());
    }

    public Coupon coupon(String code, DiscountType type, double value, Consumer<Coupon> customizer) {
        Coupon c = Coupon.builder().code(code).discountType(type).value(value).build();
        customizer.accept(c);
        return couponRepository.save(c);
    }

    // ------------------------------------------------------------------ updates in a transaction

    public Provider updateProvider(Long id, Consumer<Provider> changes) {
        return inTransaction(() -> {
            Provider p = providerRepository.findById(id).orElseThrow();
            changes.accept(p);
            return p;
        });
    }

    public DomainService updateService(Long id, Consumer<DomainService> changes) {
        return inTransaction(() -> {
            DomainService s = serviceRepository.findById(id).orElseThrow();
            changes.accept(s);
            return s;
        });
    }

    public User updateUser(Long id, Consumer<User> changes) {
        return inTransaction(() -> {
            User u = userRepository.findById(id).orElseThrow();
            changes.accept(u);
            return u;
        });
    }

    public <T> T inTransaction(Supplier<T> work) {
        return new TransactionTemplate(transactionManager).execute(status -> work.get());
    }

    public void inTransaction(Runnable work) {
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> work.run());
    }
}
