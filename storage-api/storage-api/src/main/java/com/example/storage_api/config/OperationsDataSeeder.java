package com.example.storage_api.config;

import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.Payment;
import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.entity.Reservation;
import com.example.storage_api.entity.ReservationStatus;
import com.example.storage_api.entity.StorageUnit;
import com.example.storage_api.entity.SupportPriority;
import com.example.storage_api.entity.SupportRequest;
import com.example.storage_api.entity.SupportType;
import com.example.storage_api.entity.Users;
import com.example.storage_api.reponsitory.FacilityRepository;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.ReservationRepository;
import com.example.storage_api.reponsitory.StorageUnitRepository;
import com.example.storage_api.reponsitory.SupportRequestRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;

/**
 * Dữ liệu demo cho module Appointment / Return / Support (dùng khi test bằng Swagger).
 *
 * Chạy sau khi app sẵn sàng (ApplicationReadyEvent) nên chắc chắn DataInit (users) và DataSeeder (facility, unit)
 * đã chạy xong. Chỉ seed khi bảng Reservations còn trống, không bao giờ sửa/xoá dữ liệu có sẵn.
 * Reservation/Contract/Payment ở đây là dữ liệu của module Member 3 (entity tạm) — xoá khi Member 3 có seeder riêng.
 *
 * Kịch bản sau khi seed (cơ sở "Kho Trung Tâm Quận 1", tài khoản trong DataInit):
 *  - Reservation CONFIRMED + unit A03 (RESERVED) + cọc PAID + contract PENDING  -> demo CHECK-IN.
 *  - Reservation COMPLETED + unit B01 (OCCUPIED) + contract ACTIVE              -> demo RETURN và SUPPORT.
 *  - Reservation PENDING chưa có unit                                           -> demo lỗi "chưa đủ điều kiện check-in".
 *  - staff@example.com và fmanager@example.com được gán vào cơ sở này nếu chưa có cơ sở.
 */
@Slf4j
@Profile("!test")
@Component
@RequiredArgsConstructor
public class OperationsDataSeeder {

    private static final String FACILITY_NAME = "Kho Trung Tâm Quận 1";

    private final FacilityRepository facilityRepository;
    private final UsersRepository usersRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final ReservationRepository reservationRepository;
    private final RentalContractRepository rentalContractRepository;
    private final PaymentRepository paymentRepository;
    private final SupportRequestRepository supportRequestRepository;

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        if (reservationRepository.count() > 0) {
            log.info("OperationsDataSeeder: đã có Reservation, bỏ qua.");
            return;
        }
        Optional<Facility> facilityOpt = facilityRepository.findFirstByName(FACILITY_NAME);
        Optional<Users> staffOpt = usersRepository.findByEmail("staff@example.com");
        Optional<Users> managerOpt = usersRepository.findByEmail("fmanager@example.com");
        Optional<Users> customerOpt = usersRepository.findByEmail("customer@example.com");
        if (facilityOpt.isEmpty() || staffOpt.isEmpty() || managerOpt.isEmpty() || customerOpt.isEmpty()) {
            log.warn("OperationsDataSeeder: thiếu facility hoặc user mẫu (DataInit/DataSeeder), bỏ qua.");
            return;
        }
        Facility facility = facilityOpt.get();
        Users customer = customerOpt.get();

        assignFacilityIfMissing(staffOpt.get(), facility);
        assignFacilityIfMissing(managerOpt.get(), facility);

        StorageUnit unitA03 = findUnit(facility, "A03");
        StorageUnit unitB01 = findUnit(facility, "B01");
        StorageUnit unitA01 = findUnit(facility, "A01");
        if (unitA03 == null || unitB01 == null || unitA01 == null) {
            log.warn("OperationsDataSeeder: thiếu unit A01/A03/B01 của DataSeeder, bỏ qua.");
            return;
        }

        LocalDate today = LocalDate.now();

        // Kịch bản CHECK-IN: đã xác nhận, đã gán unit, đã đóng cọc, hợp đồng đang chờ kích hoạt.
        Reservation checkInRes = reservation(customer, facility, unitA03, today.plusDays(1), 3, ReservationStatus.CONFIRMED);
        deposit(customer, checkInRes, PaymentStatus.PAID);
        RentalContract pendingContract = contract(checkInRes, customer, unitA03, today.plusDays(1),
                today.plusDays(1).plusMonths(3), ContractStatus.PENDING);

