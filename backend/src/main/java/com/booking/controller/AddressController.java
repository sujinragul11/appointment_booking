package com.booking.controller;

import com.booking.dto.request.AddressRequest;
import com.booking.dto.response.AddressResponse;
import com.booking.service.AddressService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/addresses")
@RequiredArgsConstructor
public class AddressController {

    private final AddressService addressService;

    @GetMapping
    public List<AddressResponse> list() {
        return addressService.list();
    }

    @PostMapping
    public AddressResponse add(@Valid @RequestBody AddressRequest request) {
        return addressService.add(request);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        addressService.delete(id);
    }
}