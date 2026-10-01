package com.example.storage_api.config;

import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class DataInit implements CommandLineRunner {

    private final UsersRepository usersRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) throws Exception {
        if (usersRepository.count() == 0) {
            log.info("Khởi tạo dữ liệu cứng cho Users để test...");

            Users admin = new Users();
            admin.setFullname("System Admin");
            admin.setEmail("admin@example.com");
            admin.setPhone("0123456789");
            admin.setPassword(passwordEncoder.encode("admin123"));
            admin.setRole(Role.SYSTEM_ADMIN);
            admin.setStatus(Status.ACTIVE);

            Users manager = new Users();
            manager.setFullname("Business Manager");
            manager.setEmail("manager@example.com");
            manager.setPhone("0123456788");
            manager.setPassword(passwordEncoder.encode("manager123"));
            manager.setRole(Role.BUSINESS_MANAGER);
            manager.setStatus(Status.ACTIVE);

            Users customer = new Users();
            customer.setFullname("Customer Test");
            customer.setEmail("customer@example.com");
            customer.setPhone("0123456787");
            customer.setPassword(passwordEncoder.encode("customer123"));
            customer.setRole(Role.CUSTOMER);
            customer.setStatus(Status.ACTIVE);

            Users facilityStaff = new Users();
            facilityStaff.setFullname("Facility Staff");
            facilityStaff.setEmail("staff@example.com");
            facilityStaff.setPhone("0123456786");
            facilityStaff.setPassword(passwordEncoder.encode("staff123"));
            facilityStaff.setRole(Role.FACILITY_STAFF);
            facilityStaff.setStatus(Status.ACTIVE);

            Users facilityManager = new Users();
            facilityManager.setFullname("Facility Manager");
            facilityManager.setEmail("fmanager@example.com");
            facilityManager.setPhone("0123456785");
            facilityManager.setPassword(passwordEncoder.encode("fmanager123"));
            facilityManager.setRole(Role.FACILITY_MANAGER);
            facilityManager.setStatus(Status.ACTIVE);

            usersRepository.saveAll(List.of(admin, manager, customer, facilityStaff, facilityManager));

            log.info("Khởi tạo thành công 5 user với các role khác nhau. Mật khẩu chung là: [tên role]123 (ví dụ: admin123, manager123...)");
        } else {
            log.info("Dữ liệu Users đã tồn tại, bỏ qua khởi tạo DataInit.");
        }
    }
}
