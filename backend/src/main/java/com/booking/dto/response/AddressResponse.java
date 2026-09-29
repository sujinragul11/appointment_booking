package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record AddressResponse(
        Long id, String label, String addressLine, String city, String state, String country,
        String zip, Double latitude, Double longitude, boolean defaultAddress
) {}
