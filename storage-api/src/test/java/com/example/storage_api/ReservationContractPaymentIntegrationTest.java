package com.example.storage_api;

import com.example.storage_api.entity.*;
import com.example.storage_api.reponsitory.*;
import com.example.storage_api.security.JwtService;
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

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration Test cho toàn bộ luồng nghiệp vụ của Thành viên 3:
 * Reservation -> Assign StorageUnit -> Confirm -> Payment (Deposit) -> RentalContract (PENDING)
 * -> Activate (ACTIVE) -> Renewal -> Mark Overdue (kèm OVERDUE_FEE Payment) -> Cancel.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("test")
@Transactional
class ReservationContractPaymentIntegrationTest {

    @Autowired private WebApplicationContext context;
    @Autowired private FilterChainProxy filterChainProxy;
    @Autowired private UsersRepository usersRepository;
    @Autowired private FacilityRepository facilityRepository;
    @Autowired private UnitTypeRepository unitTypeRepository;
    @Autowired private StorageUnitRepository storageUnitRepository;
    @Autowired private PriceRuleRepository priceRuleRepository;
    @Autowired private ReservationRepository reservationRepository;
    @Autowired private RentalContractRepository rentalContractRepository;
    @Autowired private PaymentRepository paymentRepository;
    @Autowired private JwtService jwtService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private ObjectMapper objectMapper;

