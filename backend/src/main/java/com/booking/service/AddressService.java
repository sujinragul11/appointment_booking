package com.booking.service;

import com.booking.dto.request.AddressRequest;
import com.booking.dto.response.AddressResponse;
import com.booking.entity.Address;
import com.booking.entity.User;
import com.booking.exception.ApiException;
import com.booking.repository.AddressRepository;
import com.booking.repository.UserRepository;
import com.booking.security.SecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class AddressService {

    private final UserRepository userRepository;
    private final AddressRepository addressRepository;

    public List<AddressResponse> list() {
        return user().getAddresses().stream().map(AddressService::toResponse).toList();
    }

    @Transactional
    public AddressResponse add(AddressRequest req) {
        User user = user();
        Address a = Address.builder()
                .user(user)
                .label(req.label())
                .addressLine(req.addressLine())
                .city(req.city())
                .state(req.state())
                .country(req.country())
                .zip(req.zip())
                .latitude(req.latitude())
                .longitude(req.longitude())
                .defaultAddress(req.defaultAddress() != null && req.defaultAddress())
                .build();
        if (a.isDefaultAddress()) {
            clearDefaults(user, a);
        }
        addressRepository.save(a);
        user.getAddresses().add(a);
        return toResponse(a);
    }

    @Transactional
    public void delete(Long id) {
        User user = user();
        user.getAddresses().removeIf(a -> a.getId().equals(id));
        userRepository.save(user);
    }

    private void clearDefaults(User user, Address keep) {
        user.getAddresses().forEach(a -> {
            if (!a.equals(keep)) a.setDefaultAddress(false);
        });
    }

    private User user() {
        return userRepository.findById(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.unauthorized("Not authenticated"));
    }

    public static AddressResponse toResponse(Address a) {
        return new AddressResponse(a.getId(), a.getLabel(), a.getAddressLine(), a.getCity(),
                a.getState(), a.getCountry(), a.getZip(), a.getLatitude(), a.getLongitude(), a.isDefaultAddress());
    }
}