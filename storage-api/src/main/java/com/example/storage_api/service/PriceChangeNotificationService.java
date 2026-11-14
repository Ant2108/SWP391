package com.example.storage_api.service;

import com.example.storage_api.entity.CalculationType;
import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.PriceRule;
import com.example.storage_api.entity.PriceType;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.text.NumberFormat;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * Thông báo khi Business Manager (hoặc Facility Manager) thêm / sửa / ngừng / xóa luật giá.
 * - Chuông trong ứng dụng: mọi người liên quan. Email: chỉ khách bị ảnh hưởng và Facility Manager của cơ sở bị đổi giá.
 * - Lỗi gửi thông báo chỉ ghi log, không bao giờ làm hỏng việc lưu giá.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PriceChangeNotificationService {
    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    private final OperationsNotificationService notifier;
    private final UsersRepository usersRepository;
    private final RentalContractRepository rentalContractRepository;

    /** Chuỗi mô tả nội dung luật, dùng để biết lần sửa có thật sự làm đổi giá/ngày/trạng thái hay không. */
    public String signature(PriceRule r) {
        return r.getPriceType() + "|" + r.getCalculationType() + "|" + r.getAmount() + "|" + r.getPercentage() + "|"
                + r.getEffectiveFrom() + "|" + r.getEffectiveTo() + "|" + r.isActive() + "|"
                + (r.getFacility() != null ? r.getFacility().getId() : null) + "|"
                + (r.getUnitType() != null ? r.getUnitType().getId() : null);
    }

    public void notifyChange(PriceRule rule, String action, Users actor) {
        try {
            // Luật cọc số tiền cố định không còn được dùng nên không cần báo.
            if (rule.getPriceType() == PriceType.DEPOSIT && rule.getCalculationType() != CalculationType.PERCENTAGE) {
                return;
            }
            String text = describe(rule) + " " + action + ": " + valueText(rule) + ", " + periodText(rule) + ".";
            notifyInternal(rule, text, actor);
            notifyCustomers(rule);
        } catch (RuntimeException e) {
            log.warn("Could not send price change notifications: {}", e.getMessage());
        }
    }

    private void notifyInternal(PriceRule rule, String text, Users actor) {
        Map<Long, Users> bellOnly = new LinkedHashMap<>();
        Map<Long, Users> withEmail = new LinkedHashMap<>();
        usersRepository.findByRoleAndStatus(Role.SYSTEM_ADMIN, Status.ACTIVE).forEach(u -> bellOnly.put(u.getId(), u));
        usersRepository.findByRoleAndStatus(Role.BUSINESS_MANAGER, Status.ACTIVE).forEach(u -> bellOnly.put(u.getId(), u));
        Long facilityId = rule.getFacility() != null ? rule.getFacility().getId() : null;
        List<Users> managers = facilityId != null
                ? usersRepository.findByRoleAndFacility_IdAndStatus(Role.FACILITY_MANAGER, facilityId, Status.ACTIVE)
                : usersRepository.findByRoleAndStatus(Role.FACILITY_MANAGER, Status.ACTIVE);
        List<Users> staff = facilityId != null
                ? usersRepository.findByRoleAndFacility_IdAndStatus(Role.FACILITY_STAFF, facilityId, Status.ACTIVE)
                : usersRepository.findByRoleAndStatus(Role.FACILITY_STAFF, Status.ACTIVE);
        managers.forEach(u -> withEmail.put(u.getId(), u));
        staff.forEach(u -> bellOnly.put(u.getId(), u));

        String message = text + (actor != null ? " Người thực hiện: " + actor.getFullname() + "." : "");
        String subject = "Bảng giá vừa thay đổi";
        for (Users u : withEmail.values()) {
            if (actor == null || !Objects.equals(u.getId(), actor.getId())) {
                notifier.notifyUser(u, subject, subject, message, "/admin/price-rules");
            }
        }
        for (Users u : bellOnly.values()) {
            if (withEmail.containsKey(u.getId()) || (actor != null && Objects.equals(u.getId(), actor.getId()))) {
                continue;
            }
            notifier.notifyBellOnly(u, subject, message, "/admin/price-rules");
        }
    }

    private void notifyCustomers(PriceRule rule) {
        PriceType t = rule.getPriceType();
        if (t != PriceType.RENTAL && t != PriceType.RENEWAL && t != PriceType.OVERDUE) {
            return;
        }
        Long facilityId = rule.getFacility() != null ? rule.getFacility().getId() : null;
        Integer unitTypeId = rule.getUnitType() != null ? rule.getUnitType().getId() : null;
        String tail = t == PriceType.OVERDUE
                ? "Mức phí mới chỉ áp dụng nếu hợp đồng của bạn bị quá hạn."
                : "Hợp đồng hiện tại của bạn giữ nguyên giá đã ký; giá mới chỉ áp dụng cho lần gia hạn tiếp theo "
                + "và bạn sẽ được hỏi xác nhận trước khi gia hạn.";
        String message = describe(rule) + " vừa thay đổi: " + valueText(rule) + ", " + periodText(rule) + ". " + tail;
        Map<Long, Users> customers = new LinkedHashMap<>();
        for (RentalContract c : rentalContractRepository.findByStatusIn(
                List.of(ContractStatus.PENDING, ContractStatus.ACTIVE, ContractStatus.OVERDUE))) {
            if (c.getStorageUnit() == null) {
                continue;
            }
            if (facilityId != null && !facilityId.equals(c.getStorageUnit().getFacility().getId())) {
                continue;
            }
            if (unitTypeId != null && !unitTypeId.equals(c.getStorageUnit().getUnitType().getId())) {
                continue;
            }
            customers.putIfAbsent(c.getCustomer().getId(), c.getCustomer());
        }
        customers.values().forEach(u -> notifier.notifyUser(u, "Bảng giá dịch vụ thay đổi", "Bảng giá dịch vụ thay đổi",
                message, "/account/contracts"));
    }

    private String describe(PriceRule r) {
        String scope = r.getFacility() != null ? r.getFacility().getName() : "toàn hệ thống";
        String type = r.getUnitType() != null ? ", loại kho " + typeVi(r.getUnitType().getTypeName()) : "";
        return typeLabel(r.getPriceType()) + " (" + scope + type + ")";
    }

    private static String typeLabel(PriceType t) {
        return switch (t) {
            case RENTAL -> "Giá thuê";
            case DEPOSIT -> "Tiền cọc (theo %)";
            case RENEWAL -> "Giá gia hạn";
            case OVERDUE -> "Phí quá hạn";
            case EXTRA_FEE -> "Phụ phí";
            case DAMAGE_FEE -> "Phí hư hại";
            case DISCOUNT -> "Giảm giá";
        };
    }

    private static String typeVi(String name) {
        if (name == null) {
            return "";
        }
        return switch (name.trim().toUpperCase()) {
            case "SMALL" -> "Nhỏ";
            case "MEDIUM" -> "Vừa";
            case "LARGE" -> "Lớn";
            case "EXTRA_LARGE", "EXTRA LARGE", "XL" -> "Rất lớn";
            default -> name;
        };
    }

    private static String valueText(PriceRule r) {
        if (r.getCalculationType() == CalculationType.PERCENTAGE && r.getPercentage() != null) {
            return r.getPercentage().stripTrailingZeros().toPlainString() + "%";
        }
        if (r.getAmount() == null) {
            return "chưa có giá trị";
        }
        String money = NumberFormat.getInstance(new Locale("vi", "VN")).format(r.getAmount().longValue()) + " ₫";
        return switch (r.getCalculationType()) {
            case PER_MONTH -> money + "/tháng";
            case PER_DAY -> money + "/ngày";
            default -> money;
        };
    }

    private static String periodText(PriceRule r) {
        return "hiệu lực từ " + r.getEffectiveFrom().format(DAY)
                + (r.getEffectiveTo() != null ? " đến " + r.getEffectiveTo().format(DAY) : ", không giới hạn thời gian");
    }
}
