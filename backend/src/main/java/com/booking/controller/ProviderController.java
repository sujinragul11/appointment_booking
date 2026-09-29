package com.booking.controller;

import com.booking.dto.response.PageResponse;
import com.booking.dto.response.ProviderResponse;
import com.booking.dto.response.ReviewResponse;
import com.booking.dto.response.ServiceResponse;
import com.booking.entity.Provider;
import com.booking.enums.ProviderStatus;
import com.booking.repository.ProviderRepository;
import com.booking.service.AvailabilityService;
import com.booking.service.ProviderService;
import com.booking.service.ReviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/providers")
@RequiredArgsConstructor
@Tag(name = "Providers")
public class ProviderController {

    private final ProviderService providerService;
    private final ReviewService reviewService;
    private final AvailabilityService availabilityService;
    private final ProviderRepository providerRepository;

    @GetMapping
    @Operation(summary = "Search providers (public): ?q&categoryId&city&minRating&sort&page&size")
    public PageResponse<ProviderResponse> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) String city,
            @RequestParam(required = false) Integer minRating,
            @RequestParam(required = false) String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return providerService.search(q, categoryId, city, minRating, sort, page, size);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Provider profile detail with services, staff, branches")
    public ProviderResponse getById(@PathVariable Long id) {
        return providerService.getById(id);
    }

    @GetMapping("/nearby")
    @Operation(summary = "Providers near a lat/lng within a radius (km)")
    public List<ProviderResponse> nearby(
            @RequestParam double lat,
            @RequestParam double lng,
            @RequestParam(defaultValue = "20") double radius) {
        return providerRepository.findAll().stream()
                .filter(p -> p.getStatus() == ProviderStatus.VERIFIED)
                .filter(p -> p.getLatitude() != null && p.getLongitude() != null)
                .filter(p -> {
                    double d = haversine(lat, lng, p.getLatitude(), p.getLongitude());
                    return d <= radius;
                }).map(p -> providerService.getById(p.getId()))
                .toList();
    }

    @GetMapping("/{id}/services")
    public List<ServiceResponse> services(@PathVariable Long id) {
        return providerService.getById(id).services();
    }

    @GetMapping("/{id}/reviews")
    public List<ReviewResponse> reviews(@PathVariable Long id) {
        return reviewService.listByProvider(id);
    }

    @GetMapping("/{id}/availability")
    public Object availability(@PathVariable Long id) {
        return availabilityService.getBundle(id);
    }

    private double haversine(double lat1, double lon1, double lat2, double lon2) {
        double R = 6371;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}