package com.example.storage_api.service;

import com.example.storage_api.entity.Reservation;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Chống lạm dụng đặt kho nhưng không thanh toán:
 * - Mỗi đơn tự hủy vì không đóng cọc trong 24 giờ tính là 1 lần vi phạm liên tiếp (đóng cọc thành công thì về 0).
 * - Lần vi phạm thứ 2: gửi cảnh báo. Khi khách chuẩn bị đặt đơn thứ 3 phải tích đồng ý chịu trách nhiệm.
 * - Vi phạm lần thứ 3: khóa tài khoản 24 giờ, báo manager liên hệ khách. Tái phạm sau khi mở khóa: khóa vĩnh viễn.
 * - Admin mở khóa bằng cách đặt tài khoản về ACTIVE (bộ đếm vi phạm được xóa).
 */
@Service
@RequiredArgsConstructor
public class AccountGuardService {
    /** Tiền tố thông báo lỗi để giao diện nhận biết cần hiện hộp cảnh báo. */
    public static final String WARNING_PREFIX = "STREAK_WARNING:";
    public static final int WARN_AT = 2;
    public static final int LOCK_AT = 3;

    private final UsersRepository usersRepository;
    private final OperationsNotificationService notifier;

    private static int n(Integer v) {
        return v == null ? 0 : v;
    }

    /** Gọi trước khi tạo đơn mới: nếu khách đã vi phạm 2 lần liên tiếp thì bắt buộc tích đồng ý. */
    public void requireAcknowledgement(Users customer, Boolean acknowledged) {
        if (n(customer.getUnpaidStreak()) >= WARN_AT && !Boolean.TRUE.equals(acknowledged)) {
            throw new ConflictException(WARNING_PREFIX + "Quý khách đã 2 lần liên tiếp đặt kho nhưng không thanh toán đúng hạn. "
                    + "Nếu tiếp tục đặt mà không thanh toán, hành vi này được xem là cố ý gây ảnh hưởng đến việc giữ kho của khách khác "
                    + "và tài khoản sẽ bị vô hiệu hóa. Vui lòng cân nhắc và xác nhận chịu trách nhiệm để tiếp tục.");
        }
    }

    /** Khách đóng cọc thành công: xóa chuỗi vi phạm. */
    @Transactional
    public void onDepositPaid(Users customer) {
        if (n(customer.getUnpaidStreak()) != 0) {
            customer.setUnpaidStreak(0);
            usersRepository.save(customer);
        }
    }

    /** Đơn của khách tự hủy vì quá 24 giờ chưa đóng cọc. */
    @Transactional
    public void onUnpaidExpiry(Reservation r) {
        Users u = r.getCustomer();
        int streak = n(u.getUnpaidStreak()) + 1;
        u.setUnpaidStreak(streak);
        if (streak == WARN_AT) {
            notifier.notifyUser(u, "Cảnh báo đặt kho không thanh toán", "Cảnh báo: 2 đơn liên tiếp không thanh toán",
                    "Quý khách đã có 2 đơn đặt kho liên tiếp bị hủy do không đóng cọc đúng hạn. Nếu lần đặt tiếp theo cũng không thanh toán, "
                            + "hành vi này được xem là cố ý và tài khoản sẽ bị vô hiệu hóa 24 giờ. Vui lòng chỉ đặt kho khi quý khách sẵn sàng thanh toán.",
                    "/account/reservations");
        } else if (streak >= LOCK_AT) {
            lock(u, r);
        }
        usersRepository.save(u);
    }

    private void lock(Users u, Reservation r) {
        int locks = n(u.getAbuseLockCount()) + 1;
        u.setAbuseLockCount(locks);
        u.setUnpaidStreak(0);
        u.setStatus(Status.INACTIVE);
        String contact = u.getPhone() != null && !u.getPhone().isBlank() ? " Số điện thoại: " + u.getPhone() + "." : " (khách chưa có số điện thoại)";
        if (locks == 1) {
            u.setLockedUntil(LocalDateTime.now().plusHours(24));
            notifier.emailAddress(u.getEmail(), u.getFullname(), "Tài khoản bị tạm khóa 24 giờ", "Tài khoản bị tạm khóa 24 giờ",
                    "Do 3 đơn đặt kho liên tiếp không thanh toán, tài khoản của quý khách bị vô hiệu hóa trong 24 giờ và sẽ tự mở lại sau đó. "
                            + "Nếu tái phạm, tài khoản sẽ bị khóa vĩnh viễn. Cần hỗ trợ xin liên hệ nhân viên SafeSpace.");
            notifier.notifyFacilityManagers(r.getFacility().getId(), "Customer locked for 24h", "Khách bị khóa 24 giờ vì đặt kho không thanh toán",
                    u.getFullname() + " (" + u.getEmail() + ")" + contact + " đã 3 lần liên tiếp đặt kho không thanh toán. Vui lòng liên hệ khách để làm rõ.",
                    "/admin/reservations");
        } else {
            u.setLockedUntil(null);
            notifier.emailAddress(u.getEmail(), u.getFullname(), "Tài khoản bị khóa", "Tài khoản bị khóa",
                    "Do tái phạm đặt kho không thanh toán, tài khoản của quý khách đã bị khóa. Vui lòng liên hệ SafeSpace để được xem xét.");
            notifier.notifyFacilityManagers(r.getFacility().getId(), "Customer permanently locked", "Khách bị khóa vĩnh viễn",
                    u.getFullname() + " (" + u.getEmail() + ")" + contact + " tái phạm đặt kho không thanh toán sau khi bị khóa tạm. Tài khoản bị khóa; chỉ admin mở lại được.",
                    "/admin/reservations");
        }
    }

    /** Tự mở khóa các tài khoản đã hết 24 giờ khóa tạm. @return số tài khoản được mở khóa. */
    @Transactional
    public int unlockExpired(LocalDateTime now) {
        List<Users> due = usersRepository.findByLockedUntilLessThanEqualAndStatus(now, Status.INACTIVE);
        for (Users u : due) {
            u.setStatus(Status.ACTIVE);
            u.setLockedUntil(null);
            usersRepository.save(u);
        }
        return due.size();
    }
}
