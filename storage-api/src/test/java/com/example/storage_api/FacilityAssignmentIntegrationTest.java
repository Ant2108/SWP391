package com.example.storage_api;

import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.reponsitory.FacilityRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import com.example.storage_api.security.JwtService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("test")
@Transactional
class FacilityAssignmentIntegrationTest {

    @Autowired
    private WebApplicationContext webApplicationContext;

    @Autowired
    private FilterChainProxy filterChainProxy;

    @Autowired
    private UsersRepository usersRepository;

    @Autowired
    private FacilityRepository facilityRepository;



    @Autowired
    private JwtService jwtService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private ObjectMapper objectMapper;

    private MockMvc mockMvc;

    private Users adminUser;
    private Users staffUser;
    private Users customerUser;
    private Facility facilityA;
    private Facility facilityB;
    
    private String adminToken;
    private String customerToken;

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders
                .webAppContextSetup(webApplicationContext)
                .addFilters(filterChainProxy)
                .build();

        facilityRepository.deleteAll();
        usersRepository.deleteAll();

        adminUser = new Users();
        adminUser.setFullname("System Admin");
        adminUser.setEmail("admin@test.com");
        adminUser.setPhone("0123456789");
        adminUser.setPassword(passwordEncoder.encode("password123"));
        adminUser.setRole(Role.SYSTEM_ADMIN);
        adminUser.setStatus(Status.ACTIVE);
        adminUser = usersRepository.save(adminUser);

        staffUser = new Users();
        staffUser.setFullname("Staff User");
        staffUser.setEmail("staff@test.com");
        staffUser.setPhone("0987654321");
        staffUser.setPassword(passwordEncoder.encode("password123"));
        staffUser.setRole(Role.FACILITY_STAFF);
        staffUser.setStatus(Status.ACTIVE);
        staffUser = usersRepository.save(staffUser);

        customerUser = new Users();
        customerUser.setFullname("Customer User");
        customerUser.setEmail("customer@test.com");
        customerUser.setPhone("0900000000");
        customerUser.setPassword(passwordEncoder.encode("password123"));
        customerUser.setRole(Role.CUSTOMER);
        customerUser.setStatus(Status.ACTIVE);
        customerUser = usersRepository.save(customerUser);

        facilityA = new Facility();
        facilityA.setName("Facility A");
        facilityA.setAddress("123 A St");
        facilityA = facilityRepository.save(facilityA);

        facilityB = new Facility();
        facilityB.setName("Facility B");
        facilityB.setAddress("456 B St");
        facilityB = facilityRepository.save(facilityB);

        adminToken = generateToken(adminUser);
        customerToken = generateToken(customerUser);
    }

    private String generateToken(Users user) {
        UserDetails userDetails = org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail())
                .password(user.getPassword())
                .roles(user.getRole().name())
                .build();
        return jwtService.generateToken(userDetails);
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private String json(Object obj) throws Exception {
        return objectMapper.writeValueAsString(obj);
    }

    @Test
    @DisplayName("Admin can assign FACILITY_STAFF to facility")
    void adminCanAssignStaff() throws Exception {
        mockMvc.perform(post("/api/facility-assignments")
                        .header("Authorization", bearer(adminToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "userId", staffUser.getId(),
                                "facilityId", facilityA.getId()
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"))
                .andExpect(jsonPath("$.facilityName").value("Facility A"));
    }

    @Test
    @DisplayName("CUSTOMER cannot manage facility assignments → 403")
    void customerCannotManageAssignments() throws Exception {
        mockMvc.perform(post("/api/facility-assignments")
                        .header("Authorization", bearer(customerToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "userId", staffUser.getId(),
                                "facilityId", facilityA.getId()
                        ))))
                .andExpect(status().isForbidden());
    }
}
