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
 * Integration Test cho toàn bộ luồng nghiệp vụ của Thành viên 3 (bao gồm BR-42, BR-52, BR-56, BR-62,
 * ký hợp đồng điện tử POST /api/rental-contracts/{id}/sign kèm kiểm tra định dạng ảnh, giới hạn gia hạn 1-12 tháng,
 * hoàn cọc khi trả kho, và chống rollback-only).
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
    private UnitType smallType;
    private UnitType largeType; // Chỉ có giá RENTAL, KHÔNG có giá DEPOSIT riêng
    private StorageUnit unitA01;
    private StorageUnit unitA02;
    private StorageUnit unitLarge01;
    private Users customer;
    private Users manager;
    private Users staff;
    private String customerToken;
    private String managerToken;
    private String staffToken;

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).addFilters(filterChainProxy).build();

        facility = new Facility();
        facility.setName("Member3 Test Facility");
        facility.setAddress("100 Nguyen Hue");
        facility.setStatus(FacilityStatus.ACTIVE);
        facility = facilityRepository.save(facility);

        smallType = new UnitType();
        smallType.setFacility(facility);
        smallType.setTypeName("M3-SMALL");
        smallType.setActive(true);
        smallType = unitTypeRepository.save(smallType);

        largeType = new UnitType();
        largeType.setFacility(facility);
        largeType.setTypeName("M3-LARGE");
        largeType.setActive(true);
        largeType = unitTypeRepository.save(largeType);

        unitA01 = createUnit(smallType, "M3-A01", UnitStatus.AVAILABLE);
        unitA02 = createUnit(smallType, "M3-A02", UnitStatus.AVAILABLE);
        unitLarge01 = createUnit(largeType, "M3-L01", UnitStatus.AVAILABLE);

        // SMALL có đủ các rule
        seedRule(smallType, PriceType.RENTAL, CalculationType.PER_MONTH, new BigDecimal("1000000"));
        seedRule(smallType, PriceType.DEPOSIT, CalculationType.FIXED, new BigDecimal("500000"));
        seedRule(smallType, PriceType.RENEWAL, CalculationType.PER_MONTH, new BigDecimal("950000"));
        seedRule(smallType, PriceType.OVERDUE, CalculationType.PER_DAY, new BigDecimal("50000"));
        seedRule(smallType, PriceType.EXTRA_FEE, CalculationType.FIXED, new BigDecimal("200000"));

        // LARGE chỉ có RENTAL (không có DEPOSIT/RENEWAL riêng) để kiểm tra không bao giờ bị lỗi 500 rollback-only
        seedRule(largeType, PriceType.RENTAL, CalculationType.PER_MONTH, new BigDecimal("3000000"));

        customer = createUser("m3-customer@test.com", Role.CUSTOMER, null);
        manager = createUser("m3-manager@test.com", Role.FACILITY_MANAGER, facility);
        staff = createUser("m3-staff@test.com", Role.FACILITY_STAFF, facility);
        customerToken = bearer(customer);
        managerToken = bearer(manager);
        staffToken = bearer(staff);
    }

    @Test
    @DisplayName("Full Member 3 Flow + BR-42 + Online Signing + BR-52/BR-62 + BR-56 Deposit Refund")
    void fullMember3BusinessFlow() throws Exception {
        // 1. Customer tạo Reservation
        String startDate = LocalDate.now().plusDays(1).toString();
        JsonNode createdRes = json(send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(),
                "unitTypeId", smallType.getId(),
                "startDate", startDate,
                "rentalMonths", 3
        )).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.estimatedAmount").value(3000000.0)));
        int reservationId = createdRes.get("id").asInt();

        // 1b. Kiểm tra bảo mật (khi cọc còn PENDING): khách gửi amount=1 hoặc paid=true đều bị chặn 400 BadRequest
        send(post("/api/payments"), customerToken, Map.of(
                "reservationId", reservationId,
                "paymentType", "DEPOSIT",
                "amount", 1,
                "paymentMethod", "CARD"
        )).andExpect(status().isBadRequest());

        send(post("/api/payments"), customerToken, Map.of(
                "reservationId", reservationId,
                "paymentType", "DEPOSIT",
                "amount", 500000,
                "paymentMethod", "CARD",
                "paid", true
        )).andExpect(status().isBadRequest());

        // 2. Manager gán StorageUnit -> Unit chuyển sang RESERVED
        JsonNode assignedRes = json(send(patch("/api/reservations/" + reservationId + "/assign-unit"), managerToken, Map.of(
                "storageUnitId", unitA01.getId()
        )).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.unitCode").value("M3-A01"))
                .andExpect(jsonPath("$.pendingDepositPaymentId").isNumber()));
        int depositPaymentId = assignedRes.get("pendingDepositPaymentId").asInt();

        // 3. BR-42: Customer KHÔNG được tự gọi PATCH /api/payments/{id}/paid -> 403 Forbidden
        send(patch("/api/payments/" + depositPaymentId + "/paid?paymentMethod=CARD"), customerToken, null)
                .andExpect(status().isForbidden());

        // Customer chỉ được gửi mã tham chiếu chuyển khoản (vẫn giữ trạng thái PENDING)
        send(patch("/api/payments/" + depositPaymentId + "/submit-reference?paymentMethod=BANK_TRANSFER&transactionReference=FT123456"), customerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.transactionReference").value("FT123456"));

        // 4. Manager/Staff xác nhận thanh toán cọc qua PATCH /api/payments/{id}/paid -> Tự động tạo RentalContract (PENDING) và hóa đơn Đợt 2 (RENTAL)
        send(patch("/api/payments/" + depositPaymentId + "/paid?paymentMethod=BANK_TRANSFER"), managerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.amount").value(500000.0))
                .andExpect(jsonPath("$.rentalContractId").isNumber());

        // Đóng cọc lần 2 khi đã PAID -> trả đúng 409 Conflict
        send(post("/api/payments"), customerToken, Map.of(
                "reservationId", reservationId,
                "paymentType", "DEPOSIT",
                "paymentMethod", "CARD"
        )).andExpect(status().isConflict());

        RentalContract contract = rentalContractRepository.findByReservation_Id(reservationId).orElseThrow();
        assertEquals(ContractStatus.PENDING, contract.getStatus());

        // 5a. Chưa ký hợp đồng -> Kích hoạt hợp đồng bị từ chối 400 Bad Request
        send(patch("/api/rental-contracts/" + contract.getId() + "/activate"), managerToken, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Customer must sign the contract before activation"));

        // 5b. Gửi chuỗi không phải ảnh (ví dụ "hello") vào signatureUrl -> bị chặn 400 Bad Request
        send(post("/api/rental-contracts/" + contract.getId() + "/sign"), customerToken, Map.of(
                "signerName", "Nguyen Van A",
                "signatureUrl", "hello"
        )).andExpect(status().isBadRequest());

        // Customer ký hợp đồng điện tử bằng ảnh PNG hợp lệ qua POST /api/rental-contracts/{id}/sign
        send(post("/api/rental-contracts/" + contract.getId() + "/sign"), customerToken, Map.of(
                "signerName", "Nguyen Van A",
                "signatureUrl", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )).andExpect(status().isOk())
                .andExpect(jsonPath("$.signerName").value("Nguyen Van A"))
                .andExpect(jsonPath("$.signedAt").exists())
                .andExpect(jsonPath("$.signatureUrl").exists());

        // Ký lại lần 2 -> bị chặn 409 Conflict ("Contract already signed")
        send(post("/api/rental-contracts/" + contract.getId() + "/sign"), customerToken, Map.of(
                "signerName", "Nguyen Van A",
                "signatureUrl", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Contract already signed"));

        // 5c. BR-52 & BR-62: Đã ký hợp đồng nhưng tiền thuê Đợt 2 (RENTAL) còn PENDING -> Kích hoạt bị từ chối 400 Bad Request
        send(patch("/api/rental-contracts/" + contract.getId() + "/activate"), managerToken, null)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("The rental payment (stage 2) has not been paid yet"));

        // Staff/Manager xác nhận đã thu tiền thuê Đợt 2 (RENTAL)
        Payment stage2Rental = paymentRepository
                .findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        reservationId, PaymentType.RENTAL, PaymentStatus.PENDING)
                .orElseThrow();
        send(patch("/api/payments/" + stage2Rental.getId() + "/paid?paymentMethod=BANK_TRANSFER"), staffToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        // 5d. Kích hoạt hợp đồng sang ACTIVE thành công sau khi đã ký + đóng đủ Đợt 1 & Đợt 2
        send(patch("/api/rental-contracts/" + contract.getId() + "/activate"), managerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        // 6a. Gia hạn quá 12 tháng (ví dụ 999 tháng) -> bị chặn 400 Bad Request
        send(post("/api/rental-contracts/" + contract.getId() + "/renew"), customerToken, Map.of(
                "months", 999
        )).andExpect(status().isBadRequest());

        // 6b. Customer gửi yêu cầu gia hạn 2 tháng (không gửi paid) -> chỉ tạo Payment PENDING, CHƯA cộng EndDate
        LocalDate oldEndDate = rentalContractRepository.findById(contract.getId()).orElseThrow().getEndDate();
        send(post("/api/rental-contracts/" + contract.getId() + "/renew"), customerToken, Map.of(
                "months", 2
        )).andExpect(status().isOk())
                .andExpect(jsonPath("$.endDate").value(oldEndDate.toString()));

        Payment pendingRenewal = paymentRepository
                .findFirstByRentalContract_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        contract.getId(), PaymentType.RENEWAL, PaymentStatus.PENDING)
                .orElseThrow();
        assertEquals(0, new BigDecimal("1900000.00").compareTo(pendingRenewal.getAmount()));

        // Chỉ khi Manager/Staff xác nhận PAID cho khoản RENEWAL -> EndDate mới được cộng thêm 2 tháng
        send(patch("/api/payments/" + pendingRenewal.getId() + "/paid?paymentMethod=BANK_TRANSFER"), managerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        LocalDate renewedEndDate = rentalContractRepository.findById(contract.getId()).orElseThrow().getEndDate();
        assertEquals(oldEndDate.plusMonths(2), renewedEndDate);

        // 7. Manager đánh dấu quá hạn -> Tạo Payment OVERDUE_FEE (PENDING)
        send(patch("/api/rental-contracts/" + contract.getId() + "/overdue"), managerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("OVERDUE"));

        assertTrue(paymentRepository.existsByRentalContract_IdAndPaymentTypeAndStatus(
                contract.getId(), PaymentType.OVERDUE_FEE, PaymentStatus.PENDING));

        // 8. BR-56: Gọi thẳng /complete khi chưa có UnitReturn -> bị chặn 400 Bad Request
        send(patch("/api/rental-contracts/" + contract.getId() + "/complete"), managerToken, null)
                .andExpect(status().isBadRequest());

        // 9. Trả kho qua POST /api/unit-returns -> Hợp đồng COMPLETED, Kho AVAILABLE, Tiền cọc (DEPOSIT) tự động chuyển sang REFUNDED
        send(post("/api/unit-returns"), staffToken, Map.of(
                "rentalContractId", contract.getId(),
                "hasDamage", false,
                "unitCondition", "Clean and intact"
        )).andExpect(status().isCreated())
                .andExpect(jsonPath("$.unitStatus").value("AVAILABLE"));

        assertEquals(ContractStatus.COMPLETED, rentalContractRepository.findById(contract.getId()).orElseThrow().getStatus());
        assertEquals(UnitStatus.AVAILABLE, storageUnitRepository.findById(unitA01.getId()).orElseThrow().getStatus());
        assertEquals(PaymentStatus.REFUNDED, paymentRepository.findById(depositPaymentId).orElseThrow().getStatus());
    }

    @Test
    @DisplayName("MEDIUM / LARGE unit without explicit DEPOSIT rule works without 500 rollback error")
    void largeUnitWithoutDepositRuleWorksCleanly() throws Exception {
        JsonNode created = json(send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(),
                "unitTypeId", largeType.getId(),
                "startDate", LocalDate.now().plusDays(1).toString(),
                "rentalMonths", 2
        )).andExpect(status().isCreated())
                .andExpect(jsonPath("$.estimatedAmount").value(6000000.0))
                .andExpect(jsonPath("$.depositAmount").value(3000000.0)));
        int resId = created.get("id").asInt();

        JsonNode assigned = json(send(patch("/api/reservations/" + resId + "/assign-unit"), managerToken, Map.of(
                "storageUnitId", unitLarge01.getId()
        )).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.pendingDepositPaymentId").isNumber()));
        int depId = assigned.get("pendingDepositPaymentId").asInt();

        send(patch("/api/payments/" + depId + "/paid?paymentMethod=CARD"), managerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.rentalContractId").isNumber());
    }

    @Test
    @DisplayName("DISCOUNT rules are applied to the rental total (percentage, fixed); expired rules are ignored; deposit follows the discounted total")
    void discountRulesAreAppliedToRentalTotal() throws Exception {
        // 10% cho SMALL (1.000.000 x 2 tháng = 2.000.000 -> 1.800.000); cọc SMALL là FIXED 500.000 nên không đổi
        seedDiscount(smallType, CalculationType.PERCENTAGE, null, new BigDecimal("10"), LocalDate.now().plusDays(30));
        JsonNode pct = json(send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(), "unitTypeId", smallType.getId(),
                "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", 2))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.estimatedAmount").value(1800000.0))
                .andExpect(jsonPath("$.depositAmount").value(500000.0)));
        assertEquals(1800000.0, pct.get("estimatedAmount").asDouble());

        // Giảm cố định 500.000 cho LARGE (3.000.000 x 2 = 6.000.000 -> 5.500.000); cọc mặc định 50% tổng đã giảm
        seedDiscount(largeType, CalculationType.FIXED, new BigDecimal("500000"), null, null);
        send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(), "unitTypeId", largeType.getId(),
                "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", 2))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.estimatedAmount").value(5500000.0))
                .andExpect(jsonPath("$.depositAmount").value(2750000.0));
    }

    @Test
    @DisplayName("Expired or oversized DISCOUNT never raises the price above the base or below zero")
    void expiredAndOversizedDiscounts() throws Exception {
        // rule hết hạn (hôm qua) không có tác dụng
        PriceRule expired = seedDiscount(smallType, CalculationType.PERCENTAGE, null, new BigDecimal("50"), LocalDate.now().minusDays(1));
        send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(), "unitTypeId", smallType.getId(),
                "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", 1))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.estimatedAmount").value(1000000.0));
        priceRuleRepository.delete(expired);
        // giảm cố định lớn hơn tổng tiền: tối thiểu 0, không âm
        seedDiscount(largeType, CalculationType.FIXED, new BigDecimal("99000000"), null, null);
        send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(), "unitTypeId", largeType.getId(),
                "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", 1))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.estimatedAmount").value(0.0));
    }

    @Test
    @DisplayName("Cancel reservation releases RESERVED storage unit back to AVAILABLE")
    void cancelReservationReleasesUnit() throws Exception {
        JsonNode created = json(send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(),
                "unitTypeId", smallType.getId(),
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

    private StorageUnit createUnit(UnitType type, String code, UnitStatus status) {
        StorageUnit u = new StorageUnit();
        u.setFacility(facility);
        u.setUnitType(type);
        u.setUnitCode(code);
        u.setStatus(status);
        return storageUnitRepository.save(u);
    }

    private PriceRule seedDiscount(UnitType type, CalculationType calc, BigDecimal amount, BigDecimal percentage, LocalDate effectiveTo) {
        PriceRule r = new PriceRule();
        r.setFacility(facility);
        r.setUnitType(type);
        r.setPriceType(PriceType.DISCOUNT);
        r.setCalculationType(calc);
        r.setAmount(amount);
        r.setPercentage(percentage);
        r.setEffectiveFrom(LocalDate.now().minusDays(10));
        r.setEffectiveTo(effectiveTo);
        r.setActive(true);
        return priceRuleRepository.save(r);
    }

    private void seedRule(UnitType type, PriceType priceType, CalculationType calc, BigDecimal amount) {
        PriceRule r = new PriceRule();
        r.setFacility(facility);
        r.setUnitType(type);
        r.setPriceType(priceType);
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
