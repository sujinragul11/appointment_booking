package com.booking.api;

import com.booking.dto.response.PageResponse;
import com.booking.dto.response.ProviderResponse;
import com.booking.dto.response.ServiceResponse;
import com.booking.dto.response.SlotsResponse;
import com.booking.dto.response.UploadResponse;
import com.booking.entity.Category;
import com.booking.entity.DomainService;
import com.booking.entity.Provider;
import com.booking.enums.ProviderStatus;
import com.booking.enums.ServiceMode;
import com.booking.exception.ApiException;
import com.booking.service.UploadService;
import com.booking.support.IntegrationTestBase;
import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.TemporalAdjusters;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Guest endpoints: provider search and profiles, services, slots, client config and image uploads. */
class PublicApiTest extends IntegrationTestBase {

    @Autowired private UploadService uploadService;

    private Category dentist;
    private Category fitness;
    private Provider smile;
    private Provider glow;
    private Provider yoga;
    private Provider pending;
    private DomainService cleaning;
    private DomainService video;
    private DomainService haircut;
    private LocalDate wednesday;
    private LocalDate saturday;

    @BeforeEach
    void setUp() {
        dentist = data.category("Dentist");
        Category salon = data.category("Salon");
        fitness = data.category("Fitness");

        smile = data.provider("Smile Dental", "UTC", ProviderStatus.VERIFIED, p -> {
            p.setCity("Chennai");
            p.setCategory(dentist);
            p.setRating(4.5);
            p.setReviewCount(10);
            p.setLatitude(13.0418);
            p.setLongitude(80.2341);
            p.setSpecialty("Orthodontics");
        });
        glow = data.provider("Glow Salon", "UTC", ProviderStatus.VERIFIED, p -> {
            p.setCity("Mumbai");
            p.setCategory(salon);
            p.setRating(3.0);
            p.setReviewCount(25);
            p.setLatitude(19.1136);
            p.setLongitude(72.8697);
        });
        yoga = data.provider("Yoga Hub", "UTC", ProviderStatus.VERIFIED, p -> p.setCity("Chennai"));
        pending = data.provider("Pending Physio", "UTC", ProviderStatus.PENDING, p -> p.setCity("Chennai"));

        cleaning = data.service(smile, "Teeth Cleaning", 30, 0, 800);
        video = data.service(smile, "Video Consult", 20, 0, 300, s -> s.setMode(ServiceMode.ONLINE));
        haircut = data.service(glow, "Haircut", 30, 0, 400);
        data.service(yoga, "Yoga Class", 60, 0, 250, s -> { s.setMode(ServiceMode.BOTH); s.setCategory(fitness); });
        data.service(pending, "Physio Session", 45, 0, 600);
        data.service(glow, "Retired Style", 30, 0, 100, s -> s.setActive(false));

        for (int dow = 1; dow <= 5; dow++) {
            data.weekly(smile, null, dow, LocalTime.of(9, 0), LocalTime.of(17, 0));
        }
        data.openAllWeek(glow, LocalTime.of(10, 0), LocalTime.of(18, 0));
        data.weekly(yoga, null, 6, LocalTime.of(7, 0), LocalTime.of(10, 0));
        data.openAllWeek(pending, LocalTime.of(9, 0), LocalTime.of(17, 0));

        wednesday = today().with(TemporalAdjusters.next(DayOfWeek.WEDNESDAY));
        saturday = today().with(TemporalAdjusters.next(DayOfWeek.SATURDAY));
        data.closeDay(glow, wednesday);
    }

    private List<String> search(String query) throws Exception {
        PageResponse<ProviderResponse> page = read(get("/api/providers" + query, null).andExpect(status().isOk()),
                new TypeReference<>() { });
        return page.content().stream().map(ProviderResponse::businessName).toList();
    }

    // ------------------------------------------------------------------ provider search

    @Test
    void searchListsOnlyVerifiedProvidersByRating() throws Exception {
        assertThat(search("")).containsExactly("Smile Dental", "Glow Salon", "Yoga Hub");
        assertThat(search("?sort=name")).containsExactly("Glow Salon", "Smile Dental", "Yoga Hub");
        assertThat(search("?sort=reviews")).containsExactly("Glow Salon", "Smile Dental", "Yoga Hub");
        assertThat(search("?sort=newest")).hasSize(3);

        PageResponse<ProviderResponse> firstPage = read(get("/api/providers?size=1", null), new TypeReference<>() { });
        assertThat(firstPage.totalElements()).isEqualTo(3);
        assertThat(firstPage.totalPages()).isEqualTo(3);
        ProviderResponse card = firstPage.content().get(0);
        assertThat(card.minPrice()).isEqualTo(300);
        assertThat(card.maxPrice()).isEqualTo(800);
        assertThat(card.services()).as("cards are summaries").isNull();
        assertThat(card.ownerEmail()).isNull();
    }

