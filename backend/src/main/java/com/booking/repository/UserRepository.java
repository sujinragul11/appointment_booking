package com.booking.repository;

import com.booking.entity.User;
import com.booking.enums.UserRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long>, JpaSpecificationExecutor<User> {

    Optional<User> findByEmailIgnoreCase(String email);

    Optional<User> findByGoogleId(String googleId);

    boolean existsByEmailIgnoreCase(String email);

    long countByRoleAndDeletedFalse(UserRole role);

    long countByDeletedFalse();

    boolean existsByRole(UserRole role);

    List<User> findByPhone(String phone);

    List<User> findByRoleAndActiveTrueAndDeletedFalse(UserRole role);
}
