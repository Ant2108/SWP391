package com.example.storage_api.service;

import com.example.storage_api.entity.Appointment;
import com.example.storage_api.entity.AppointmentStatus;
import com.example.storage_api.entity.AppointmentType;
import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.entity.Reservation;
import com.example.storage_api.entity.ReservationStatus;
import com.example.storage_api.reponsitory.AppointmentRepository;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.ReservationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Thông báo nhắc tự động theo thời gian (chạy định kỳ bởi ReminderScheduler):
 * - Hạn đóng cọc Đợt 1 (24 giờ kể từ lúc đặt): nhắc khi còn 12, 8, 5, 3 và 1 giờ.
 * - Ngày mai đến nhận kho.
 * - Hợp đồng sắp hết hạn: nhắc khi còn 10, 5, 3 và 1 ngày (mốc 3 và 1 ngày có thêm cảnh báo phí lưu kho).
 *
 * Mỗi mốc chỉ gửi một lần nhờ khóa chống trùng, nên chạy lại nhiều lần vẫn an toàn. Nếu hệ thống bị lỡ một mốc
 * thì gửi mốc gần nhất đang áp dụng, không dồn nhiều thông báo cùng lúc.
 */
@Service
@RequiredArgsConstructor
public class ReminderService {

    public static final int DEPOSIT_DEADLINE_HOURS = 24;
    /** Các mốc nhắc hạn đóng cọc (giờ còn lại). */
    public static final int[] DEPOSIT_TIERS_HOURS = {1, 3, 5, 8, 12};
    /** Các mốc nhắc hợp đồng sắp hết hạn (ngày còn lại). */
    public static final int[] CONTRACT_TIERS_DAYS = {1, 3, 5, 10};

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm 'ngày' dd/MM/yyyy");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final PolicyService policyService;
    private final ReservationRepository reservationRepository;
    private final AppointmentRepository appointmentRepository;
    private final RentalContractRepository rentalContractRepository;
    private final PaymentRepository paymentRepository;
    private final OperationsNotificationService notifier;

    /** @return số thông báo nhắc đã gửi trong lần chạy này. */
    @Transactional
    public int sendReminders(LocalDateTime now) {
        return depositDeadlineReminders(now) + pickupTomorrowReminders(now.toLocalDate())
                + contractEndingReminders(now.toLocalDate()) + lateCheckInAlerts(now);
    }

    // ===================== CHECK-IN TRỄ, SẮP TỚI GIỜ KHÁCH KẾ TIẾP =====================

    /**
     * Khi còn không quá 10 phút nữa là tới giờ của một khách mà khách đặt lịch trước đó (cùng cơ sở) vẫn chưa được check in,
     * báo chuông cho staff phụ trách và manager để liên hệ khách mới xin chờ thêm một chút.
     */
    private int lateCheckInAlerts(LocalDateTime now) {
        int sent = 0;
        for (Appointment next : appointmentRepository.findScheduledBetween(AppointmentType.CHECK_IN, AppointmentStatus.SCHEDULED,
                now, now.plusMinutes(10).plusSeconds(1))) {
            Long facilityId = next.getFacility().getId();
            for (Appointment earlier : appointmentRepository.findByFacility_IdAndStatusAndScheduledAtBetween(
                    facilityId, AppointmentStatus.SCHEDULED, next.getScheduledAt().minusHours(3), next.getScheduledAt())) {
                if (earlier.getId().equals(next.getId()) || earlier.getAppointmentType() != AppointmentType.CHECK_IN
                        || !earlier.getScheduledAt().isBefore(next.getScheduledAt())) {
                    continue;
                }
                String text = "Khách " + earlier.getCustomer().getFullname() + " hẹn lúc "
                        + earlier.getScheduledAt().format(DateTimeFormatter.ofPattern("HH:mm")) + " vẫn chưa được check in, trong khi sắp tới giờ hẹn "
                        + next.getScheduledAt().format(DateTimeFormatter.ofPattern("HH:mm")) + " của khách " + next.getCustomer().getFullname()
                        + ". Vui lòng báo quản lý để liên hệ khách đến sau chờ thêm một chút.";
                String key = "late-checkin-" + earlier.getId() + "-" + next.getId();
                boolean any = false;
                if (earlier.getStaff() != null) {
                    any |= notifier.notifyUserOnce(key + "-staff", earlier.getStaff(), "Check-in trễ",
                            "Có khách chưa được check in, sắp tới giờ khách kế tiếp", text, "/admin/appointments");
                }
                for (com.example.storage_api.entity.Users m : managersOf(facilityId)) {
                    any |= notifier.notifyUserOnce(key + "-m" + m.getId(), m, "Check-in trễ",
                            "Có khách chưa được check in, sắp tới giờ khách kế tiếp", text, "/admin/appointments");
                }
                if (any) {
                    sent++;
                }
            }
        }
        return sent;
    }