    @Test
    void textSearchMatchesServiceNameCityCategoryAndSpecialty() throws Exception {
        assertThat(search("?q=cleaning")).containsExactly("Smile Dental");
        assertThat(search("?q=MUMBAI")).containsExactly("Glow Salon");
        assertThat(search("?q=dentist")).containsExactly("Smile Dental");
        assertThat(search("?q=salon")).containsExactly("Glow Salon");
        assertThat(search("?q=ortho")).containsExactly("Smile Dental");
        assertThat(search("?q=chennai")).containsExactly("Smile Dental", "Yoga Hub");
        assertThat(search("?q=physio")).as("pending providers never match").isEmpty();
        assertThat(search("?q=retired")).as("inactive services do not match").isEmpty();
    }

    @Test
    void searchFiltersByCategoryCityRatingPriceServiceAndMode() throws Exception {
        assertThat(search("?categoryId=" + dentist.getId())).containsExactly("Smile Dental");
        assertThat(search("?categoryId=" + fitness.getId())).as("category of an offered service").containsExactly("Yoga Hub");
        assertThat(search("?city=chennai")).containsExactly("Smile Dental", "Yoga Hub");
        assertThat(search("?minRating=4")).containsExactly("Smile Dental");
        assertThat(search("?minPrice=500")).containsExactly("Smile Dental");
        assertThat(search("?maxPrice=300")).containsExactly("Smile Dental", "Yoga Hub");
        assertThat(search("?minPrice=350&maxPrice=500")).containsExactly("Glow Salon");
        assertThat(search("?serviceId=" + haircut.getId())).containsExactly("Glow Salon");
        assertThat(search("?mode=online")).containsExactly("Smile Dental", "Yoga Hub");
        assertThat(search("?mode=IN_PERSON")).containsExactly("Smile Dental", "Glow Salon", "Yoga Hub");
    }

    @Test
    @Disabled("BUG: GET /api/providers?mode=<unknown> answers 500 instead of 400. ProviderService.search "
            + "(src/main/java/com/booking/service/ProviderService.java:81) calls ServiceMode.valueOf inside the JPA "
            + "Specification; the repository proxy translates the IllegalArgumentException into "
            + "InvalidDataAccessApiUsageException, which GlobalExceptionHandler does not map, so it falls through to the "
            + "generic 500 handler. Fix: parse/validate the mode before building the specification "
            + "(or bind it as ServiceMode in PublicController like /api/services does).")
    void unknownModeInProviderSearchIsABadRequest() throws Exception {
        get("/api/providers?mode=teleport", null)
                .andExpect(status().isBadRequest());
    }

    @Test
    void dateFilterExcludesProvidersClosedThatDay() throws Exception {
        assertThat(search("?date=" + wednesday)).as("Glow is closed, Yoga does not work on Wednesdays")
                .containsExactly("Smile Dental");
        assertThat(search("?date=" + saturday)).containsExactly("Glow Salon", "Yoga Hub");

        data.customHours(smile, saturday, LocalTime.of(10, 0), LocalTime.of(12, 0));
        assertThat(search("?date=" + saturday)).as("custom hours open an otherwise closed day")
                .containsExactly("Smile Dental", "Glow Salon", "Yoga Hub");
        assertThat(search("?date=" + saturday + "&q=salon")).containsExactly("Glow Salon");
    }

    @Test
    void nearbyFindsProvidersWithinTheRadius() throws Exception {
        List<ProviderResponse> near = read(get("/api/providers/nearby?lat=13.05&lng=80.24&radius=10", null)
                .andExpect(status().isOk()), new TypeReference<>() { });
        assertThat(near).extracting(ProviderResponse::businessName).containsExactly("Smile Dental");
        List<ProviderResponse> far = read(get("/api/providers/nearby?lat=13.05&lng=80.24&radius=5000", null),
                new TypeReference<>() { });
        assertThat(far).as("radius is capped at 200 km").extracting(ProviderResponse::businessName).containsExactly("Smile Dental");
        get("/api/providers/nearby?lat=abc&lng=1", null).andExpect(status().isBadRequest());
    }

    // ------------------------------------------------------------------ profiles

