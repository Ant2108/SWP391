package com.example.storage_api.config;

import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.reponsitory.FacilityRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Mỗi cơ sở có sẵn một Facility Manager và một Facility Staff để demo duyệt đơn ở bất kỳ kho nào.
 *
 * Chạy SAU DataInit (user mẫu + cơ sở), vì cần cơ sở đã tồn tại mới gán được.
 * Tài khoản: fmanager{id}@example.com / fmanager123 và staff{id}@example.com / staff123 (id = id cơ sở).
 * Cơ sở 1 đã có fmanager@example.com / staff@example.com nên được giữ nguyên.
 * Idempotent: cơ sở nào đã có manager (hoặc staff) thì bỏ qua phần đó, không ghi đè phân công của admin.
 */
@Slf4j
@Profile("!test")
@Order(3)
@Component
@RequiredArgsConstructor
public class FacilityAccountSeeder implements CommandLineRunner {

    private final FacilityRepository facilityRepository;
    private final UsersRepository usersRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        for (Facility f : facilityRepository.findAll()) {
            ensure(f, Role.FACILITY_MANAGER, "fmanager" + f.getId() + "@example.com", "fmanager123", "Manager - " + f.getName());
            ensure(f, Role.FACILITY_STAFF, "staff" + f.getId() + "@example.com", "staff123", "Staff - " + f.getName());
        }
    }

    private void ensure(Facility f, Role role, String email, String password, String fullname) {
        boolean hasOne = !usersRepository.findByRoleAndFacility_IdAndStatus(role, f.getId(), Status.ACTIVE).isEmpty();
        if (hasOne || usersRepository.findByEmail(email).isPresent()) {
            return;
        }
        Users u = new Users();
        u.setFullname(fullname);
        u.setEmail(email);
        u.setPhone("0900000000");
        u.setPassword(passwordEncoder.encode(password));
        u.setRole(role);
        u.setStatus(Status.ACTIVE);
        u.setFacility(f);
        usersRepository.save(u);
        log.info("FacilityAccountSeeder: tạo {} {} cho cơ sở '{}'", role, email, f.getName());
    }
}
