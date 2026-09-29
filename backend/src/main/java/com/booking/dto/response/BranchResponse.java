package com.booking.dto.response;

import com.booking.enums.*;

import java.time.*;
import java.util.List;

public record BranchResponse(
        Long id, String name, String address, String city, String state, String country,
        Double latitude, Double longitude, String phone, boolean main
) {}
