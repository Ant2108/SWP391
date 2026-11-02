package com.example.storage_api;

import com.example.storage_api.entity.*;
import com.example.storage_api.reponsitory.*;
import com.example.storage_api.service.ReminderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/** Nhắc tự động: sắp hết hạn trả cọc, ngày mai nhận kho, hợp đồng sắp hết hạn. Mỗi nhắc chỉ gửi một lần. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("test")
@Transactional
class ReminderServiceIntegrationTest {

    @Autowired private ReminderService reminderService;
    @Autowired private UsersRepository usersRepository;
    @Autowired private FacilityRepository facilityRepository;
    @Autowired private UnitTypeRepository unitTypeRepository;
    @Autowired private StorageUnitRepository storageUnitRepository;
    @Autowired private ReservationRepository reservationRepository;
    @Autowired private RentalContractRepository rentalContractRepository;
    @Autowired private PaymentRepository paymentRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private JdbcTemplate jdbc;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;

    private Facility facility;
    private UnitType unitType;
    private Users customer;

    @BeforeEach
    void setup() {
        facility = new Facility();
        facility.setName("Reminder Facility");
        facility.setAddress("1 Test Street");
        facility = facilityRepository.save(facility);
        unitType = new UnitType();
        unitType.setFacility(facility);
        unitType.setTypeName("REM-SMALL");
        unitType = unitTypeRepository.save(unitType);
        customer = new Users();
        customer.setFullname("Remind Me");
        customer.setEmail("remind-me@test.com");
        customer.setPassword("x");
        customer.setRole(Role.CUSTOMER);
        customer.setStatus(Status.ACTIVE);
        customer = usersRepository.save(customer);
    }

    private List<Notification> mine() {
        return notificationRepository.findTop50ByUser_IdOrderByCreatedAtDescIdDesc(customer.getId());
    }

    private Reservation reservation(ReservationStatus status, LocalDate startDate, int createdHoursAgo) {
        Reservation r = new Reservation();
        r.setCustomer(customer);
        r.setFacility(facility);
        r.setUnitType(unitType);
        r.setStartDate(startDate);
        r.setRentalMonths(1);
        r.setEstimatedAmount(new BigDecimal("1000"));
        r.setStatus(status);
        r = reservationRepository.save(r);
        // CreatedAt do hệ thống đặt lúc lưu: lùi về quá khứ để mô phỏng đơn đã đặt cách đây createdHoursAgo giờ.
        jdbc.update("update reservations set created_at = ? where reservation_id = ?",
                LocalDateTime.now().minusHours(createdHoursAgo), r.getId());
        em.flush();
        em.clear(); // bỏ bản trong bộ nhớ để đọc lại CreatedAt vừa sửa bằng SQL
        return reservationRepository.findById(r.getId()).orElseThrow();
    }

    private RentalContract contract(Reservation r, LocalDate end) {
        StorageUnit u = new StorageUnit();
        u.setFacility(facility);
        u.setUnitType(unitType);
        u.setUnitCode("REM-" + r.getId());
        u.setStatus(UnitStatus.OCCUPIED);
        u = storageUnitRepository.save(u);
        RentalContract c = new RentalContract();
        c.setReservation(r);
        c.setCustomer(customer);
        c.setStorageUnit(u);
        c.setStartDate(end.minusMonths(1));
        c.setEndDate(end);
        c.setMonthlyPrice(new BigDecimal("1000"));
        c.setDepositAmount(new BigDecimal("500"));
        c.setStatus(ContractStatus.ACTIVE);
        return rentalContractRepository.save(c);
    }

    @Autowired private com.example.storage_api.service.ReservationService reservationService;

    @Test
    @DisplayName("Expiry job: cancels unpaid reservations older than 24 h in every facility, even if nobody books there")
    void expireAllUnpaid() {
        Reservation old = reservation(ReservationStatus.PENDING, LocalDate.now().plusDays(10), 30);
        Reservation fresh = reservation(ReservationStatus.PENDING, LocalDate.now().plusDays(10), 20);
        Reservation paid = reservation(ReservationStatus.PENDING, LocalDate.now().plusDays(10), 40);
        Payment dep = new Payment();
        dep.setCustomer(customer);
        dep.setReservation(paid);
        dep.setPaymentType(PaymentType.DEPOSIT);
        dep.setAmount(new BigDecimal("500"));
        dep.setStatus(PaymentStatus.PAID);
        paymentRepository.save(dep);

        assertEquals(1, reservationService.expireAllUnpaidReservations());
        assertEquals(ReservationStatus.CANCELLED, reservationRepository.findById(old.getId()).orElseThrow().getStatus());
        assertEquals(ReservationStatus.PENDING, reservationRepository.findById(fresh.getId()).orElseThrow().getStatus());
        assertEquals(ReservationStatus.PENDING, reservationRepository.findById(paid.getId()).orElseThrow().getStatus());
        assertTrue(mine().stream().anyMatch(n -> n.getTitle().equals("Your reservation expired")));
        // Chạy lại: không hủy thêm.
        assertEquals(0, reservationService.expireAllUnpaidReservations());
    }

    @Test
    @DisplayName("Deposit reminder: only unpaid reservations within the last 6 hours, and only once")
    void depositReminder() {
        Reservation soon = reservation(ReservationStatus.PENDING, LocalDate.now().plusDays(10), 20);   // còn 4 giờ
        Reservation early = reservation(ReservationStatus.PENDING, LocalDate.now().plusDays(10), 2);   // còn 22 giờ
        Reservation expired = reservation(ReservationStatus.PENDING, LocalDate.now().plusDays(10), 30); // đã quá hạn
        Reservation paid = reservation(ReservationStatus.PENDING, LocalDate.now().plusDays(10), 20);
        Payment dep = new Payment();
        dep.setCustomer(customer);
        dep.setReservation(paid);
        dep.setPaymentType(PaymentType.DEPOSIT);
        dep.setAmount(new BigDecimal("500"));
        dep.setStatus(PaymentStatus.PAID);
        paymentRepository.save(dep);

        assertEquals(1, reminderService.sendReminders(LocalDateTime.now()));
        List<Notification> list = mine();
        assertEquals(1, list.size());
        assertEquals("Your deposit is due soon", list.get(0).getTitle());
        assertEquals("/account/reservations/" + soon.getId(), list.get(0).getLink());
        assertTrue(list.get(0).getMessage().contains("Reservation #" + soon.getId()));

        // Chạy lại: không nhắc trùng.
        assertEquals(0, reminderService.sendReminders(LocalDateTime.now()));
        assertEquals(1, mine().size());
        assertNotEquals(early.getId(), soon.getId());
        assertNotEquals(expired.getId(), soon.getId());
    }

    @Test
    @DisplayName("Pickup reminder: reservations whose pickup date is tomorrow, again if the date moves")
    void pickupReminder() {
        Reservation tomorrow = reservation(ReservationStatus.CONFIRMED, LocalDate.now().plusDays(1), 48);
        reservation(ReservationStatus.CONFIRMED, LocalDate.now().plusDays(4), 48);          // chưa tới
        reservation(ReservationStatus.CANCELLED, LocalDate.now().plusDays(1), 48);          // đã hủy

        assertEquals(1, reminderService.sendReminders(LocalDateTime.now()));
        assertEquals("Your pickup is tomorrow", mine().get(0).getTitle());
        assertEquals(0, reminderService.sendReminders(LocalDateTime.now()));

        // Manager dời lịch sang ngày khác -> đến hôm trước ngày mới lại được nhắc (khóa có ngày nhận kho).
        tomorrow.setStartDate(LocalDate.now().plusDays(3));
        reservationRepository.save(tomorrow);
        assertEquals(1, reminderService.sendReminders(LocalDateTime.now().plusDays(2)));
    }

    @Test
    @DisplayName("Contract reminders: 7 days before the end, 1 day before, not when far away or already overdue")
    void contractEndingReminders() {
        Reservation r1 = reservation(ReservationStatus.COMPLETED, LocalDate.now().minusMonths(1), 800);
        Reservation r2 = reservation(ReservationStatus.COMPLETED, LocalDate.now().minusMonths(1), 800);
        Reservation r3 = reservation(ReservationStatus.COMPLETED, LocalDate.now().minusMonths(1), 800);
        Reservation r4 = reservation(ReservationStatus.COMPLETED, LocalDate.now().minusMonths(1), 800);
        RentalContract in5 = contract(r1, LocalDate.now().plusDays(5));
        contract(r2, LocalDate.now().plusDays(20));   // còn xa
        contract(r3, LocalDate.now().minusDays(1));   // đã quá hạn
        RentalContract tomorrow = contract(r4, LocalDate.now().plusDays(1));

        assertEquals(2, reminderService.sendReminders(LocalDateTime.now()));
        List<Notification> list = mine();
        assertEquals(2, list.size());
        assertTrue(list.stream().anyMatch(n -> n.getTitle().equals("Your rental ends tomorrow")));
        assertTrue(list.stream().anyMatch(n -> n.getTitle().equals("Your rental ends in 5 days")));
        assertTrue(list.stream().allMatch(n -> "/account/contracts".equals(n.getLink())));
        assertEquals(0, reminderService.sendReminders(LocalDateTime.now()));

        // Gia hạn (ngày hết hạn mới) rồi gần hết hạn lần nữa -> được nhắc cho kỳ mới.
        in5.setEndDate(LocalDate.now().plusDays(3));
        rentalContractRepository.save(in5);
        assertEquals(1, reminderService.sendReminders(LocalDateTime.now()));
        assertNotNull(tomorrow.getId());
    }
}