    private MockMvc mockMvc;
    private Facility facility;
    private UnitType unitType;
    private StorageUnit unitA01;
    private StorageUnit unitA02;
    private Users customer;
    private Users manager;
    private String customerToken;
    private String managerToken;

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).addFilters(filterChainProxy).build();

        facility = new Facility();
        facility.setName("Member3 Test Facility");
        facility.setAddress("100 Nguyen Hue");
        facility.setStatus(FacilityStatus.ACTIVE);
        facility = facilityRepository.save(facility);

        unitType = new UnitType();
        unitType.setFacility(facility);
        unitType.setTypeName("M3-SMALL");
        unitType.setActive(true);
        unitType = unitTypeRepository.save(unitType);

        unitA01 = createUnit("M3-A01", UnitStatus.AVAILABLE);
        unitA02 = createUnit("M3-A02", UnitStatus.AVAILABLE);

        seedRule(PriceType.RENTAL, CalculationType.PER_MONTH, new BigDecimal("1000000"));
        seedRule(PriceType.DEPOSIT, CalculationType.FIXED, new BigDecimal("500000"));
        seedRule(PriceType.RENEWAL, CalculationType.PER_MONTH, new BigDecimal("950000"));
        seedRule(PriceType.OVERDUE, CalculationType.PER_DAY, new BigDecimal("50000"));
        seedRule(PriceType.EXTRA_FEE, CalculationType.FIXED, new BigDecimal("200000"));

        customer = createUser("m3-customer@test.com", Role.CUSTOMER, null);
        manager = createUser("m3-manager@test.com", Role.FACILITY_MANAGER, facility);
        customerToken = bearer(customer);
        managerToken = bearer(manager);
    }

    @Test
    @DisplayName("Full Member 3 Flow: Reserve -> Assign & Confirm -> Pay Deposit -> Auto Contract PENDING -> Activate -> Renew -> Mark Overdue")
    void fullMember3BusinessFlow() throws Exception {
        // 1. Customer tạo Reservation
        String startDate = LocalDate.now().plusDays(1).toString();
        JsonNode createdRes = json(send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(),
                "unitTypeId", unitType.getId(),
                "startDate", startDate,
                "rentalMonths", 3
        )).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.estimatedAmount").value(3000000.0)));
        int reservationId = createdRes.get("id").asInt();

        // 2. Manager gán StorageUnit -> Unit chuyển sang RESERVED, tạo sẵn khoản cọc PENDING
        send(patch("/api/reservations/" + reservationId + "/assign-unit"), managerToken, Map.of(
                "storageUnitId", unitA01.getId()
        )).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.unitCode").value("M3-A01"))
                .andExpect(jsonPath("$.pendingDepositPaymentId").isNumber());

        assertEquals(UnitStatus.RESERVED, storageUnitRepository.findById(unitA01.getId()).orElseThrow().getStatus());

        // 3. Manager cũng có thể gọi PATCH /api/reservations/{id}/confirm
        send(patch("/api/reservations/" + reservationId + "/confirm"), managerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"));

        // 4. Customer đóng tiền cọc DEPOSIT -> Tự động sinh RentalContract ở trạng thái PENDING
        send(post("/api/payments"), customerToken, Map.of(
                "reservationId", reservationId,
                "paymentType", "DEPOSIT",
                "amount", 500000,
                "paymentMethod", "CARD",
                "paid", true
        )).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.rentalContractId").isNumber());

        RentalContract contract = rentalContractRepository.findByReservation_Id(reservationId).orElseThrow();
        assertEquals(ContractStatus.PENDING, contract.getStatus());

        // 5. Kích hoạt hợp đồng sang ACTIVE (mô phỏng hoàn tất Check-in)
        send(patch("/api/rental-contracts/" + contract.getId() + "/activate"), managerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        // 6. Customer gia hạn hợp đồng 2 tháng (luồng tạo hóa đơn PENDING -> thanh toán PAID -> cập nhật EndDate)
        LocalDate oldEndDate = rentalContractRepository.findById(contract.getId()).orElseThrow().getEndDate();
        send(post("/api/rental-contracts/" + contract.getId() + "/renew"), customerToken, Map.of(
                "months", 2,
                "paymentMethod", "BANK_TRANSFER",
                "paid", false
        )).andExpect(status().isOk());

        Payment pendingRenewal = paymentRepository
                .findFirstByRentalContract_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        contract.getId(), PaymentType.RENEWAL, PaymentStatus.PENDING)
                .orElseThrow();
        assertEquals(0, new BigDecimal("1900000.00").compareTo(pendingRenewal.getAmount()));

        // Khi thanh toán khoản RENEWAL -> EndDate tự động cộng thêm 2 tháng
        send(patch("/api/payments/" + pendingRenewal.getId() + "/paid?paymentMethod=BANK_TRANSFER"), customerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        LocalDate renewedEndDate = rentalContractRepository.findById(contract.getId()).orElseThrow().getEndDate();
        assertEquals(oldEndDate.plusMonths(2), renewedEndDate);

        // 7. Manager đánh dấu quá hạn (PATCH /api/rental-contracts/{id}/overdue) -> Tạo Payment OVERDUE_FEE (PENDING)
        send(patch("/api/rental-contracts/" + contract.getId() + "/overdue"), managerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OVERDUE"));

        assertTrue(paymentRepository.existsByRentalContract_IdAndPaymentTypeAndStatus(
                contract.getId(), PaymentType.OVERDUE_FEE, PaymentStatus.PENDING));

        // 8. Manager xem danh sách GET /api/payments
        send(get("/api/payments"), managerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(3));
    }

    @Test
    @DisplayName("Cancel reservation releases RESERVED storage unit back to AVAILABLE")
    void cancelReservationReleasesUnit() throws Exception {
        JsonNode created = json(send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(),
                "unitTypeId", unitType.getId(),
                "startDate", LocalDate.now().plusDays(2).toString(),
                "rentalMonths", 1
        )).andExpect(status().isCreated()));
        int resId = created.get("id").asInt();

        send(patch("/api/reservations/" + resId + "/assign-unit"), managerToken, Map.of(
                "storageUnitId", unitA02.getId()
        )).andExpect(status().isOk());
        assertEquals(UnitStatus.RESERVED, storageUnitRepository.findById(unitA02.getId()).orElseThrow().getStatus());

        send(patch("/api/reservations/" + resId + "/cancel"), customerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        assertEquals(UnitStatus.AVAILABLE, storageUnitRepository.findById(unitA02.getId()).orElseThrow().getStatus());
    }

    private StorageUnit createUnit(String code, UnitStatus status) {
        StorageUnit u = new StorageUnit();
        u.setFacility(facility);
        u.setUnitType(unitType);
        u.setUnitCode(code);
        u.setStatus(status);
        return storageUnitRepository.save(u);
    }

    private void seedRule(PriceType type, CalculationType calc, BigDecimal amount) {
        PriceRule r = new PriceRule();
        r.setFacility(facility);
        r.setUnitType(unitType);
        r.setPriceType(type);
        r.setCalculationType(calc);
        r.setAmount(amount);
        r.setEffectiveFrom(LocalDate.now().minusDays(10));
        r.setActive(true);
        priceRuleRepository.save(r);
    }

    private Users createUser(String email, Role role, Facility fac) {
        Users u = new Users();
        u.setFullname(email);
        u.setEmail(email);
        u.setPassword(passwordEncoder.encode("password123"));
        u.setRole(role);
        u.setStatus(Status.ACTIVE);
        u.setFacility(fac);
        return usersRepository.save(u);
    }

    private String bearer(Users user) {
        UserDetails d = org.springframework.security.core.userdetails.User.builder()
                .username(user.getEmail()).password(user.getPassword()).roles(user.getRole().name()).build();
        return "Bearer " + jwtService.generateToken(d);
    }

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b,
                               String auth, Object body) throws Exception {
        b.header("Authorization", auth);
        if (body != null) {
            b.contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body));
        }
        return mockMvc.perform(b);
    }

    private JsonNode json(ResultActions r) throws Exception {
        return objectMapper.readTree(r.andReturn().getResponse().getContentAsString());
    }
}