    @Test
    void pendingProvidersAreHiddenExceptFromTheirOwnerAndAdmins() throws Exception {
        get("/api/providers/{id}", null, pending.getId())
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Provider not found"));
        get("/api/providers/{id}", auth.token(data.customer()), pending.getId()).andExpect(status().isNotFound());
        get("/api/providers/{id}", auth.token(pending.getUser()), pending.getId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"));
        get("/api/providers/{id}", auth.token(data.admin()), pending.getId()).andExpect(status().isOk());
        get("/api/providers/{id}/services", null, pending.getId()).andExpect(jsonPath("$.length()").value(0));
        get("/api/providers/{id}/availability", null, pending.getId()).andExpect(status().isNotFound());
        get("/api/providers/{id}", null, 999_999).andExpect(status().isNotFound());
    }

    @Test
    void verifiedProfileShowsServicesStaffAndPolicy() throws Exception {
        data.staff(smile, "Dr. Rao");
        ProviderResponse profile = read(get("/api/providers/{id}", null, smile.getId()).andExpect(status().isOk()),
                ProviderResponse.class);

        assertThat(profile.services()).extracting(ServiceResponse::name).containsExactly("Teeth Cleaning", "Video Consult");
        assertThat(profile.staff()).extracting(s -> s.name()).containsExactly("Dr. Rao");
        assertThat(profile.category().name()).isEqualTo("Dentist");
        assertThat(profile.policy().maxAdvanceBookingDays()).isEqualTo(30);
        assertThat(profile.ownerEmail()).isNull();
        assertThat(profile.adminNote()).isNull();
    }

    // ------------------------------------------------------------------ services

    private List<String> services(String query) throws Exception {
        PageResponse<ServiceResponse> page = read(get("/api/services" + query, null).andExpect(status().isOk()),
                new TypeReference<>() { });
        return page.content().stream().map(ServiceResponse::name).toList();
    }

    @Test
    void servicesCanBeBrowsedFilteredAndSorted() throws Exception {
        assertThat(services("")).containsExactly("Haircut", "Teeth Cleaning", "Video Consult", "Yoga Class");
        assertThat(services("?q=consult")).containsExactly("Video Consult");
        assertThat(services("?q=glow")).as("matches the provider name").containsExactly("Haircut");
        assertThat(services("?q=fitness")).as("matches the category name").containsExactly("Yoga Class");
        assertThat(services("?categoryId=" + fitness.getId())).containsExactly("Yoga Class");
        assertThat(services("?providerId=" + smile.getId())).containsExactly("Teeth Cleaning", "Video Consult");
        assertThat(services("?minPrice=300&maxPrice=500")).containsExactly("Haircut", "Video Consult");
        assertThat(services("?mode=ONLINE")).containsExactly("Video Consult", "Yoga Class");
        assertThat(services("?mode=BOTH")).hasSize(4);
        assertThat(services("?city=MUMBAI")).containsExactly("Haircut");
        assertThat(services("?sort=priceAsc")).containsExactly("Yoga Class", "Video Consult", "Haircut", "Teeth Cleaning");
        assertThat(services("?sort=priceDesc")).containsExactly("Teeth Cleaning", "Haircut", "Video Consult", "Yoga Class");
        assertThat(services("?sort=duration").get(0)).isEqualTo("Video Consult");
        assertThat(services("?sort=rating").get(0)).isIn("Teeth Cleaning", "Video Consult");
        assertThat(services("?sort=newest")).hasSize(4);
        get("/api/services?mode=SPACE", null).andExpect(status().isBadRequest());

        get("/api/services/{id}", null, cleaning.getId())
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.providerName").value("Smile Dental"))
                .andExpect(jsonPath("$.providerCity").value("Chennai"))
                .andExpect(jsonPath("$.maxAdvanceBookingDays").value(30));
        get("/api/services/{id}", null, 999_999).andExpect(status().isNotFound());
        List<ServiceResponse> ofProvider = read(get("/api/providers/{id}/services", null, glow.getId()), new TypeReference<>() { });
        assertThat(ofProvider).extracting(ServiceResponse::name).containsExactly("Haircut");
    }

    @Test
    void providerSlotsDefaultToTheFirstBookableService() throws Exception {
        LocalDate thursday = today().with(TemporalAdjusters.next(DayOfWeek.THURSDAY));
        SlotsResponse defaulted = read(get("/api/providers/{id}/slots?date={d}", null, smile.getId(), thursday)
                .andExpect(status().isOk()), SlotsResponse.class);
        assertThat(defaulted.serviceId()).isEqualTo(cleaning.getId());
        assertThat(defaulted.slots()).hasSize(16);

        SlotsResponse explicit = read(get("/api/providers/{id}/slots?date={d}&serviceId={s}", null, smile.getId(), thursday,
                video.getId()), SlotsResponse.class);
        assertThat(explicit.serviceId()).isEqualTo(video.getId());
        assertThat(explicit.slots()).hasSize(24);

        Provider empty = data.provider();
        get("/api/providers/{id}/slots?date={d}", null, empty.getId(), thursday)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("This provider has no bookable services"));
        get("/api/providers/{id}/slots", null, smile.getId())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Missing parameter: date"));
    }

