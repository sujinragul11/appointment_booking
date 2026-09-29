package com.booking.enums;

/** How a service is delivered (FR-26). */
public enum ServiceMode {
    IN_PERSON, ONLINE, BOTH;

    public boolean allows(ServiceMode requested) {
        return this == BOTH || this == requested;
    }
}
