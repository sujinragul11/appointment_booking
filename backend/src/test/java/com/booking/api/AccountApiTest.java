package com.booking.api;

import com.booking.dto.response.AddressResponse;
import com.booking.entity.Address;
import com.booking.entity.User;
import com.booking.repository.AddressRepository;
import com.booking.support.IntegrationTestBase;
import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Signed-in account features that are not covered elsewhere: the address book. */
class AccountApiTest extends IntegrationTestBase {

    @Autowired private AddressRepository addressRepository;

    @Test
    void addressesBelongToTheSignedInUser() throws Exception {
        User user = data.customer();
        String token = auth.token(user);

        var first = read(post("/api/addresses", token, Map.of("label", "Home", "addressLine", "1 Beach Rd", "city", "Chennai"))
                .andExpect(status().isOk()), AddressResponse.class);
        assertThat(first.defaultAddress()).as("the first address becomes the default").isTrue();
        var second = read(post("/api/addresses", token, Map.of("label", "Work", "addressLine", "2 IT Park", "defaultAddress", true))
                .andExpect(status().isOk()), AddressResponse.class);
        assertThat(second.defaultAddress()).isTrue();
        List<AddressResponse> list = read(get("/api/addresses", token), new TypeReference<>() { });
        assertThat(list).extracting(a -> a.label() + ":" + a.defaultAddress()).containsExactly("Home:false", "Work:true");
        post("/api/addresses", token, Map.of("label", "Empty")).andExpect(status().isBadRequest());

        delete("/api/addresses/" + first.id(), auth.token(data.customer())).andExpect(status().isNotFound());
        delete("/api/addresses/" + first.id(), token).andExpect(status().isNoContent());
        List<Address> remaining = addressRepository.findByUserIdOrderByIdAsc(user.getId());
        assertThat(remaining).hasSize(1);
    }
}