        // Kịch bản RETURN / SUPPORT: hợp đồng đang hoạt động, unit đang có khách.
        Reservation activeRes = reservation(customer, facility, unitB01, today.minusDays(60), 3, ReservationStatus.COMPLETED);
        deposit(customer, activeRes, PaymentStatus.PAID);
        RentalContract activeContract = contract(activeRes, customer, unitB01, today.minusDays(60),
                today.plusDays(30), ContractStatus.ACTIVE);

        // Kịch bản lỗi: mới PENDING, chưa gán unit, chưa đóng cọc.
        Reservation pendingRes = reservation(customer, facility, null, today.plusDays(7), 1, ReservationStatus.PENDING);
        pendingRes.setUnitType(unitA01.getUnitType());
        reservationRepository.save(pendingRes);

        SupportRequest support = new SupportRequest();
        support.setCustomer(customer);
        support.setFacility(facility);
        support.setRentalContract(activeContract);
        support.setStorageUnit(unitB01);
        support.setSupportType(SupportType.LOCK);
        support.setTitle("Khóa cửa bị kẹt");
        support.setDescription("Chìa khóa vào ổ nhưng không xoay được.");
        support.setPriority(SupportPriority.HIGH);
        supportRequestRepository.save(support);

        log.info("OperationsDataSeeder: demo CHECK-IN = reservationId {} / contractId {} (unit A03); "
                        + "demo RETURN/SUPPORT = contractId {} (unit B01); reservation lỗi = {}",
                checkInRes.getId(), pendingContract.getId(), activeContract.getId(), pendingRes.getId());
    }

    private void assignFacilityIfMissing(Users user, Facility facility) {
        if (user.getFacility() == null) {
            user.setFacility(facility);
            usersRepository.save(user);
            log.info("OperationsDataSeeder: gán {} vào '{}'", user.getEmail(), facility.getName());
        }
    }

    private StorageUnit findUnit(Facility facility, String code) {
        return storageUnitRepository.search(facility.getId(), null, null).stream()
                .filter(u -> code.equalsIgnoreCase(u.getUnitCode()))
                .findFirst().orElse(null);
    }

    private Reservation reservation(Users customer, Facility facility, StorageUnit unit, LocalDate start,
                                    int months, ReservationStatus status) {
        Reservation r = new Reservation();
        r.setCustomer(customer);
        r.setFacility(facility);
        if (unit != null) {
            r.setUnitType(unit.getUnitType());
            r.setStorageUnit(unit);
        }
        r.setStartDate(start);
        r.setRentalMonths(months);
        r.setEstimatedAmount(BigDecimal.valueOf(300).multiply(BigDecimal.valueOf(months)));
        r.setStatus(status);
        // Reservation PENDING không có unit nên chưa có unitType: caller tự set rồi save lại.
        return unit != null ? reservationRepository.save(r) : r;
    }

    private void deposit(Users customer, Reservation reservation, PaymentStatus status) {
        Payment p = new Payment();
        p.setCustomer(customer);
        p.setReservation(reservation);
        p.setPaymentType(PaymentType.DEPOSIT);
        p.setAmount(BigDecimal.valueOf(100));
        p.setPaymentMethod("CASH");
        p.setStatus(status);
        if (status == PaymentStatus.PAID) {
            p.setPaidAt(java.time.LocalDateTime.now());
        }
        paymentRepository.save(p);
    }

    private RentalContract contract(Reservation reservation, Users customer, StorageUnit unit, LocalDate start,
                                    LocalDate end, ContractStatus status) {
        RentalContract c = new RentalContract();
        c.setReservation(reservation);
        c.setCustomer(customer);
        c.setStorageUnit(unit);
        c.setStartDate(start);
        c.setEndDate(end);
        c.setMonthlyPrice(BigDecimal.valueOf(300));
        c.setDepositAmount(BigDecimal.valueOf(100));
        c.setStatus(status);
        return rentalContractRepository.save(c);
    }
}
