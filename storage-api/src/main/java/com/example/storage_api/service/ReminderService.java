package com.example.storage_api.service;

import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.entity.Reservation;
import com.example.storage_api.entity.ReservationStatus;
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
import java.util.List;

/**
 * Thông báo nhắc tự động theo thời gian (chạy định kỳ bởi ReminderScheduler):
 * - Sắp hết hạn trả cọc: còn không quá 6 giờ so với hạn 24 giờ kể từ lúc đặt kho.
 * - Ngày mai đến nhận kho.
 * - Hợp đồng sắp hết hạn: còn 7 ngày, và còn 1 ngày hoặc hôm nay là ngày cuối.
 *
 * Mỗi nhắc chỉ gửi một lần nhờ khóa chống trùng, nên chạy lại nhiều lần vẫn an toàn.
 * Hạn 24 giờ và các mốc ngày theo đúng quy tắc của Member 3 (đặt kho, hợp đồng).
 */
@Service
@RequiredArgsConstructor
public class ReminderService {

    public static final int DEPOSIT_REMIND_HOURS = 6;
    public static final int DEPOSIT_DEADLINE_HOURS = 24;
    public static final int CONTRACT_REMIND_DAYS = 7;

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");

    private final ReservationRepository reservationRepository;
    private final RentalContractRepository rentalContractRepository;
    private final PaymentRepository paymentRepository;
    private final OperationsNotificationService notifier;

    /** @return số thông báo nhắc đã gửi trong lần chạy này. */
    @Transactional
    public int sendReminders(LocalDateTime now) {
        return depositDeadlineReminders(now) + pickupTomorrowReminders(now.toLocalDate())
                + contractEndingReminders(now.toLocalDate());
    }

    // ===================== SẮP HẾT HẠN TRẢ CỌC =====================

    private int depositDeadlineReminders(LocalDateTime now) {
        int sent = 0;
        for (Reservation r : reservationRepository.findByStatusOrderByCreatedAtDesc(ReservationStatus.PENDING)) {
            if (r.getCreatedAt() == null) {
                continue;
            }
            LocalDateTime deadline = r.getCreatedAt().plusHours(DEPOSIT_DEADLINE_HOURS);
            Duration left = Duration.between(now, deadline);
            if (left.isNegative() || left.isZero() || left.compareTo(Duration.ofHours(DEPOSIT_REMIND_HOURS)) > 0) {
                continue;
            }
            if (paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                    r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID)) {
                continue;
            }
            long hours = Math.max(1, (left.toMinutes() + 59) / 60);
            if (notifier.notifyUserOnce("deposit-6h-" + r.getId(), r.getCustomer(), "Deposit due soon",
                    "Your deposit is due soon",
                    "Reservation #" + r.getId() + " at " + r.getFacility().getName() + " will be cancelled automatically in about "
                            + hours + " hour(s) (" + deadline.format(TIME) + ") if the 50% deposit is not paid. Pay now to keep your unit.",
                    "/account/reservations/" + r.getId())) {
                sent++;
            }
        }
        return sent;
    }

    // ===================== NGÀY MAI ĐẾN NHẬN KHO =====================

    private int pickupTomorrowReminders(LocalDate today) {
        LocalDate tomorrow = today.plusDays(1);
        int sent = 0;
        List<Reservation> due = reservationRepository.findByStartDateAndStatusIn(tomorrow,
                List.of(ReservationStatus.PENDING, ReservationStatus.ASSIGNED, ReservationStatus.CONFIRMED));
        for (Reservation r : due) {
            boolean rentalPaid = paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                    r.getId(), PaymentType.RENTAL, PaymentStatus.PAID);
            String todo = rentalPaid ? "You have paid everything, just come and our staff will check you in."
                    : "Please bring the payment for the rent (stage 2); staff check you in once it is paid.";
            // Khóa có ngày nhận kho: nếu manager dời lịch sang ngày khác thì ngày mới lại được nhắc.
            if (notifier.notifyUserOnce("pickup-1d-" + r.getId() + "-" + r.getStartDate(), r.getCustomer(),
                    "Pickup tomorrow", "Your pickup is tomorrow",
                    "Tomorrow (" + r.getStartDate() + ") is your pickup day at " + r.getFacility().getName() + ". " + todo,
                    "/account/appointments")) {
                sent++;
            }
        }
        return sent;
    }

    // ===================== HỢP ĐỒNG SẮP HẾT HẠN =====================

    private int contractEndingReminders(LocalDate today) {
        int sent = 0;
        for (RentalContract c : rentalContractRepository.findByStatusAndEndDateLessThanEqual(
                ContractStatus.ACTIVE, today.plusDays(CONTRACT_REMIND_DAYS))) {
            long daysLeft = ChronoUnit.DAYS.between(today, c.getEndDate());
            if (daysLeft < 0) {
                continue; // đã quá hạn: việc của luồng OVERDUE
            }
            String when = daysLeft == 0 ? "today" : daysLeft == 1 ? "tomorrow" : "in " + daysLeft + " days";
            String tier = daysLeft <= 1 ? "1d" : "7d";
            // Khóa có ngày hết hạn: sau khi gia hạn (ngày hết hạn mới) sẽ được nhắc lại cho kỳ mới.
            if (notifier.notifyUserOnce("contract-" + tier + "-" + c.getId() + "-" + c.getEndDate(), c.getCustomer(),
                    "Rental ending soon", "Your rental ends " + when,
                    "Contract #" + c.getId() + " (unit " + c.getStorageUnit().getUnitCode() + ") ends on " + c.getEndDate()
                            + ". Renew now to keep your unit, or return it to the facility before the end date to avoid overdue fees.",
                    "/account/contracts")) {
                sent++;
            }
        }
        return sent;
    }
}
