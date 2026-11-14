package com.example.storage_api.service;

import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.Payment;
import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.entity.Reservation;
import com.example.storage_api.entity.ReservationStatus;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

/**
 * Theo dõi hạn đóng tiền thuê (Đợt 2): nhắc khi còn 9 / 7 / 5 / 3 ngày, tính phí trễ hạn mỗi ngày kể từ sau hạn
 * và tự hủy hợp đồng (thu hồi ô kho, xử lý cọc theo chính sách hủy) khi trễ quá số ngày Business Manager đặt (mặc định 10).
 * Chạy định kỳ từ ReminderScheduler; chạy lại nhiều lần vẫn an toàn.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class Stage2PaymentService {
    /** Các mốc nhắc (số ngày còn lại trước hạn). */
    public static final int[] REMIND_DAYS = {3, 5, 7, 9};
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final PaymentRepository paymentRepository;
    private final RentalContractRepository rentalContractRepository;
    private final ReservationService reservationService;
    private final RentalContractService rentalContractService;
    private final PolicyService policyService;
    private final OperationsNotificationService notifier;

    /** @return số thông báo / thay đổi đã thực hiện trong lần chạy này. */
    @Transactional
    public int process(LocalDate today) {
        int changes = 0;
        int grace = policyService.get().getStage2GraceDays();
        List<Payment> pending = paymentRepository.findByStatusAndPaymentType(PaymentStatus.PENDING, PaymentType.RENTAL);
        for (Payment rental : pending) {
            Reservation r = rental.getReservation();
            if (r == null || r.getStatus() == ReservationStatus.CANCELLED) {
                continue;
            }
            Optional<RentalContract> cOpt = rentalContractRepository.findByReservation_Id(r.getId());
            if (cOpt.isEmpty() || cOpt.get().getStatus() == ContractStatus.CANCELLED
                    || cOpt.get().getStatus() == ContractStatus.COMPLETED) {
                continue; // chưa có hợp đồng (chưa gán ô kho) thì chưa tính hạn
            }
            RentalContract c = cOpt.get();
            LocalDate due = Stage2Schedule.dueDate(r);
            if (due == null) {
                continue;
            }
            long daysLeft = ChronoUnit.DAYS.between(today, due);
            if (daysLeft >= 0) {
                changes += remind(rental, r, due, daysLeft);
            } else {
                long daysLate = -daysLeft;
                if (daysLate > grace) {
                    reservationService.terminateForUnpaidRental(r, daysLate);
                    changes++;
                } else {
                    changes += lateFee(rental, r, c, due, daysLate, grace);
                }
            }
        }
        return changes;
    }

    private int remind(Payment rental, Reservation r, LocalDate due, long daysLeft) {
        int tier = ReminderService.currentTier(daysLeft, REMIND_DAYS);
        if (tier < 0) {
            return 0;
        }
        String when = daysLeft == 0 ? "hôm nay" : "còn " + daysLeft + " ngày";
        String msg = "Quý khách cần thanh toán tiền thuê kho Đợt 2 (" + money(rental.getAmount()) + ") trước ngày "
                + due.format(DATE) + " (" + when + "). Quá hạn sẽ bị tính phí trễ mỗi ngày, và nếu trễ quá "
                + policyService.get().getStage2GraceDays() + " ngày hợp đồng sẽ bị hủy, ô kho được thu hồi.";
        return notifier.notifyUserOnce("stage2-" + tier + "d-" + rental.getId(), r.getCustomer(),
                "Sắp đến hạn đóng tiền thuê (" + when + ")", "Nhắc đóng tiền thuê Đợt 2 (" + when + ")",
                msg, "/account/contracts") ? 1 : 0;
    }

    private int lateFee(Payment rental, Reservation r, RentalContract c, LocalDate due, long daysLate, int grace) {
        int changes = 0;
        List<Payment> marked = paymentRepository.findByReservation_IdOrderByCreatedAtDesc(r.getId()).stream()
                .filter(p -> p.getPaymentType() == PaymentType.EXTRA_FEE
                        && p.getTransactionReference() != null && p.getTransactionReference().startsWith(Stage2Schedule.LATE_FEE_MARK))
                .toList();
        BigDecimal fee = rentalContractService.overdueFeeForDays(c, daysLate);
        Optional<Payment> pendingFee = marked.stream().filter(p -> p.getStatus() == PaymentStatus.PENDING).findFirst();
        if (pendingFee.isPresent()) {
            Payment f = pendingFee.get();
            if (f.getAmount().compareTo(fee) != 0) {
                f.setAmount(fee);
                paymentRepository.save(f);
                changes++;
            }
        } else if (marked.isEmpty()) {
            Payment f = new Payment();
            f.setCustomer(r.getCustomer());
            f.setReservation(r);
            f.setRentalContract(c);
            f.setPaymentType(PaymentType.EXTRA_FEE);
            f.setAmount(fee);
            f.setStatus(PaymentStatus.PENDING);
            f.setTransactionReference(Stage2Schedule.LATE_FEE_MARK);
            paymentRepository.save(f);
            changes++;
            notifier.notifyUserOnce("stage2-late-" + rental.getId(), r.getCustomer(), "Trễ hạn đóng tiền thuê",
                    "Đã quá hạn đóng tiền thuê Đợt 2",
                    "Hạn đóng tiền thuê Đợt 2 là " + due.format(DATE) + " đã qua. Hệ thống tính phí trễ hạn mỗi ngày (hiện "
                            + money(fee) + "). Nếu chưa thanh toán trong " + grace + " ngày kể từ hạn, hợp đồng sẽ bị hủy và ô kho bị thu hồi.",
                    "/account/contracts");
        }
        if (daysLate >= grace - 1) {
            changes += notifier.notifyUserOnce("stage2-final-" + rental.getId(), r.getCustomer(), "Sắp bị hủy hợp đồng",
                    "Cảnh báo: hợp đồng sắp bị hủy",
                    "Quý khách đã trễ hạn đóng tiền thuê Đợt 2 " + daysLate + " ngày. Nếu không thanh toán trong ngày mai, hợp đồng sẽ bị hủy "
                            + "và ô kho sẽ được thu hồi; tiền cọc xử lý theo chính sách hủy.", "/account/contracts") ? 1 : 0;
        }
        return changes;
    }

    private static String money(BigDecimal v) {
        return String.format("%,.0f", v) + " ₫";
    }
}