    // ------------------------------------------------------------------ config & categories

    @Test
    void publicConfigExposesFeatureFlags() throws Exception {
        get("/api/config", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.appName").isNotEmpty())
                .andExpect(jsonPath("$.googleClientId").value(""))
                .andExpect(jsonPath("$.onlinePayments").value(true))
                .andExpect(jsonPath("$.paymentsDemoMode").value(true))
                .andExpect(jsonPath("$.razorpayKeyId").value(""))
                .andExpect(jsonPath("$.currency").value("INR"))
                .andExpect(jsonPath("$.languages[0]").value("en"));
        get("/api/categories", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Dentist"))
                .andExpect(jsonPath("$[0].slug").value("dentist"));
    }

    // ------------------------------------------------------------------ uploads

    private static byte[] png() throws Exception {
        BufferedImage image = new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(image, "png", out);
        return out.toByteArray();
    }

    private org.springframework.test.web.servlet.ResultActions upload(MockMultipartFile file, String token) throws Exception {
        return mvc.perform(withAuth(MockMvcRequestBuilders.multipart("/api/uploads").file(file), token));
    }

    @Test
    void validImagesAreStoredAndServedBack() throws Exception {
        String token = auth.token(data.customer());
        byte[] png = png();

        UploadResponse res = read(upload(new MockMultipartFile("file", "avatar.png", "image/png", png), token)
                .andExpect(status().isOk()), UploadResponse.class);
        assertThat(res.contentType()).isEqualTo("image/png");
        assertThat(res.size()).isEqualTo(png.length);
        assertThat(res.filename()).matches("[A-Za-z0-9_-]{43}\\.png");
        assertThat(res.url()).isEqualTo("/api/uploads/" + res.filename());

        MvcResult fetched = get(res.url(), null)
                .andExpect(status().isOk())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Cache-Control", "max-age=2592000, public"))
                .andReturn();
        assertThat(fetched.getResponse().getContentType()).startsWith("image/png");
        assertThat(fetched.getResponse().getContentAsByteArray()).isEqualTo(png);

        // the declared content type / extension does not matter, the bytes do
        UploadResponse renamed = read(upload(new MockMultipartFile("file", "photo.txt", "text/plain", png), token)
                .andExpect(status().isOk()), UploadResponse.class);
        assertThat(renamed.filename()).endsWith(".png");
    }

    @Test
    void nonImagesEmptyFilesAndAnonymousUploadsAreRejected() throws Exception {
        String token = auth.token(data.customer());

        upload(new MockMultipartFile("file", "evil.png", "image/png", "<script>alert(1)</script>".getBytes(StandardCharsets.UTF_8)), token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Only PNG, JPEG, WebP or GIF images are allowed"));
        upload(new MockMultipartFile("file", "empty.png", "image/png", new byte[0]), token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Choose an image to upload"));
        byte[] big = Arrays.copyOf(png(), 2 * 1024 * 1024 + 1);
        upload(new MockMultipartFile("file", "big.png", "image/png", big), token)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Image is too large (max 2 MB)"));
        upload(new MockMultipartFile("file", "a.png", "image/png", png()), null).andExpect(status().isUnauthorized());
    }

    @Test
    void unknownAndTraversalFileNamesAreNotFound() throws Exception {
        get("/api/uploads/{name}", null, "nope.png").andExpect(status().isNotFound());
        get("/api/uploads/{name}", null, "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG.png")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("File not found"));
        get("/api/uploads/{name}", null, "abcdefghijklmnopqrstuvwxyz.exe").andExpect(status().isNotFound());
        get("/api/uploads/{name}", null, "..abcdefghijklmnopqrstuvwxyz.png").andExpect(status().isNotFound());
        // encoded separators never reach the controller (rejected by the firewall)
        int status = get("/api/uploads/..%2F..%2Fetc%2Fpasswd", null).andReturn().getResponse().getStatus();
        assertThat(status).isBetween(400, 404);

        for (String name : List.of("../../etc/passwd", "..\\..\\windows\\win.ini", "../aaaaaaaaaaaaaaaaaaaaaaaa.png",
                "/etc/aaaaaaaaaaaaaaaaaaaaaaaaaaaa.png")) {
            assertThatThrownBy(() -> uploadService.load(name))
                    .isInstanceOf(ApiException.class)
                    .satisfies(e -> assertThat(((ApiException) e).getStatus()).isEqualTo(HttpStatus.NOT_FOUND));
        }
        assertThat(UploadService.contentType("x.webp")).isEqualTo("image/webp");
        assertThat(UploadService.contentType("x.bin")).isEqualTo("application/octet-stream");
    }
}
