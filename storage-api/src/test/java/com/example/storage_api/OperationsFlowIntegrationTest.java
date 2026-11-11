package com.example.storage_api;

import com.example.storage_api.entity.*;
import com.example.storage_api.reponsitory.*;
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
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Test tích hợp module Appointment / UnitReturn / SupportRequest (H2, mỗi test rollback).
 * Dữ liệu Reservation/Contract/Payment dựng trực tiếp bằng repository (entity tạm của Member 3).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("test")
@Transactional
class OperationsFlowIntegrationTest {

    @Autowired private WebApplicationContext webApplicationContext;
    @Autowired private FilterChainProxy filterChainProxy;
    @Autowired private UsersRepository usersRepository;
    @Autowired private FacilityRepository facilityRepository;
    @Autowired private UnitTypeRepository unitTypeRepository;
    @Autowired private StorageUnitRepository storageUnitRepository;
    @Autowired private ReservationRepository reservationRepository;
    @Autowired private RentalContractRepository rentalContractRepository;
    @Autowired private PaymentRepository paymentRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private JwtService jwtService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private ObjectMapper objectMapper;

    private MockMvc mockMvc;

    private Facility facilityA;
    private Facility facilityB;
    private Users customer;
    private Users otherCustomer;
    private Users staff;
    private Users managerA;
    private Users managerB;
    private Users staffB;
    private Users admin;
    private String customerToken;
    private String otherCustomerToken;
    private String staffToken;
    private String staffBToken;
    private String managerToken;
    private String managerBToken;
    private String adminToken;

    private UnitType unitType;
    // Kịch bản check-in: reservation CONFIRMED + unit RESERVED + cọc PAID + contract PENDING.
    private StorageUnit checkInUnit;
    private Reservation checkInReservation;
    private RentalContract pendingContract;
    // Kịch bản return/support: contract ACTIVE + unit OCCUPIED.
    private StorageUnit activeUnit;
    private RentalContract activeContract;
    private Payment rentalPayment;

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders.webAppContextSetup(webApplicationContext).addFilters(filterChainProxy).build();

        facilityA = facility("Ops Facility A");
        facilityB = facility("Ops Facility B");

        customer = user("ops-customer@test.com", Role.CUSTOMER, null);
        otherCustomer = user("ops-customer2@test.com", Role.CUSTOMER, null);
        staff = user("ops-staff@test.com", Role.FACILITY_STAFF, facilityA);
        managerA = user("ops-manager@test.com", Role.FACILITY_MANAGER, facilityA);
        staffB = user("ops-staffb@test.com", Role.FACILITY_STAFF, facilityB);
        managerB = user("ops-managerb@test.com", Role.FACILITY_MANAGER, facilityB);
        admin = user("ops-admin@test.com", Role.SYSTEM_ADMIN, null);
        customerToken = token(customer);
        otherCustomerToken = token(otherCustomer);
        staffToken = token(staff);
        staffBToken = token(staffB);
        managerToken = token(managerA);
        managerBToken = token(managerB);
        adminToken = token(admin);

        unitType = new UnitType();
        unitType.setFacility(facilityA);
        unitType.setTypeName("OPS-SMALL");
        unitType = unitTypeRepository.save(unitType);

        checkInUnit = unit("OPS-A01", UnitStatus.RESERVED);
        checkInReservation = reservation(checkInUnit, ReservationStatus.CONFIRMED);
        deposit(checkInReservation, PaymentStatus.PAID);
        pendingContract = contract(checkInReservation, checkInUnit, ContractStatus.PENDING);
        rentalPayment = rental(checkInReservation, pendingContract, PaymentStatus.PENDING);

