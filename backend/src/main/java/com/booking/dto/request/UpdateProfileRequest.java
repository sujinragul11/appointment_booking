package com.booking.dto.request;

public record UpdateProfileRequest(
        String name,
        String phone,
        String photoUrl,
        Boolean notifEmail,
        Boolean notifSms,
        Boolean notifPush
) {}