    private final com.example.storage_api.reponsitory.UsersRepository usersRepository;

    private List<com.example.storage_api.entity.Users> managersOf(Long facilityId) {
        return usersRepository.findByRoleAndFacility_IdAndStatus(com.example.storage_api.entity.Role.FACILITY_MANAGER,
                facilityId, com.example.storage_api.entity.Status.ACTIVE);
    }

    /** Mốc nhỏ nhất mà thời gian còn lại đã chạm tới (ví dụ còn 7 giờ thì mốc 8). Trả -1 nếu chưa tới mốc nào. */
    static int currentTier(long remaining, int[] tiersAscending) {
        for (int t : tiersAscending) {
            if (remaining <= t) {
                return t;
            }
        }
        return -1;
    }

    // ===================== SẮP HẾT HẠN ĐÓNG CỌC =====================

    private int depositDeadlineReminders(LocalDateTime now) {
        int sent = 0;
        for (Reservation r : reservationRepository.findByStatusOrderByCreatedAtDesc(ReservationStatus.PENDING)) {
            if (r.getCreatedAt() == null) {
                continue;
            }
            LocalDateTime deadline = r.getCreatedAt().plusHours(policyService.get().getUnpaidHoldHours());
            Duration left = Duration.between(now, deadline);
            if (left.isNegative() || left.isZero()) {
                continue;
            }
            if (paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                    r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID)) {
                continue;
            }
            long hoursLeft = (left.toMinutes() + 59) / 60; // làm tròn lên
            int tier = currentTier(hoursLeft, DEPOSIT_TIERS_HOURS);
            if (tier < 0) {
                continue;
            }
            String message = "Quý khách còn khoảng " + hoursLeft + " giờ để đóng tiền cọc Đợt 1 cho đơn đặt kho #" + r.getId()
                    + " (" + r.getUnitType().getTypeName() + " tại " + r.getFacility().getName() + "). Hạn chót: "
                    + deadline.format(TIME) + ". Nếu không hoàn thành đúng hạn, đơn sẽ tự động hủy; khi đó quý khách vẫn muốn thuê kho "
                    + "xin vui lòng đặt kho lại. Lưu ý: đặt kho nhưng không thanh toán liên tiếp nhiều lần có thể dẫn đến tạm khóa tài khoản.";
            if (notifier.notifyUserOnce("deposit-" + tier + "h-" + r.getId(), r.getCustomer(),
                    "Sắp hết hạn đóng cọc (còn " + tier + " giờ)", "Sắp hết hạn đóng cọc, còn khoảng " + hoursLeft + " giờ",
                    message, "/account/reservations/" + r.getId())) {
                sent++;
            }
        }
        return sent;
    }

    // ===================== NGÀY MAI ĐẾN NHẬN KHO =====================

    private int pickupTomorrowReminders(LocalDate today) {
        LocalDate tomorrow = today.plusDays(1);
        int sent = 0;
        List<ReservationStatus> open = List.of(ReservationStatus.PENDING, ReservationStatus.ASSIGNED, ReservationStatus.CONFIRMED);
        // Ngày nhận kho thực tế: lịch hẹn nhận kho còn chờ (đã dời thì theo ngày mới); đơn nào chưa có lịch thì theo ngày trên đơn.
        Map<Integer, Reservation> due = new LinkedHashMap<>();
        for (Appointment a : appointmentRepository.findScheduledBetween(AppointmentType.CHECK_IN, AppointmentStatus.SCHEDULED,
                tomorrow.atStartOfDay(), tomorrow.plusDays(1).atStartOfDay())) {
            if (a.getReservation() != null && open.contains(a.getReservation().getStatus())) {
                due.put(a.getReservation().getId(), a.getReservation());
            }
        }
        for (Reservation r : reservationRepository.findByStartDateAndStatusIn(tomorrow, open)) {
            // Đơn có lịch hẹn đang chờ thì ngày hẹn quyết định (đã dời sang ngày khác thì không nhắc hôm nay).
            if (!appointmentRepository.existsByReservation_IdAndAppointmentTypeAndStatus(
                    r.getId(), AppointmentType.CHECK_IN, AppointmentStatus.SCHEDULED)) {
                due.putIfAbsent(r.getId(), r);
            }
        }
        for (Reservation r : due.values()) {
            boolean rentalPaid = paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                    r.getId(), PaymentType.RENTAL, PaymentStatus.PAID);
            String todo = rentalPaid ? "Quý khách đã thanh toán đủ, chỉ cần đến đúng giờ hẹn để nhân viên bàn giao kho."
                    : "Quý khách vui lòng thanh toán tiền thuê (Đợt 2) trước hoặc tại quầy; nhân viên sẽ bàn giao kho sau khi thanh toán xong.";
            // Khóa có ngày nhận kho thực tế: nếu manager dời lịch sang ngày khác thì ngày mới lại được nhắc.
            if (notifier.notifyUserOnce("pickup-1d-" + r.getId() + "-" + tomorrow, r.getCustomer(),
                    "Ngày mai nhận kho", "Ngày mai là ngày nhận kho của quý khách",
                    "Ngày mai (" + tomorrow.format(DATE) + ") là ngày nhận kho tại " + r.getFacility().getName() + ". " + todo
                            + " Nhớ mang theo giấy tờ tùy thân (CCCD) bản gốc.",
                    "/account/appointments")) {
                sent++;
            }
        }
        return sent;
    }

    // ===================== HỢP ĐỒNG SẮP HẾT HẠN =====================

    private int contractEndingReminders(LocalDate today) {
        int sent = 0;
        int maxDays = CONTRACT_TIERS_DAYS[CONTRACT_TIERS_DAYS.length - 1];
        for (RentalContract c : rentalContractRepository.findByStatusAndEndDateLessThanEqual(
                ContractStatus.ACTIVE, today.plusDays(maxDays))) {
            long daysLeft = ChronoUnit.DAYS.between(today, c.getEndDate());
            if (daysLeft < 0) {
                continue; // đã quá hạn: việc của luồng OVERDUE
            }
            int tier = currentTier(daysLeft, CONTRACT_TIERS_DAYS);
            if (tier < 0) {
                continue;
            }
            String unit = c.getStorageUnit().getUnitCode();
            String where = c.getStorageUnit().getFacility().getName()
                    + (c.getStorageUnit().getFacility().getAddress() != null ? " (" + c.getStorageUnit().getFacility().getAddress() + ")" : "");
            String when = daysLeft == 0 ? "hôm nay" : "còn " + daysLeft + " ngày nữa";
            StringBuilder msg = new StringBuilder();
            msg.append("Hợp đồng thuê kho ô ").append(unit).append(" tại ").append(where)
                    .append(" sẽ hết hạn vào ngày ").append(c.getEndDate().format(DATE)).append(" (").append(when).append("). ")
                    .append("Nếu quý khách muốn thêm ngày để kho, xin vui lòng gia hạn. Sau thời hạn này mà không gia hạn, "
                            + "hợp đồng được xem là hoàn thành và quý khách đồng ý hoàn trả kho.");
            if (tier <= 3) {
                msg.append(" LƯU Ý QUAN TRỌNG: quý khách chỉ còn ").append(Math.max(daysLeft, 1))
                        .append(" ngày. Nếu đến ngày trả kho mà đồ vẫn còn trong kho, chưa dọn đi, hệ thống sẽ tính phí lưu kho theo "
                                + "số ngày quý khách để lại và trừ trực tiếp vào tiền đặt cọc đã nộp.");
            }
            // Khóa có ngày hết hạn: sau khi gia hạn (ngày hết hạn mới) sẽ được nhắc lại cho kỳ mới.
            if (notifier.notifyUserOnce("contract-" + tier + "d-" + c.getId() + "-" + c.getEndDate(), c.getCustomer(),
                    "Hợp đồng sắp hết hạn (" + when + ")",
                    tier <= 3 ? "Cảnh báo: hợp đồng " + when : "Hợp đồng thuê kho " + when,
                    msg.toString(), "/account/contracts")) {
                sent++;
            }
        }
        return sent;
    }
}