        activeUnit = unit("OPS-B01", UnitStatus.OCCUPIED);
        Reservation activeRes = reservation(activeUnit, ReservationStatus.COMPLETED);
        activeContract = contract(activeRes, activeUnit, ContractStatus.ACTIVE);
    }

    // ===================== CHECK-IN =====================

    @Test
    @DisplayName("Check-in: customer books, manager assigns, staff completes -> contract ACTIVE, unit OCCUPIED")
    void checkInFlow() throws Exception {
        int appointmentId = createCheckIn(customerToken)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("SCHEDULED"))
                .andExpect(jsonPath("$.staffId").doesNotExist())
                .andExpect(jsonPath("$.facilityId").value(facilityA.getId()))
                .andReturn().getResponse().getContentAsString().transform(this::idOf);

        // Đặt trùng khi lịch cũ còn SCHEDULED -> 409.
        createCheckIn(customerToken).andExpect(status().isConflict());

        // Staff chưa được gán -> 403.
        complete(staffToken, appointmentId, true).andExpect(status().isForbidden());

        patchJson(managerToken, "/api/appointments/" + appointmentId + "/assign", Map.of("staffId", staff.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.staffId").value(staff.getId()));

        // Chưa xác nhận đã giao chìa khóa -> 400.
        complete(staffToken, appointmentId, false).andExpect(status().isBadRequest());

        // Đợt 2 (tiền thuê) chưa thu -> chưa được check-in.
        complete(staffToken, appointmentId, true).andExpect(status().isBadRequest());
        assertEquals(ContractStatus.PENDING, rentalContractRepository.findById(pendingContract.getId()).orElseThrow().getStatus());

        // Khách trả nốt tại quầy, staff đánh dấu đã thu rồi mới check-in được.
        patchJson(staffToken, "/api/payments/" + rentalPayment.getId() + "/paid?paymentMethod=CASH", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        // Khách chưa ký hợp đồng -> chưa được check-in.
        complete(staffToken, appointmentId, true).andExpect(status().isBadRequest());
        assertEquals(ContractStatus.PENDING, rentalContractRepository.findById(pendingContract.getId()).orElseThrow().getStatus());
        RentalContract toSign = rentalContractRepository.findById(pendingContract.getId()).orElseThrow();
        toSign.setSignedAt(LocalDateTime.now());
        toSign.setSignerName("Customer");
        rentalContractRepository.save(toSign);

        complete(staffToken, appointmentId, true)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));

        assertEquals(ReservationStatus.COMPLETED, reservationRepository.findById(checkInReservation.getId()).orElseThrow().getStatus());
        assertEquals(ContractStatus.ACTIVE, rentalContractRepository.findById(pendingContract.getId()).orElseThrow().getStatus());
        assertEquals(UnitStatus.OCCUPIED, storageUnitRepository.findById(checkInUnit.getId()).orElseThrow().getStatus());

        // Đã COMPLETED thì không hoàn tất lại được.
        complete(staffToken, appointmentId, true).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Check-in rejected when reservation not CONFIRMED / deposit unpaid / not the customer's")
    void checkInPreconditions() throws Exception {
        Reservation unpaid = reservation(unit("OPS-A02", UnitStatus.RESERVED), ReservationStatus.CONFIRMED);
        postJson(customerToken, "/api/appointments", checkInBody(unpaid.getId()))
                .andExpect(status().isBadRequest());

        Reservation pending = reservation(unit("OPS-A03", UnitStatus.AVAILABLE), ReservationStatus.PENDING);
        deposit(pending, PaymentStatus.PAID);
        postJson(customerToken, "/api/appointments", checkInBody(pending.getId()))
                .andExpect(status().isBadRequest());

        // Reservation của người khác -> như không tồn tại.
        postJson(otherCustomerToken, "/api/appointments", checkInBody(checkInReservation.getId()))
                .andExpect(status().isNotFound());

        // Giờ hẹn ở quá khứ -> 400.
        postJson(customerToken, "/api/appointments", Map.of(
                "appointmentType", "CHECK_IN",
                "reservationId", checkInReservation.getId(),
                "scheduledAt", LocalDateTime.now().minusDays(1).withNano(0).toString()))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Cancel: customer cancels own SCHEDULED appointment; staff cannot; others cannot see it")
    void cancelRules() throws Exception {
        int id = createCheckIn(customerToken).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString().transform(this::idOf);

        patchJson(staffToken, "/api/appointments/" + id + "/cancel", null).andExpect(status().isForbidden());
        patchJson(otherCustomerToken, "/api/appointments/" + id + "/cancel", null).andExpect(status().isNotFound());
        patchJson(managerBToken, "/api/appointments/" + id + "/cancel", null).andExpect(status().isForbidden());

        patchJson(customerToken, "/api/appointments/" + id + "/cancel", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
        // Hủy rồi thì không hủy / đổi nữa, và được đặt lịch mới.
        patchJson(customerToken, "/api/appointments/" + id + "/cancel", null).andExpect(status().isBadRequest());
        createCheckIn(customerToken).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("Assign: staff must be active staff of the same facility; manager of another facility is rejected")
    void assignRules() throws Exception {
        int id = createCheckIn(customerToken).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString().transform(this::idOf);

        patchJson(managerToken, "/api/appointments/" + id + "/assign", Map.of("staffId", staffB.getId()))
                .andExpect(status().isBadRequest());
        patchJson(managerToken, "/api/appointments/" + id + "/assign", Map.of("staffId", customer.getId()))
                .andExpect(status().isBadRequest());
        patchJson(managerBToken, "/api/appointments/" + id + "/assign", Map.of("staffId", staffB.getId()))
                .andExpect(status().isForbidden());
        patchJson(staffToken, "/api/appointments/" + id + "/assign", Map.of("staffId", staff.getId()))
                .andExpect(status().isForbidden());
    }

    // ===================== NO-SHOW =====================

    @Test
    @DisplayName("No-show: staff only reports (status unchanged), manager decides")
    void noShowFlow() throws Exception {
        int id = createCheckIn(customerToken).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString().transform(this::idOf);
        patchJson(managerToken, "/api/appointments/" + id + "/assign", Map.of("staffId", staff.getId())).andExpect(status().isOk());

        // Staff không được tự đánh no-show / hủy.
        patchJson(staffToken, "/api/appointments/" + id + "/no-show", null).andExpect(status().isForbidden());

        postJson(staffToken, "/api/appointments/" + id + "/report-no-show", Map.of("note", "Customer did not arrive"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SCHEDULED"))
                .andExpect(jsonPath("$.noShowReported").value(true));

        // Manager thấy trong danh sách cần xử lý; staff cơ sở khác không báo được.
        mockMvc.perform(get("/api/appointments?noShowReported=true").header("Authorization", bearer(managerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(id));
        postJson(staffBToken, "/api/appointments/" + id + "/report-no-show", Map.of("note", "x"))
                .andExpect(status().isForbidden());

        patchJson(managerToken, "/api/appointments/" + id + "/no-show", null)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("NO_SHOW"));
    }

    @Test
    @DisplayName("No-show: manager can reschedule after a report, which clears the warning")
    void rescheduleAfterNoShow() throws Exception {
        int id = createCheckIn(customerToken).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString().transform(this::idOf);
        patchJson(managerToken, "/api/appointments/" + id + "/assign", Map.of("staffId", staff.getId())).andExpect(status().isOk());
        postJson(staffToken, "/api/appointments/" + id + "/report-no-show", Map.of("note", "Not here"))
                .andExpect(status().isOk());

        patchJson(managerToken, "/api/appointments/" + id + "/reschedule",
                Map.of("scheduledAt", LocalDateTime.now().plusDays(3).withNano(0).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SCHEDULED"))
                .andExpect(jsonPath("$.noShowReported").value(false));
    }

    // ===================== LỊCH NHẬN KHO TỰ SINH THEO ĐƠN ĐẶT KHO =====================

    @Autowired private com.example.storage_api.service.AppointmentService appointmentService;

    @Test
    @DisplayName("Auto check-in appointment: one per reservation, shows order info and status NOT_PAID -> HOLDING, closes on cancel")
    void autoCheckInAppointment() throws Exception {
        // Đơn mới chưa trả cọc: lịch lấy ngày nhận kho của đơn, giờ 09:00.
        Reservation fresh = reservation(unit("OPS-A09", UnitStatus.AVAILABLE), ReservationStatus.PENDING);
        appointmentService.createForReservation(fresh);
        appointmentService.createForReservation(fresh); // gọi lại không sinh trùng

        String body = mockMvc.perform(get("/api/appointments/my").header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        var all = objectMapper.readTree(body);
        var mine = new java.util.ArrayList<com.fasterxml.jackson.databind.JsonNode>();
        all.forEach(n -> { if (n.get("reservationId").asInt() == fresh.getId()) mine.add(n); });
        assertEquals(1, mine.size());
        var a = mine.get(0);
        assertEquals("SCHEDULED", a.get("status").asText());
        assertEquals("NOT_PAID", a.get("displayStatus").asText());
        assertEquals(fresh.getStartDate().atTime(9, 0).toString(), a.get("scheduledAt").asText().substring(0, 16));
        assertEquals("Ops Facility A", a.get("facilityName").asText());
        assertEquals("1 Test Street", a.get("facilityAddress").asText());
        assertTrue(a.get("orderedAt") != null && !a.get("orderedAt").isNull());
        assertEquals(false, a.get("depositPaid").asBoolean());

        // Trả cọc đợt 1 -> đang giữ kho.
        deposit(fresh, PaymentStatus.PAID);
        mockMvc.perform(get("/api/appointments/" + a.get("id").asInt()).header("Authorization", bearer(managerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.displayStatus").value("HOLDING"))
                .andExpect(jsonPath("$.depositPaid").value(true))
                .andExpect(jsonPath("$.rentalPaid").value(false));

        // Hủy đơn / đơn hết hạn -> lịch tự đóng.
        appointmentService.cancelForReservation(fresh);
        mockMvc.perform(get("/api/appointments/" + a.get("id").asInt()).header("Authorization", bearer(managerToken)))
                .andExpect(jsonPath("$.status").value("CANCELLED"))
                .andExpect(jsonPath("$.displayStatus").value("CANCELLED"));
    }

    @Test
    @DisplayName("Stale check-in appointments are closed once the order is completed (e.g. handed over via Activate contract)")
    void closeStaleCheckIns() throws Exception {
        int id = createCheckIn(customerToken).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString().transform(this::idOf);
        // Khách đã nhận kho bằng đường khác: đơn chuyển COMPLETED nhưng lịch vẫn SCHEDULED.
        checkInReservation.setStatus(ReservationStatus.COMPLETED);
        reservationRepository.save(checkInReservation);

        assertEquals(1, appointmentService.closeStaleCheckIns());
        mockMvc.perform(get("/api/appointments/" + id).header("Authorization", bearer(managerToken)))
                .andExpect(jsonPath("$.status").value("COMPLETED"));
        assertEquals(0, appointmentService.closeStaleCheckIns()); // chạy lại không đổi gì
    }

    @Test
    @DisplayName("Backfill: reservations without a check-in appointment get one when the customer opens the list")
    void backfillOnMyAppointments() throws Exception {
        Reservation legacy = reservation(unit("OPS-A08", UnitStatus.AVAILABLE), ReservationStatus.PENDING);
        mockMvc.perform(get("/api/appointments/my").header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.reservationId==" + legacy.getId() + ")].appointmentType").value("CHECK_IN"));
        // Mở lần nữa không sinh thêm lịch.
        var again = objectMapper.readTree(mockMvc.perform(get("/api/appointments/my").header("Authorization", bearer(customerToken)))
                .andReturn().getResponse().getContentAsString());
        long count = 0;
        for (var n : again) { if (n.get("reservationId").asInt() == legacy.getId()) count++; }
        assertEquals(1, count);
    }

    @Test
    @DisplayName("Reschedule check-in: only the manager, not past, up to one month after the order date; the order's start date stays as booked")
    void rescheduleCheckInLimit() throws Exception {
        int id = createCheckIn(customerToken).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString().transform(this::idOf);

        LocalDate max = LocalDate.now().plusMonths(1);
        patchJson(staffToken, "/api/appointments/" + id + "/reschedule",
                Map.of("scheduledAt", LocalDateTime.now().plusDays(3).withNano(0).toString()))
                .andExpect(status().isForbidden());
        patchJson(managerToken, "/api/appointments/" + id + "/reschedule",
                Map.of("scheduledAt", max.plusDays(1).atTime(9, 0).toString()))
                .andExpect(status().isBadRequest());
        patchJson(managerToken, "/api/appointments/" + id + "/reschedule",
                Map.of("scheduledAt", max.atTime(14, 30).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.maxHandoverDate").value(max.toString()));
        // Ngày nhận kho trên đơn (= ngày bắt đầu hợp đồng) giữ nguyên, chỉ lịch hẹn đổi.
        assertEquals(checkInReservation.getStartDate(),
                reservationRepository.findById(checkInReservation.getId()).orElseThrow().getStartDate());
    }

    // ===================== LIST / TODAY =====================

    @Test
    @DisplayName("Today and list are limited to the caller's facility and assignments")
    void listScoping() throws Exception {
        // Lịch phải nằm trong HÔM NAY: nếu chạy test sát nửa đêm thì "5 phút nữa" rơi sang ngày mai, nên dùng ngay bây giờ.
        LocalDateTime soon = LocalDateTime.now().plusMinutes(5);
        if (!soon.toLocalDate().equals(LocalDate.now())) {
            soon = LocalDateTime.now();
        }
        int id = postJson(customerToken, "/api/appointments", checkInBodyAt(checkInReservation.getId(), soon))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString().transform(this::idOf);
        patchJson(managerToken, "/api/appointments/" + id + "/assign", Map.of("staffId", staff.getId())).andExpect(status().isOk());

        mockMvc.perform(get("/api/appointments/today").header("Authorization", bearer(staffToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/appointments/today").header("Authorization", bearer(staffBToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/appointments").header("Authorization", bearer(managerBToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/appointments?facilityId=" + facilityA.getId()).header("Authorization", bearer(managerBToken)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/appointments").header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/appointments/my").header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/appointments/my").header("Authorization", bearer(otherCustomerToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        // Customer không gọi được danh sách của staff; chi tiết lịch của người khác -> 404.
        mockMvc.perform(get("/api/appointments").header("Authorization", bearer(customerToken)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/appointments/" + id).header("Authorization", bearer(otherCustomerToken)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/appointments/" + id)).andExpect(status().isUnauthorized());
    }

    // ===================== RETURN =====================

    @Test
    @DisplayName("Return without damage: unit AVAILABLE, contract COMPLETED, RETURN appointment closed")
    void returnWithoutDamage() throws Exception {
        int apptId = postJson(customerToken, "/api/appointments", Map.of(
                "appointmentType", "RETURN",
                "rentalContractId", activeContract.getId(),
                "scheduledAt", LocalDateTime.now().plusDays(1).withNano(0).toString()))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString().transform(this::idOf);
        // RETURN không hoàn tất qua /complete.
        patchJson(managerToken, "/api/appointments/" + apptId + "/assign", Map.of("staffId", staff.getId())).andExpect(status().isOk());
        complete(staffToken, apptId, true).andExpect(status().isBadRequest());

        postJson(staffToken, "/api/unit-returns", Map.of(
                "rentalContractId", activeContract.getId(),
                "hasDamage", false,
                "unitCondition", "Clean and empty"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.unitStatus").value("AVAILABLE"))
                .andExpect(jsonPath("$.hasDamage").value(false))
                .andExpect(jsonPath("$.damagePaymentId").doesNotExist());

        assertEquals(UnitStatus.AVAILABLE, storageUnitRepository.findById(activeUnit.getId()).orElseThrow().getStatus());
        assertEquals(ContractStatus.COMPLETED, rentalContractRepository.findById(activeContract.getId()).orElseThrow().getStatus());
        mockMvc.perform(get("/api/appointments/" + apptId).header("Authorization", bearer(managerToken)))
                .andExpect(jsonPath("$.status").value("COMPLETED"));
        assertTrue(paymentRepository.findAll().stream().noneMatch(p -> p.getPaymentType() == PaymentType.DAMAGE_FEE));

        // Trả lần hai -> hợp đồng đã COMPLETED nên bị từ chối.
        postJson(staffToken, "/api/unit-returns", Map.of("rentalContractId", activeContract.getId(), "hasDamage", false))
                .andExpect(status().isBadRequest());
    }

    private int reportDamage(RentalContract c, List<String> items, String description) throws Exception {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("rentalContractId", c.getId());
        body.put("hasDamage", true);
        body.put("damageItems", items);
        if (description != null) {
            body.put("damageDescription", description);
        }
        return postJson(staffToken, "/api/unit-returns", body)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.unitStatus").value("MAINTENANCE"))
                .andExpect(jsonPath("$.damageStatus").value("REPORTED"))
                .andExpect(jsonPath("$.damageFee").doesNotExist())
                .andExpect(jsonPath("$.damagePaymentId").doesNotExist())
                .andReturn().getResponse().getContentAsString().transform(this::idOf);
    }

    @Test
    @DisplayName("Return with damage: staff only ticks the damage (no fee); unit MAINTENANCE, managers are told, no bill yet")
    void returnWithDamageReport() throws Exception {
        // Phải tích ít nhất một loại hoặc mô tả; chọn OTHER thì phải mô tả.
        postJson(staffToken, "/api/unit-returns", Map.of("rentalContractId", activeContract.getId(), "hasDamage", true))
                .andExpect(status().isBadRequest());
        postJson(staffToken, "/api/unit-returns", Map.of("rentalContractId", activeContract.getId(), "hasDamage", true,
                "damageItems", List.of("OTHER")))
                .andExpect(status().isBadRequest());

        // Staff cơ sở khác / customer / manager đều không lập được biên bản.
        Map<String, Object> body = Map.of("rentalContractId", activeContract.getId(), "hasDamage", true,
                "damageItems", List.of("DOOR", "LOCK"));
        postJson(staffBToken, "/api/unit-returns", body).andExpect(status().isForbidden());
        postJson(customerToken, "/api/unit-returns", body).andExpect(status().isForbidden());
        postJson(managerToken, "/api/unit-returns", body).andExpect(status().isForbidden());

        long managerBefore = notificationRepository.countByUser_IdAndReadFalse(managerA.getId());
        int returnId = reportDamage(activeContract, List.of("DOOR", "LOCK"), "Door dented, lock stiff");

        assertEquals(UnitStatus.MAINTENANCE, storageUnitRepository.findById(activeUnit.getId()).orElseThrow().getStatus());
        assertEquals(ContractStatus.COMPLETED, rentalContractRepository.findById(activeContract.getId()).orElseThrow().getStatus());
        assertTrue(paymentRepository.findAll().stream().noneMatch(p -> p.getPaymentType() == PaymentType.DAMAGE_FEE));
        assertEquals(managerBefore + 1, notificationRepository.countByUser_IdAndReadFalse(managerA.getId()));

        mockMvc.perform(get("/api/unit-returns/" + returnId).header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.damageItems.length()").value(2));
        mockMvc.perform(get("/api/unit-returns/" + returnId).header("Authorization", bearer(otherCustomerToken)))
                .andExpect(status().isNotFound());

        // Danh sách hư hại chờ chốt phí: manager và staff cơ sở thấy, cơ sở khác không.
        mockMvc.perform(get("/api/unit-returns/damage?damageStatus=REPORTED").header("Authorization", bearer(managerToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/unit-returns/damage").header("Authorization", bearer(staffToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/unit-returns/damage").header("Authorization", bearer(managerBToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/unit-returns/damage").header("Authorization", bearer(customerToken)))
                .andExpect(status().isForbidden());
    }

    private RentalContract activeContractWithPaidDeposit(String unitCode) {
        StorageUnit u = unit(unitCode, UnitStatus.OCCUPIED);
        Reservation res = reservation(u, ReservationStatus.COMPLETED);
        deposit(res, PaymentStatus.PAID);
        return contract(res, u, ContractStatus.ACTIVE); // tiền cọc trong hợp đồng: 100
    }

    private List<Payment> damageFees(RentalContract c) {
        return paymentRepository.findAll().stream()
                .filter(p -> p.getPaymentType() == PaymentType.DAMAGE_FEE
                        && p.getRentalContract() != null && p.getRentalContract().getId().equals(c.getId()))
                .toList();
    }

    private Payment depositOf(RentalContract c) {
        return paymentRepository.findAll().stream()
                .filter(p -> p.getPaymentType() == PaymentType.DEPOSIT
                        && p.getReservation().getId().equals(c.getReservation().getId())).findFirst().orElseThrow();
    }

    @Test
    @DisplayName("Damage fee is set after the repair by the facility's manager or staff; the issuing rules are enforced")
    void issueDamageFeeRules() throws Exception {
        int id = reportDamage(activeContract, List.of("WALL_FLOOR"), null);
        String url = "/api/unit-returns/" + id + "/damage-fee";
        patchJson(customerToken, url, Map.of("damageFee", 10)).andExpect(status().isForbidden());
        patchJson(managerBToken, url, Map.of("damageFee", 10)).andExpect(status().isForbidden());
        patchJson(staffBToken, url, Map.of("damageFee", 10)).andExpect(status().isForbidden());
        patchJson(managerToken, url, Map.of("damageFee", -5)).andExpect(status().isBadRequest());

        // Hợp đồng này không có cọc đã nộp: cả phí được lập hóa đơn cho khách.
        patchJson(managerToken, url, Map.of("damageFee", 75.5))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.damageStatus").value("FEE_ISSUED"))
                .andExpect(jsonPath("$.damagePaymentId").isNumber());
        List<Payment> fees = damageFees(activeContract);
        assertEquals(1, fees.size());
        assertEquals(PaymentStatus.PENDING, fees.get(0).getStatus());
        assertEquals(0, new BigDecimal("75.5").compareTo(fees.get(0).getAmount()));

        // Chốt rồi thì không chốt lại.
        patchJson(staffToken, url, Map.of("damageFee", 20)).andExpect(status().isConflict());
    }

    @Test
    @DisplayName("Damage fee within the deposit is deducted from the refund: no separate bill (staff of the facility can set it)")
    void damageFeeCoveredByDeposit() throws Exception {
        RentalContract c = activeContractWithPaidDeposit("OPS-B02");
        int id = reportDamage(c, List.of("DOOR"), null);
        // Chưa chốt phí thì chưa hoàn cọc.
        assertEquals(PaymentStatus.PAID, depositOf(c).getStatus());

        patchJson(staffToken, "/api/unit-returns/" + id + "/damage-fee", Map.of("damageFee", 60))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.damagePaymentId").doesNotExist());
        assertTrue(damageFees(c).isEmpty());
        assertEquals(PaymentStatus.REFUNDED, depositOf(c).getStatus());
        assertTrue(depositOf(c).getTransactionReference().contains("40")); // hoàn 100 - 60
    }

    @Test
    @DisplayName("Damage fee above the deposit: only the excess is billed to the customer")
    void damageFeeAboveDeposit() throws Exception {
        RentalContract c = activeContractWithPaidDeposit("OPS-B03");
        int id = reportDamage(c, List.of("OTHER"), "Water damage on the back wall");
        patchJson(managerToken, "/api/unit-returns/" + id + "/damage-fee", Map.of("damageFee", 130))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.damagePaymentId").isNumber());
        List<Payment> fees = damageFees(c);
        assertEquals(1, fees.size());
        assertEquals(0, new BigDecimal("30").compareTo(fees.get(0).getAmount()));
        assertEquals(PaymentStatus.PENDING, fees.get(0).getStatus());
        assertEquals(PaymentStatus.REFUNDED, depositOf(c).getStatus());
    }

    @Test
    @DisplayName("Damage fee can be entered per ticked item; the total is the sum and unticked items are rejected")
    void damageFeePerItem() throws Exception {
        RentalContract c = activeContractWithPaidDeposit("OPS-B05");
        int id = reportDamage(c, List.of("DOOR", "OTHER"), "Scratched panel");
        String url = "/api/unit-returns/" + id + "/damage-fee";
        patchJson(managerToken, url, Map.of("itemFees", Map.of("DOOR", 30))).andExpect(status().isBadRequest()); // thiếu OTHER
        patchJson(managerToken, url, Map.of("itemFees", Map.of("DOOR", 30, "OTHER", 10, "LOCK", 5))).andExpect(status().isBadRequest());
        patchJson(managerToken, url, Map.of("itemFees", Map.of("DOOR", 30, "OTHER", 10)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.damageFee").value(40))
                .andExpect(jsonPath("$.damageItemFees.DOOR").value(30))
                .andExpect(jsonPath("$.damageItemFees.OTHER").value(10));
        assertTrue(depositOf(c).getTransactionReference().contains("60")); // hoàn 100 - 40
    }

    @Test
    @DisplayName("A zero damage fee means no charge: the full deposit is refunded")
    void zeroDamageFee() throws Exception {
        RentalContract c = activeContractWithPaidDeposit("OPS-B04");
        int id = reportDamage(c, List.of("LEFT_ITEMS"), null);
        patchJson(managerToken, "/api/unit-returns/" + id + "/damage-fee", Map.of("damageFee", 0))
                .andExpect(status().isOk()).andExpect(jsonPath("$.damagePaymentId").doesNotExist());
        assertTrue(damageFees(c).isEmpty());
        assertTrue(depositOf(c).getTransactionReference().contains("100"));
    }

    @Test
    @DisplayName("Return/support appointments need an ACTIVE contract owned by the customer")
    void returnAppointmentPreconditions() throws Exception {
        postJson(customerToken, "/api/appointments", Map.of(
                "appointmentType", "RETURN", "rentalContractId", pendingContract.getId(),
                "scheduledAt", LocalDateTime.now().plusDays(1).withNano(0).toString()))
                .andExpect(status().isBadRequest());
        postJson(otherCustomerToken, "/api/appointments", Map.of(
                "appointmentType", "RETURN", "rentalContractId", activeContract.getId(),
                "scheduledAt", LocalDateTime.now().plusDays(1).withNano(0).toString()))
                .andExpect(status().isNotFound());
        // Thiếu rentalContractId -> 400.
        postJson(customerToken, "/api/appointments", Map.of(
                "appointmentType", "RETURN", "scheduledAt", LocalDateTime.now().plusDays(1).withNano(0).toString()))
                .andExpect(status().isBadRequest());
    }

    // ===================== SUPPORT =====================

    @Test
    @DisplayName("Support: OPEN -> assign -> IN_PROGRESS -> RESOLVED -> CLOSED with role checks")
    void supportFlow() throws Exception {
        int id = postJson(customerToken, "/api/support-requests", Map.of(
                "rentalContractId", activeContract.getId(), "supportType", "LOCK",
                "title", "Lock is stuck", "description", "Key does not turn", "priority", "HIGH"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("OPEN"))
                .andExpect(jsonPath("$.facilityId").value(facilityA.getId()))
                .andExpect(jsonPath("$.unitCode").value("OPS-B01"))
                .andReturn().getResponse().getContentAsString().transform(this::idOf);
        String url = "/api/support-requests/" + id;

        // Không nhảy cóc / quay lại.
        patchJson(managerToken, url + "/status", Map.of("status", "RESOLVED")).andExpect(status().isBadRequest());
        patchJson(managerToken, url + "/status", Map.of("status", "OPEN")).andExpect(status().isBadRequest());

        // Gán staff là tùy chọn: chỉ manager đúng cơ sở mới gán được, và staff phải cùng cơ sở.
        patchJson(staffToken, url + "/assign", Map.of("staffId", staff.getId())).andExpect(status().isForbidden());
        patchJson(managerBToken, url + "/assign", Map.of("staffId", staffB.getId())).andExpect(status().isForbidden());
        patchJson(managerToken, url + "/assign", Map.of("staffId", staffB.getId())).andExpect(status().isBadRequest());
        patchJson(managerToken, url + "/assign", Map.of("staffId", staff.getId()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.assignedStaffId").value(staff.getId()))
                .andExpect(jsonPath("$.status").value("OPEN"));

        // Staff khác cơ sở không đổi được; customer không được đặt IN_PROGRESS.
        patchJson(staffBToken, url + "/status", Map.of("status", "IN_PROGRESS")).andExpect(status().isForbidden());
        patchJson(customerToken, url + "/status", Map.of("status", "IN_PROGRESS")).andExpect(status().isForbidden());
        patchJson(staffToken, url + "/status", Map.of("status", "IN_PROGRESS"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("IN_PROGRESS"));

        // Chưa RESOLVED thì chưa CLOSED.
        patchJson(customerToken, url + "/status", Map.of("status", "CLOSED")).andExpect(status().isBadRequest());
        patchJson(staffToken, url + "/status", Map.of("status", "RESOLVED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("RESOLVED"))
                .andExpect(jsonPath("$.resolvedAt").exists());

        // Customer khác không đóng được; staff không được CLOSED; chủ yêu cầu đóng được.
        patchJson(otherCustomerToken, url + "/status", Map.of("status", "CLOSED")).andExpect(status().isNotFound());
        patchJson(staffToken, url + "/status", Map.of("status", "CLOSED")).andExpect(status().isForbidden());
        patchJson(customerToken, url + "/status", Map.of("status", "CLOSED"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("CLOSED"));

        mockMvc.perform(get("/api/support-requests/my").header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/support-requests?status=CLOSED").header("Authorization", bearer(staffToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/support-requests").header("Authorization", bearer(staffBToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("Support replies: staff or manager of the facility answer without being assigned; the customer sees the thread")
    void supportReplies() throws Exception {
        int id = postJson(customerToken, "/api/support-requests", Map.of(
                "rentalContractId", activeContract.getId(), "supportType", "LOCK", "title", "Lock is stuck"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString().transform(this::idOf);
        String replies = "/api/support-requests/" + id + "/replies";

        // Không phải chủ yêu cầu / staff, manager cơ sở khác thì không trả lời được; trả lời rỗng thì 400.
        postJson(otherCustomerToken, replies, Map.of("message", "hi")).andExpect(status().isNotFound());
        postJson(staffBToken, replies, Map.of("message", "hi")).andExpect(status().isForbidden());
        postJson(managerBToken, replies, Map.of("message", "hi")).andExpect(status().isForbidden());
        postJson(staffToken, replies, Map.of("message", " ")).andExpect(status().isBadRequest());

        // Staff cơ sở trả lời luôn, không cần gán: yêu cầu thành IN_PROGRESS và staff tự nhận.
        long customerBefore = notificationRepository.countByUser_IdAndReadFalse(customer.getId());
        postJson(staffToken, replies, Map.of("message", "We will send someone today."))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"))
                .andExpect(jsonPath("$.assignedStaffId").value(staff.getId()))
                .andExpect(jsonPath("$.replies.length()").value(1))
                .andExpect(jsonPath("$.replies[0].staffReply").value(true));
        assertEquals(customerBefore + 1, notificationRepository.countByUser_IdAndReadFalse(customer.getId()));

        // Manager cơ sở cũng trả lời được; khách trả lời lại được.
        postJson(managerToken, replies, Map.of("message", "Our technician is on the way.")).andExpect(status().isCreated());
        postJson(customerToken, replies, Map.of("message", "Thank you!"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.replies.length()").value(3))
                .andExpect(jsonPath("$.replies[2].staffReply").value(false));
        mockMvc.perform(get("/api/support-requests/" + id).header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.replies.length()").value(3));

        // Đã RESOLVED mà khách trả lời thì mở lại; đã CLOSED thì không trả lời nữa.
        patchJson(staffToken, "/api/support-requests/" + id + "/status", Map.of("status", "RESOLVED")).andExpect(status().isOk());
        postJson(customerToken, replies, Map.of("message", "Still stuck")).andExpect(jsonPath("$.status").value("IN_PROGRESS"));
        patchJson(staffToken, "/api/support-requests/" + id + "/status", Map.of("status", "RESOLVED")).andExpect(status().isOk());
        patchJson(customerToken, "/api/support-requests/" + id + "/status", Map.of("status", "CLOSED")).andExpect(status().isOk());
        postJson(staffToken, replies, Map.of("message", "late")).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("Support: only contract owner with ACTIVE contract can create; validation errors return 400")
    void supportCreateRules() throws Exception {
        Map<String, Object> ok = Map.of("rentalContractId", activeContract.getId(), "supportType", "KEY", "title", "Lost key");
        postJson(otherCustomerToken, "/api/support-requests", ok).andExpect(status().isNotFound());
        postJson(staffToken, "/api/support-requests", ok).andExpect(status().isForbidden());
        postJson(customerToken, "/api/support-requests", Map.of(
                "rentalContractId", pendingContract.getId(), "supportType", "KEY", "title", "Lost key"))
                .andExpect(status().isBadRequest());
        postJson(customerToken, "/api/support-requests", Map.of(
                "rentalContractId", activeContract.getId(), "supportType", "KEY", "title", " "))
                .andExpect(status().isBadRequest());
        // Mặc định priority = MEDIUM.
        postJson(customerToken, "/api/support-requests", ok)
                .andExpect(status().isCreated()).andExpect(jsonPath("$.priority").value("MEDIUM"));
    }

    @Test
    @DisplayName("Booking options: only ready reservations and in-use contracts, and a booked check-in disappears")
    void bookingOptions() throws Exception {
        mockMvc.perform(get("/api/appointments/booking-options").header("Authorization", bearer(customerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checkIns.length()").value(1))
                .andExpect(jsonPath("$.checkIns[0].reservationId").value(checkInReservation.getId()))
                .andExpect(jsonPath("$.checkIns[0].unitCode").value("OPS-A01"))
                .andExpect(jsonPath("$.contracts.length()").value(1))
                .andExpect(jsonPath("$.contracts[0].rentalContractId").value(activeContract.getId()));

        createCheckIn(customerToken).andExpect(status().isCreated());
        mockMvc.perform(get("/api/appointments/booking-options").header("Authorization", bearer(customerToken)))
                .andExpect(jsonPath("$.checkIns.length()").value(0));
        mockMvc.perform(get("/api/appointments/booking-options").header("Authorization", bearer(otherCustomerToken)))
                .andExpect(jsonPath("$.checkIns.length()").value(0))
                .andExpect(jsonPath("$.contracts.length()").value(0));
        mockMvc.perform(get("/api/appointments/booking-options").header("Authorization", bearer(staffToken)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Staff options: manager sees active staff of own facility only")
    void facilityStaffOptions() throws Exception {
        mockMvc.perform(get("/api/appointments/staff").header("Authorization", bearer(managerToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(staff.getId()))
                .andExpect(jsonPath("$[0].fullname").value("ops-staff"));
        mockMvc.perform(get("/api/appointments/staff").header("Authorization", bearer(managerBToken)))
                .andExpect(jsonPath("$[0].id").value(staffB.getId()));
        mockMvc.perform(get("/api/appointments/staff").header("Authorization", bearer(staffToken)))
                .andExpect(status().isForbidden());
    }

    // ===================== HELPER =====================

    private ResultActions createCheckIn(String token) throws Exception {
        return postJson(token, "/api/appointments", checkInBody(checkInReservation.getId()));
    }

    private Map<String, Object> checkInBody(Integer reservationId) {
        return checkInBodyAt(reservationId, LocalDateTime.now().plusDays(1));
    }

    private Map<String, Object> checkInBodyAt(Integer reservationId, LocalDateTime at) {
        return Map.of("appointmentType", "CHECK_IN", "reservationId", reservationId,
                "scheduledAt", at.withNano(0).toString());
    }

    private ResultActions complete(String token, int appointmentId, boolean keyHandedOver) throws Exception {
        return patchJson(token, "/api/appointments/" + appointmentId + "/complete", Map.of("keyHandedOver", keyHandedOver));
    }

    private ResultActions postJson(String token, String url, Object body) throws Exception {
        return mockMvc.perform(post(url).header("Authorization", bearer(token))
                .contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body)));
    }

    private ResultActions patchJson(String token, String url, Object body) throws Exception {
        var req = patch(url).header("Authorization", bearer(token));
        if (body != null) {
            req.contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body));
        }
        return mockMvc.perform(req);
    }

    private int idOf(String json) {
        try {
            return objectMapper.readTree(json).get("id").asInt();
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

    private StorageUnit unit(String code, UnitStatus status) {
        StorageUnit u = new StorageUnit();
        u.setFacility(facilityA);
        u.setUnitType(unitType);
        u.setUnitCode(code);
        u.setStatus(status);
        return storageUnitRepository.save(u);
    }

    private Reservation reservation(StorageUnit unit, ReservationStatus status) {
        Reservation r = new Reservation();
        r.setCustomer(customer);
        r.setFacility(facilityA);
        r.setUnitType(unitType);
        r.setStorageUnit(unit);
        r.setStartDate(LocalDate.now().plusDays(1));
        r.setRentalMonths(3);
        r.setEstimatedAmount(new BigDecimal("900"));
        r.setStatus(status);
        return reservationRepository.save(r);
    }

    private void deposit(Reservation reservation, PaymentStatus status) {
        Payment p = new Payment();
        p.setCustomer(customer);
        p.setReservation(reservation);
        p.setPaymentType(PaymentType.DEPOSIT);
        p.setAmount(new BigDecimal("100"));
        p.setStatus(status);
        paymentRepository.save(p);
    }

    private Payment rental(Reservation reservation, RentalContract contract, PaymentStatus status) {
        Payment p = new Payment();
        p.setCustomer(customer);
        p.setReservation(reservation);
        p.setRentalContract(contract);
        p.setPaymentType(PaymentType.RENTAL);
        p.setAmount(new BigDecimal("900"));
        p.setStatus(status);
        return paymentRepository.save(p);
    }

    private RentalContract contract(Reservation reservation, StorageUnit unit, ContractStatus status) {
        RentalContract c = new RentalContract();
        c.setReservation(reservation);
        c.setCustomer(customer);
        c.setStorageUnit(unit);
        c.setStartDate(LocalDate.now());
        c.setEndDate(LocalDate.now().plusMonths(3));
        c.setMonthlyPrice(new BigDecimal("300"));
        c.setDepositAmount(new BigDecimal("100"));
        c.setStatus(status);
        return rentalContractRepository.save(c);
    }
}
