package com.booking.service;

import com.booking.dto.request.AddressRequest;
import com.booking.dto.response.AddressResponse;
import com.booking.entity.Address;
import com.booking.entity.User;
import com.booking.exception.ApiException;
import com.booking.mapper.DtoMapper;
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
    private final DtoMapper mapper;

    @Transactional(readOnly = true)
    public List<AddressResponse> list() {
        return addressRepository.findByUserIdOrderByIdAsc(SecurityUtils.currentUserId()).stream().map(mapper::address).toList();
    }

    @Transactional
    public AddressResponse add(AddressRequest req) {
        User user = userRepository.findById(SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.unauthorized("Not authenticated"));
        List<Address> existing = addressRepository.findByUserIdOrderByIdAsc(user.getId());
        boolean makeDefault = Boolean.TRUE.equals(req.defaultAddress()) || existing.isEmpty();
        if (makeDefault) existing.forEach(a -> a.setDefaultAddress(false));
        Address a = addressRepository.save(Address.builder().user(user).label(req.label()).addressLine(req.addressLine())
                .city(req.city()).state(req.state()).country(req.country()).zip(req.zip())
                .latitude(req.latitude()).longitude(req.longitude()).defaultAddress(makeDefault).build());
        return mapper.address(a);
    }

    @Transactional
    public void delete(Long id) {
        Address a = addressRepository.findByIdAndUserId(id, SecurityUtils.currentUserId())
                .orElseThrow(() -> ApiException.notFound("Address not found"));
        addressRepository.delete(a);
    }
}
