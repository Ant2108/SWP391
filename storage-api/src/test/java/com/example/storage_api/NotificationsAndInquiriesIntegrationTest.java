package com.example.storage_api;

import com.example.storage_api.entity.*;
import com.example.storage_api.reponsitory.*;
import com.example.storage_api.security.JwtService;
import com.example.storage_api.service.NotificationService;
import com.fasterxml.jackson.databind.JsonNode;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Chuông thông báo trong app và câu hỏi của khách vãng lai (trang Support). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("test")
@Transactional
class NotificationsAndInquiriesIntegrationTest {

    @Autowired private WebApplicationContext webApplicationContext;
    @Autowired private FilterChainProxy filterChainProxy;
    @Autowired private UsersRepository usersRepository;
    @Autowired private FacilityRepository facilityRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private InquiryRepository inquiryRepository;
    @Autowired private NotificationService notificationService;
    @Autowired private JwtService jwtService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private ObjectMapper objectMapper;

    private MockMvc mockMvc;
    private Facility facilityA;
    private Facility facilityB;
    private Users customer;
    private Users otherCustomer;
    private Users staffA;
    private Users managerA;
    private Users staffB;
    private Users admin;
    private String customerToken;
    private String otherCustomerToken;
    private String staffAToken;
    private String managerAToken;
    private String staffBToken;
    private String adminToken;

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).addFilters(filterChainProxy).build();
        facilityA = facility("Inq Facility A");
        facilityB = facility("Inq Facility B");
        customer = user("inq-customer@test.com", Role.CUSTOMER, null);
        otherCustomer = user("inq-customer2@test.com", Role.CUSTOMER, null);
        staffA = user("inq-staff@test.com", Role.FACILITY_STAFF, facilityA);
        managerA = user("inq-manager@test.com", Role.FACILITY_MANAGER, facilityA);
        staffB = user("inq-staffb@test.com", Role.FACILITY_STAFF, facilityB);
        admin = user("inq-admin@test.com", Role.SYSTEM_ADMIN, null);
        customerToken = token(customer);
        otherCustomerToken = token(otherCustomer);
        staffAToken = token(staffA);
        managerAToken = token(managerA);
        staffBToken = token(staffB);
        adminToken = token(admin);
    }

    // ===================== CHUÔNG THÔNG BÁO =====================

    @Test
    @DisplayName("Bell: a user sees only their own notifications, unread count, mark one / all as read")
    void bell() throws Exception {
        notificationService.create(customer, "Deposit received", "We received your deposit", "/account/reservations/1");
        notificationService.create(customer, "Unit assigned", "Unit A01 is held", "/account/reservations/1");
        notificationService.create(otherCustomer, "Someone else", "not yours", null);

        mockMvc.perform(get("/api/notifications/my/unread-count").header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.count").value(2));
        JsonNode list = json(mockMvc.perform(get("/api/notifications/my").header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].read").value(false)).andReturn().getResponse().getContentAsString());
        assertEquals("Unit assigned", list.get(0).get("title").asText()); // mới nhất trước

        int id = list.get(0).get("id").asInt();
        mockMvc.perform(patch("/api/notifications/" + id + "/read").header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.read").value(true));
        // Thông báo của người khác -> 404.
        mockMvc.perform(patch("/api/notifications/" + id + "/read").header("Authorization", bearer(otherCustomerToken)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/notifications/my/unread-count").header("Authorization", bearer(customerToken)))
                .andExpect(jsonPath("$.count").value(1));

        mockMvc.perform(patch("/api/notifications/read-all").header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/notifications/my/unread-count").header("Authorization", bearer(customerToken)))
                .andExpect(jsonPath("$.count").value(0));
        // Người khác không bị ảnh hưởng.
        mockMvc.perform(get("/api/notifications/my/unread-count").header("Authorization", bearer(otherCustomerToken)))
                .andExpect(jsonPath("$.count").value(1));

        // Chưa đăng nhập -> 401.
        mockMvc.perform(get("/api/notifications/my")).andExpect(status().isUnauthorized());
    }

    // ===================== CÂU HỎI CỦA KHÁCH VÃNG LAI =====================

    @Test
    @DisplayName("Inquiry: anyone can ask without an account; only that facility's staff see and answer it")
    void inquiryFlow() throws Exception {
        // Không có token (khách chưa đăng nhập) vẫn gửi được.
        JsonNode created = json(mockMvc.perform(post("/api/inquiries").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "facilityId", facilityA.getId(), "name", "Guest One", "email", "Guest.One@Mail.com",
                                "subject", "Opening hours?", "message", "Are you open on Sunday?"))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.email").value("guest.one@mail.com"))
                .andReturn().getResponse().getContentAsString());
        int id = created.get("id").asInt();

        // Nhân viên / quản lý của cơ sở được báo trong chuông; cơ sở khác thì không.
        assertEquals(1, notificationRepository.countByUser_IdAndReadFalse(staffA.getId()));
        assertEquals(1, notificationRepository.countByUser_IdAndReadFalse(managerA.getId()));
        assertEquals(0, notificationRepository.countByUser_IdAndReadFalse(staffB.getId()));

        // Chỉ nhân viên: khách đăng nhập không xem được danh sách; staff cơ sở khác không thấy câu này.
        mockMvc.perform(get("/api/inquiries").header("Authorization", bearer(customerToken))).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/inquiries").header("Authorization", bearer(staffAToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/inquiries").header("Authorization", bearer(staffBToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/inquiries").header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/inquiries?facilityId=" + facilityA.getId()).header("Authorization", bearer(staffBToken)))
                .andExpect(status().isForbidden());

        // Trả lời: staff cơ sở khác 403, admin 403 (chỉ xem), trả lời rỗng 400, đúng người thì được.
        String ans = objectMapper.writeValueAsString(Map.of("answer", "Yes, we are open 8:00 to 22:00 daily."));
        mockMvc.perform(patch("/api/inquiries/" + id + "/answer").header("Authorization", bearer(staffBToken))
                .contentType(MediaType.APPLICATION_JSON).content(ans)).andExpect(status().isForbidden());
        mockMvc.perform(patch("/api/inquiries/" + id + "/answer").header("Authorization", bearer(adminToken))
                .contentType(MediaType.APPLICATION_JSON).content(ans)).andExpect(status().isForbidden());
        mockMvc.perform(patch("/api/inquiries/" + id + "/answer").header("Authorization", bearer(staffAToken))
                .contentType(MediaType.APPLICATION_JSON).content("{\"answer\":\"\"}")).andExpect(status().isBadRequest());
        mockMvc.perform(patch("/api/inquiries/" + id + "/answer").header("Authorization", bearer(staffAToken))
                        .contentType(MediaType.APPLICATION_JSON).content(ans))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ANSWERED"))
                .andExpect(jsonPath("$.answeredByName").value("inq-staff"));
        // Đã trả lời rồi thì không trả lời lại.
        mockMvc.perform(patch("/api/inquiries/" + id + "/answer").header("Authorization", bearer(managerAToken))
                .contentType(MediaType.APPLICATION_JSON).content(ans)).andExpect(status().isConflict());
        mockMvc.perform(get("/api/inquiries?status=OPEN").header("Authorization", bearer(staffAToken)))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("Inquiry: an asker who has an account also gets the answer in their bell")
    void answerReachesAccountHolder() throws Exception {
        int id = json(mockMvc.perform(post("/api/inquiries").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "facilityId", facilityA.getId(), "name", "Customer", "email", customer.getEmail(),
                                "subject", "Parking?", "message", "Is there parking?"))))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asInt();
        mockMvc.perform(patch("/api/inquiries/" + id + "/answer").header("Authorization", bearer(managerAToken))
                .contentType(MediaType.APPLICATION_JSON).content("{\"answer\":\"Yes, free parking.\"}")).andExpect(status().isOk());
        mockMvc.perform(get("/api/notifications/my").header("Authorization", bearer(customerToken)))
                .andExpect(jsonPath("$[0].title").value("We answered your question"));
    }

    @Test
    @DisplayName("Inquiry validation: bad email / unknown or inactive facility rejected; bot field is ignored silently")
    void inquiryValidation() throws Exception {
        Map<String, Object> ok = Map.of("facilityId", facilityA.getId(), "name", "G", "email", "g@mail.com",
                "subject", "s", "message", "m");
        mockMvc.perform(post("/api/inquiries").contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(merge(ok, "email", "not-an-email")))).andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/inquiries").contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(merge(ok, "facilityId", 999999)))).andExpect(status().isNotFound());
        mockMvc.perform(post("/api/inquiries").contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(merge(ok, "message", " ")))).andExpect(status().isBadRequest());

        long before = inquiryRepository.count();
        mockMvc.perform(post("/api/inquiries").contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(merge(ok, "website", "http://spam.example"))))
                .andExpect(status().isCreated());
        assertEquals(before, inquiryRepository.count()); // bot: không lưu gì
    }

    // ===================== HELPER =====================

    private Map<String, Object> merge(Map<String, Object> base, String key, Object value) {
        Map<String, Object> m = new java.util.HashMap<>(base);
        m.put(key, value);
        return m;
    }

    private JsonNode json(String s) {
        try {
            return objectMapper.readTree(s);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private String token(Users user) {
        UserDetails details = org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail()).password(user.getPassword()).roles(user.getRole().name()).build();
        return jwtService.generateToken(details);
    }

    private Facility facility(String name) {
        Facility f = new Facility();
        f.setName(name);
        f.setAddress("1 Test Street");
        return facilityRepository.save(f);
    }

    private Users user(String email, Role role, Facility facility) {
        Users u = new Users();
        u.setFullname(email.substring(0, email.indexOf('@')));
        u.setEmail(email);
        u.setPhone("0900000000");
        u.setPassword(passwordEncoder.encode("password123"));
        u.setRole(role);
        u.setStatus(Status.ACTIVE);
        u.setFacility(facility);
        return usersRepository.save(u);
    }
}
