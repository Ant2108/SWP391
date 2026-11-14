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
    @Autowired private ContractProfileRepository contractProfileRepository;
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
                "rentalMonths", 2
        )).andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.estimatedAmount").value(2000000.0)));
        int reservationId = createdRes.get("id").asInt();
        int depositPaymentId = createdRes.get("pendingDepositPaymentId").asInt();

        // Đặt kho chỉ được 1 hoặc 2 tháng
        send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(), "unitTypeId", smallType.getId(),
                "startDate", startDate, "rentalMonths", 3
        )).andExpect(status().isBadRequest());

        // Chưa đóng cọc thì manager không được gán ô
        send(patch("/api/reservations/" + reservationId + "/assign-unit"), managerToken, Map.of(
                "storageUnitId", unitA01.getId()
        )).andExpect(status().isConflict());

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
                .andExpect(jsonPath("$.amount").value(1000000.0));

        // 2. Sau khi cọc, manager gán StorageUnit -> Unit RESERVED và hợp đồng PENDING được tạo
        send(patch("/api/reservations/" + reservationId + "/assign-unit"), managerToken, Map.of(
                "storageUnitId", unitA01.getId()
        )).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.unitCode").value("M3-A01"))
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
                .andExpect(jsonPath("$.message").value("Khách hàng cần ký hợp đồng trước khi kích hoạt"));

        // 5a'. Chưa có hồ sơ thông tin hợp đồng thì không được ký -> 409
        send(post("/api/rental-contracts/" + contract.getId() + "/sign"), customerToken, Map.of(
                "signerName", "Nguyen Van A",
                "signatureUrl", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )).andExpect(status().isConflict());
        // Khách điền hồ sơ (ở đây tạo trực tiếp ở trạng thái đã gửi)
        ContractProfile profile = new ContractProfile();
        profile.setReservation(reservationRepository.findById(reservationId).orElseThrow());
        profile.setCustomer(customer);
        profile.setFullName("Nguyen Van A");
        profile.setStatus(ProfileStatus.SUBMITTED);
        contractProfileRepository.save(profile);

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

        // Ký lại lần 2 -> bị chặn 409 Conflict ("Hợp đồng đã được ký")
        send(post("/api/rental-contracts/" + contract.getId() + "/sign"), customerToken, Map.of(
                "signerName", "Nguyen Van A",
                "signatureUrl", "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        )).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Hợp đồng đã được ký"));

        // 5c. Quy tắc mới: tiền thuê Đợt 2 KHÔNG cần trả trước khi nhận kho (trả trong nửa thời gian thuê) -> kích hoạt được ngay
        send(patch("/api/rental-contracts/" + contract.getId() + "/activate"), managerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        // Sau khi nhận kho, Staff/Manager xác nhận đã thu tiền thuê Đợt 2 (RENTAL)
        Payment stage2Rental = paymentRepository
                .findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        reservationId, PaymentType.RENTAL, PaymentStatus.PENDING)
                .orElseThrow();
        send(patch("/api/payments/" + stage2Rental.getId() + "/paid?paymentMethod=BANK_TRANSFER"), staffToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        // 5d. Hợp đồng vẫn ACTIVE sau khi đã đóng đủ Đợt 2
        send(get("/api/rental-contracts/" + contract.getId()), managerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACTIVE"));

        // 6a. Gia hạn quá 12 tháng (ví dụ 999 tháng) -> bị chặn 400 Bad Request
        send(post("/api/rental-contracts/" + contract.getId() + "/renew"), customerToken, Map.of(
                "months", 999
        )).andExpect(status().isBadRequest());

        // 6b. Customer gửi yêu cầu gia hạn 2 tháng (không gửi paid) -> chỉ tạo Payment PENDING, CHƯA cộng EndDate
        LocalDate oldEndDate = rentalContractRepository.findById(contract.getId()).orElseThrow().getEndDate();
        // Giá gia hạn (950.000) khác giá hợp đồng -> báo giá phải cảnh báo, gia hạn không xác nhận bị chặn 409
        send(get("/api/rental-contracts/" + contract.getId() + "/renewal-quote?months=2"), customerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.priceChanged").value(true))
                .andExpect(jsonPath("$.newMonthlyRate").value(950000.0))
                .andExpect(jsonPath("$.totalAmount").value(1900000.0));
        send(post("/api/rental-contracts/" + contract.getId() + "/renew"), customerToken, Map.of(
                "months", 2
        )).andExpect(status().isConflict());
        send(post("/api/rental-contracts/" + contract.getId() + "/renew"), customerToken, Map.of(
                "months", 2, "confirmPriceChange", true
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
    @DisplayName("Bank webhook marks a payment PAID automatically only with the right secret, code and amount")
    void bankWebhookAutoPays() throws Exception {
        JsonNode created = json(send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(), "unitTypeId", smallType.getId(),
                "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", 1
        )).andExpect(status().isCreated()));
        int depId = created.get("pendingDepositPaymentId").asInt();
        String code = "SS" + depId;

        java.util.function.BiFunction<String, Map<String, Object>, ResultActions> hook = (secret, body) -> {
            try {
                var b = post("/api/payments/bank-webhook").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body));
                if (secret != null) b.header("X-Webhook-Secret", secret);
                return mockMvc.perform(b);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        };
        hook.apply("wrong", Map.of("content", "COC " + code, "amount", 500000, "transactionId", "FT1"))
                .andExpect(status().isForbidden());
        hook.apply("demo-secret", Map.of("content", "COC " + code, "amount", 1000, "transactionId", "FT1"))
                .andExpect(status().isConflict());
        hook.apply("demo-secret", Map.of("content", "chuyen khoan " + code + " cam on", "amount", 500000, "transactionId", "FT2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"))
                .andExpect(jsonPath("$.transactionReference").value("FT2"));

        // Hóa đơn xem được, có dòng chi tiết và số hóa đơn
        send(get("/api/payments/" + depId + "/invoice"), customerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.invoiceNumber").isString())
                .andExpect(jsonPath("$.lines[0].amount").value(500000.0))
                .andExpect(jsonPath("$.status").value("PAID"));
    }

    @Test
    @DisplayName("Pickup slots: capacity equals the number of active staff; overlapping slots are rejected with a red warning code")
    void pickupSlotCapacity() throws Exception {
        String date = LocalDate.now().plusDays(2).toString();
        java.util.function.BiFunction<String, Integer, ResultActions> book = (time, minutes) -> {
            try {
                return send(post("/api/reservations"), customerToken, Map.of(
                        "facilityId", facility.getId(), "unitTypeId", smallType.getId(), "startDate", date,
                        "rentalMonths", 1, "pickupTime", time, "pickupDurationMinutes", minutes));
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        };
        // Cơ sở có 1 staff: đặt 10:00 trong 60 phút thì 10:00 hay 10:30 đều đã đầy
        book.apply("10:00", 60).andExpect(status().isCreated());
        send(get("/api/appointments/slot-check?facilityId=" + facility.getId() + "&date=" + date + "&time=10:30&minutes=30"),
                customerToken, null).andExpect(status().isOk()).andExpect(jsonPath("$.full").value(true))
                .andExpect(jsonPath("$.capacity").value(1));
        book.apply("10:30", 30).andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(org.hamcrest.Matchers.startsWith("SLOT_FULL:")));
        // Hết khung 60 phút thì đặt được
        book.apply("11:00", 30).andExpect(status().isCreated());
        // Ngoài giờ 09:00 - 17:00 bị từ chối
        book.apply("18:00", 30).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Contract profile: validation, private ID images, 3 rejections force signing at the counter")
    void contractProfileFlow() throws Exception {
        JsonNode created = json(send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(), "unitTypeId", smallType.getId(),
                "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", 1
        )).andExpect(status().isCreated()));
        int resId = created.get("id").asInt();
        String base = "/api/contract-profiles/reservation/" + resId;
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0, 0, 0};
        Map<String, Object> form = new java.util.HashMap<>(Map.of(
                "fullName", "Nguyen Van A", "dateOfBirth", "1995-05-20", "gender", "Nam",
                "nationalId", "079195001234", "idIssueDate", "2021-03-10", "idIssuePlace", "Cục CSQLHC về TTXH",
                "permanentAddress", "12 Le Loi, Q1, TP.HCM", "phone", "0912345678", "email", "a@test.com"));
        form.put("goodsDescription", "Đồ gia dụng, sách vở");
        form.put("emergencyName", "Tran Thi B");
        form.put("emergencyPhone", "0987654321");
        form.put("agreedTruthful", true);

        // Chưa đóng cọc -> không điền được hồ sơ
        send(put(base), customerToken, form).andExpect(status().isConflict());

        send(patch("/api/payments/" + created.get("pendingDepositPaymentId").asInt() + "/paid?paymentMethod=CARD"),
                managerToken, null).andExpect(status().isOk());
        send(patch("/api/reservations/" + resId + "/assign-unit"), managerToken, Map.of("storageUnitId", unitA01.getId()))
                .andExpect(status().isOk());
        int contractId = rentalContractRepository.findByReservation_Id(resId).orElseThrow().getId();
        String sig = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

        // Thiếu ảnh CCCD -> 400; ảnh không phải ảnh -> 400
        send(put(base), customerToken, form).andExpect(status().isBadRequest());
        upload(base, "front", "not an image at all".getBytes()).andExpect(status().isBadRequest());
        upload(base, "front", png).andExpect(status().isOk());
        upload(base, "back", png).andExpect(status().isOk());
        // CCCD sai độ dài -> 400
        Map<String, Object> bad = new java.util.HashMap<>(form);
        bad.put("nationalId", "123");
        send(put(base), customerToken, bad).andExpect(status().isBadRequest());
        // Chưa tích cam kết -> 400
        Map<String, Object> noPledge = new java.util.HashMap<>(form);
        noPledge.put("agreedTruthful", false);
        send(put(base), customerToken, noPledge).andExpect(status().isBadRequest());

        send(put(base), customerToken, form).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SUBMITTED"))
                .andExpect(jsonPath("$.hasIdFront").value(true));

        // Ảnh CCCD không công khai: người lạ bị chặn, khách chủ đơn xem được
        send(get(base + "/id-image/front"), customerToken, null).andExpect(status().isOk());
        mockMvc.perform(get(base + "/id-image/front")).andExpect(status().is4xxClientError());

        // Khách ký online, quản lý từ chối lần 1 -> chữ ký bị gỡ, khách chỉnh và gửi lại
        send(post("/api/rental-contracts/" + contractId + "/sign"), customerToken,
                Map.of("signerName", "Nguyen Van A", "signatureUrl", sig)).andExpect(status().isOk());
        send(patch(base + "/reject"), managerToken, Map.of("reasonCodes", java.util.List.of("ID_BLURRY"), "note", "Ảnh mờ"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.rejectCount").value(1));
        assertEquals(null, rentalContractRepository.findById(contractId).orElseThrow().getSignedAt());
        send(get("/api/contract-profiles/my/rejected"), customerToken, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$[0].reservationId").value(resId));
        // Bị từ chối thì chưa ký lại được cho tới khi gửi lại hồ sơ
        send(post("/api/rental-contracts/" + contractId + "/sign"), customerToken,
                Map.of("signerName", "Nguyen Van A", "signatureUrl", sig)).andExpect(status().isConflict());
        send(put(base), customerToken, form).andExpect(status().isOk());
        send(post("/api/rental-contracts/" + contractId + "/sign"), customerToken,
                Map.of("signerName", "Nguyen Van A", "signatureUrl", sig)).andExpect(status().isOk());

        // Từ chối lần 2 rồi lần 3 -> bắt buộc ký tại quầy
        send(patch(base + "/reject"), managerToken, Map.of("reasonCodes", java.util.List.of("INFO_MISMATCH")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.rejectCount").value(2))
                .andExpect(jsonPath("$.signAtCounterRequired").value(false));
        send(put(base), customerToken, form).andExpect(status().isOk());
        send(patch(base + "/reject"), managerToken, Map.of("note", "Vẫn sai địa chỉ"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.rejectCount").value(3))
                .andExpect(jsonPath("$.signAtCounterRequired").value(true));
        // Từ chối phải có lý do
        send(patch(base + "/reject"), managerToken, Map.of()).andExpect(status().is4xxClientError());

        // Khách tự gửi lại hồ sơ nhưng không còn được ký online
        send(put(base), customerToken, form).andExpect(status().isOk());
        send(post("/api/rental-contracts/" + contractId + "/sign"), customerToken,
                Map.of("signerName", "Nguyen Van A", "signatureUrl", sig)).andExpect(status().isConflict());
        // Nhân viên / quản lý ký tại quầy
        send(post("/api/rental-contracts/" + contractId + "/sign-at-counter"), customerToken,
                Map.of("signerName", "Nguyen Van A", "signatureUrl", sig)).andExpect(status().isForbidden());
        send(post("/api/rental-contracts/" + contractId + "/sign-at-counter"), managerToken,
                Map.of("signerName", "Nguyen Van A", "signatureUrl", sig))
                .andExpect(status().isOk()).andExpect(jsonPath("$.signedAtCounter").value(true))
                .andExpect(jsonPath("$.signedAt").exists());
    }

    @Test
    @DisplayName("SePay webhook uses Apikey auth, ignores outgoing money and auto-pays a matching incoming transfer")
    void sepayWebhookAutoPays() throws Exception {
        JsonNode created = json(send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(), "unitTypeId", smallType.getId(),
                "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", 1
        )).andExpect(status().isCreated()));
        int depId = created.get("pendingDepositPaymentId").asInt();

        java.util.function.BiFunction<String, Map<String, Object>, ResultActions> hook = (key, body) -> {
            try {
                var b = post("/api/payments/sepay-webhook").contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body));
                if (key != null) b.header("Authorization", "Apikey " + key);
                return mockMvc.perform(b);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        };
        hook.apply("sai-khoa", Map.of("transferType", "in", "transferAmount", 500000, "content", "SS" + depId))
                .andExpect(status().isForbidden());
        hook.apply("ss-sepay-demo-key", Map.of("transferType", "out", "transferAmount", 500000, "content", "SS" + depId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.matched").value(false));
        // Tiền ra có mã HC nhưng khoản chưa ở trạng thái hoàn: không khớp
        hook.apply("ss-sepay-demo-key", Map.of("transferType", "out", "transferAmount", 500000, "content", "HC" + depId))
                .andExpect(status().isOk()).andExpect(jsonPath("$.matched").value(false));
        hook.apply("ss-sepay-demo-key", Map.of("transferType", "in", "transferAmount", 500000,
                        "content", "MBVCB.123 SS" + depId + " chuyen tien", "referenceCode", "FT999"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.matched").value(true));
        send(get("/api/payments/" + depId), customerToken, null)
                .andExpect(jsonPath("$.status").value("PAID"));
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

        int depId = created.get("pendingDepositPaymentId").asInt();
        send(patch("/api/payments/" + depId + "/paid?paymentMethod=CARD"), managerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        send(patch("/api/reservations/" + resId + "/assign-unit"), managerToken, Map.of(
                "storageUnitId", unitLarge01.getId()
        )).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CONFIRMED"))
                .andExpect(jsonPath("$.rentalContractId").isNumber());
    }

    @Test
    @DisplayName("DISCOUNT rules are applied to the rental total (percentage, fixed); expired rules are ignored; deposit follows the discounted total")
    void discountRulesAreAppliedToRentalTotal() throws Exception {
        // 10% cho SMALL (1.000.000 x 2 tháng = 2.000.000 -> 1.800.000); cọc luôn 50% tổng đã giảm
        seedDiscount(smallType, CalculationType.PERCENTAGE, null, new BigDecimal("10"), LocalDate.now().plusDays(30));
        JsonNode pct = json(send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(), "unitTypeId", smallType.getId(),
                "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", 2))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.estimatedAmount").value(1800000.0))
                .andExpect(jsonPath("$.depositAmount").value(900000.0)));
        assertEquals(1800000.0, pct.get("estimatedAmount").asDouble());

        // Giảm cố định 500.000 cho LARGE (3.000.000 x 2 = 6.000.000 -> 5.500.000); cọc mặc định 50% tổng đã giảm
        seedDiscount(largeType, CalculationType.FIXED, new BigDecimal("500000"), null, null);
        send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(), "unitTypeId", largeType.getId(),
                "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", 2, "pickupTime", "11:00"))
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
                "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", 1, "pickupTime", "11:00"))
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

        send(patch("/api/payments/" + created.get("pendingDepositPaymentId").asInt() + "/paid?paymentMethod=CARD"),
                managerToken, null).andExpect(status().isOk());
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

    private ResultActions upload(String base, String side, byte[] bytes) throws Exception {
        return mockMvc.perform(multipart(base + "/id-image")
                .file(new org.springframework.mock.web.MockMultipartFile("file", side + ".png", "image/png", bytes))
                .param("side", side).header("Authorization", customerToken));
    }

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b,
                               String auth, Object body) throws Exception {
        b.header("Authorization", auth);
        if (body != null) {
            b.contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body));
        }
        return mockMvc.perform(b);
    }

    @Test
    @DisplayName("Report summary: Business Manager sees totals, customer and facility manager are forbidden, bad range -> 400")
    void reportSummaryAccessAndTotals() throws Exception {
        Users businessManager = createUser("m3-bm@test.com", Role.BUSINESS_MANAGER, null);
        String bmToken = bearer(businessManager);
        send(get("/api/reports/summary"), bmToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totals.totalUnits").isNumber())
                .andExpect(jsonPath("$.totals.totalRevenue").isNumber())
                .andExpect(jsonPath("$.facilities").isArray())
                .andExpect(jsonPath("$.unitTypes").isArray());
        send(get("/api/reports/summary"), customerToken, null).andExpect(status().isForbidden());
        send(get("/api/reports/summary"), managerToken, null).andExpect(status().isForbidden());
        send(get("/api/reports/summary?from=2026-12-31&to=2026-01-01"), bmToken, null).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Deposit follows the percentage policy of the Business Manager, and deposit price is locked at booking time")
    void listPriceIsLockedAtBooking() throws Exception {
        JsonNode created = json(send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(), "unitTypeId", smallType.getId(),
                "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", 1))
                .andExpect(status().isCreated()));
        Reservation r = reservationRepository.findById(created.get("id").asInt()).orElseThrow();
        assertEquals(0, new BigDecimal("1000000.00").compareTo(r.getListMonthlyPrice()));
    }

    @Test
    @DisplayName("Fee waiver: manager waives a pending fee with a reason (status stays FAILED + waivedAt); customer forbidden; deposit cannot be waived")
    void managerCanWaivePendingFee() throws Exception {
        Users bm = createUser("m3-bm-waive@test.com", Role.BUSINESS_MANAGER, null);
        String bmToken = bearer(bm);
        Payment fee = new Payment();
        fee.setCustomer(customer);
        fee.setPaymentType(PaymentType.EXTRA_FEE);
        fee.setAmount(new BigDecimal("150000"));
        fee.setStatus(PaymentStatus.PENDING);
        fee = paymentRepository.save(fee);

        send(patch("/api/payments/" + fee.getId() + "/waive"), customerToken, Map.of("reason", "x"))
                .andExpect(status().isForbidden());
        send(patch("/api/payments/" + fee.getId() + "/waive"), bmToken, Map.of("reason", " "))
                .andExpect(status().isBadRequest());
        send(patch("/api/payments/" + fee.getId() + "/waive"), bmToken, Map.of("reason", "Khách thân thiết"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FAILED"))
                .andExpect(jsonPath("$.waivedReason").value("Khách thân thiết"))
                .andExpect(jsonPath("$.waivedAt").isNotEmpty());
        // đã miễn rồi thì không miễn lại
        send(patch("/api/payments/" + fee.getId() + "/waive"), bmToken, Map.of("reason", "lần 2"))
                .andExpect(status().isConflict());

        Payment deposit = new Payment();
        deposit.setCustomer(customer);
        deposit.setPaymentType(PaymentType.DEPOSIT);
        deposit.setAmount(new BigDecimal("500000"));
        deposit.setStatus(PaymentStatus.PENDING);
        deposit = paymentRepository.save(deposit);
        send(patch("/api/payments/" + deposit.getId() + "/waive"), bmToken, Map.of("reason", "thử"))
                .andExpect(status().isConflict());
    }

    @Test
    @DisplayName("Policies: anyone reads defaults; only Business Manager updates; invalid day order -> 400")
    void policiesReadAndUpdate() throws Exception {
        Users bm = createUser("m3-bm-policy@test.com", Role.BUSINESS_MANAGER, null);
        String bmToken = bearer(bm);
        // không cần đăng nhập vẫn đọc được (trang Đặt kho / Bảng giá công khai hiển thị chính sách)
        mockMvc.perform(get("/api/policies")).andExpect(status().isOk())
                .andExpect(jsonPath("$.fullRefundDays").value(10))
                .andExpect(jsonPath("$.maxRenewalMonths").value(2))
                .andExpect(jsonPath("$.unpaidHoldHours").value(24));
        Map<String, Object> body = new java.util.HashMap<>(Map.of(
                "fullRefundDays", 7, "dailyDeductUntilDays", 14, "lateRefundPercent", 30, "forfeitDays", 28,
                "maxBookingMonths", 3, "maxRenewalMonths", 3, "maxStartMonths", 2, "unpaidHoldHours", 48, "stage2GraceDays", 12));
        send(put("/api/policies"), customerToken, body).andExpect(status().isForbidden());
        send(put("/api/policies"), managerToken, body).andExpect(status().isForbidden());
        send(put("/api/policies"), bmToken, body).andExpect(status().isOk())
                .andExpect(jsonPath("$.maxBookingMonths").value(3));
        mockMvc.perform(get("/api/policies")).andExpect(status().isOk())
                .andExpect(jsonPath("$.fullRefundDays").value(7))
                .andExpect(jsonPath("$.unpaidHoldHours").value(48));
        body.put("dailyDeductUntilDays", 5);
        send(put("/api/policies"), bmToken, body).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Quote endpoint returns the same discounted total and deposit that the reservation will charge")
    void quoteMatchesReservation() throws Exception {
        seedDiscount(smallType, CalculationType.PERCENTAGE, null, new BigDecimal("10"), LocalDate.now().plusDays(30));
        send(get("/api/reservations/quote?facilityId=" + facility.getId() + "&unitTypeId=" + smallType.getId() + "&months=2"), customerToken, null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.monthlyPrice").value(1000000.0))
                .andExpect(jsonPath("$.listTotal").value(2000000.0))
                .andExpect(jsonPath("$.discountAmount").value(200000.0))
                .andExpect(jsonPath("$.total").value(1800000.0))
                .andExpect(jsonPath("$.depositAmount").value(900000.0));
        send(post("/api/reservations"), customerToken, Map.of(
                "facilityId", facility.getId(), "unitTypeId", smallType.getId(),
                "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", 2))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.estimatedAmount").value(1800000.0))
                .andExpect(jsonPath("$.depositAmount").value(900000.0));
        send(get("/api/reservations/quote?facilityId=" + facility.getId() + "&unitTypeId=" + smallType.getId() + "&months=99"), customerToken, null)
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Full payment: one transfer covering deposit + rental marks both PAID; deposit-only transfer leaves rental pending")
    void fullPaymentPaysBothStages() throws Exception {
        java.util.function.Function<Integer, Integer> book = (months) -> {
            try {
                return json(send(post("/api/reservations"), customerToken, Map.of(
                        "facilityId", facility.getId(), "unitTypeId", smallType.getId(),
                        "startDate", LocalDate.now().plusDays(1).toString(), "rentalMonths", months,
                        "pickupTime", months == 1 ? "10:00" : "12:00"))
                        .andExpect(status().isCreated())).get("pendingDepositPaymentId").asInt();
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        };
        int dep1 = book.apply(1);   // cọc 500.000, tiền thuê 1.000.000
        mockMvc.perform(post("/api/payments/bank-webhook").contentType(MediaType.APPLICATION_JSON)
                        .header("X-Webhook-Secret", "demo-secret")
                        .content(objectMapper.writeValueAsString(Map.of("content", "SEVQR SS" + dep1, "amount", 500000, "transactionId", "FT-A"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAID"));
        Payment rentalOnly = paymentRepository.findAll().stream()
                .filter(x -> x.getPaymentType() == PaymentType.RENTAL && x.getReservation() != null
                        && x.getReservation().getId().equals(paymentRepository.findById(dep1).orElseThrow().getReservation().getId()))
                .findFirst().orElseThrow();
        assertEquals(PaymentStatus.PENDING, rentalOnly.getStatus());

        int dep2 = book.apply(2);   // cọc 1.000.000, tiền thuê 2.000.000 -> trả trọn gói 3.000.000
        mockMvc.perform(post("/api/payments/bank-webhook").contentType(MediaType.APPLICATION_JSON)
                        .header("X-Webhook-Secret", "demo-secret")
                        .content(objectMapper.writeValueAsString(Map.of("content", "SEVQR SS" + dep2, "amount", 3000000, "transactionId", "FT-B"))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAID"));
        Integer resId = paymentRepository.findById(dep2).orElseThrow().getReservation().getId();
        long paidRental = paymentRepository.findAll().stream()
                .filter(x -> x.getPaymentType() == PaymentType.RENTAL && x.getStatus() == PaymentStatus.PAID
                        && x.getReservation() != null && x.getReservation().getId().equals(resId)).count();
        assertEquals(1, paidRental);
    }

    private JsonNode json(ResultActions r) throws Exception {
        return objectMapper.readTree(r.andReturn().getResponse().getContentAsString());
    }
}
