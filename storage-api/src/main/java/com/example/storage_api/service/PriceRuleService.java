package com.example.storage_api.service;

import com.example.storage_api.entity.CalculationType;
import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.PriceRule;
import com.example.storage_api.entity.PriceType;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.UnitType;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.AppException;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.PriceRuleResponse;
import com.example.storage_api.model.request.PriceRuleRequest;
import com.example.storage_api.reponsitory.PriceRuleRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PriceRuleService {

    private final PriceRuleRepository priceRuleRepository;
    private final FacilityService facilityService;
    private final UnitTypeService unitTypeService;
    private final UsersRepository usersRepository;
    private final FacilityAuthorizationService facilityAuthorizationService;
    private final PriceChangeNotificationService priceChangeNotifier;

    // Giảm giá theo phần trăm tối đa 100%.
    private static final BigDecimal MAX_DISCOUNT_PERCENT = BigDecimal.valueOf(100);

    @Transactional(readOnly = true)
    public List<PriceRuleResponse> search(PriceType priceType, Long facilityId, Integer unitTypeId) {
        return priceRuleRepository.search(priceType, facilityId, unitTypeId).stream()
                .map(this::toResponse).toList();
    }

    @Transactional(readOnly = true, noRollbackFor = {
            ResourceNotFoundException.class,
            BadRequestException.class,
            ConflictException.class
    })
    public PriceRuleResponse getCurrent(PriceType priceType, Long facilityId, Integer unitTypeId) {
        resolveScope(facilityId, unitTypeId);
        List<PriceRule> rules = priceRuleRepository.findEffective(priceType, facilityId, unitTypeId, LocalDate.now());
        if (rules.isEmpty()) {
            throw new ResourceNotFoundException("Chưa có luật giá " + priceType + " đang áp dụng cho phạm vi này");
        }
        if (rules.size() > 1) {
            throw new ConflictException("Có nhiều luật giá " + priceType + " cùng áp dụng cho phạm vi này");
        }
        return toResponse(rules.get(0));
    }

    @Transactional(readOnly = true)
    public Optional<PriceRuleResponse> findCurrentOptional(PriceType priceType, Long facilityId, Integer unitTypeId) {
        List<PriceRule> rules = priceRuleRepository.findEffective(priceType, facilityId, unitTypeId, LocalDate.now());
        if (rules.isEmpty() && unitTypeId != null) {
            rules = priceRuleRepository.findEffective(priceType, facilityId, null, LocalDate.now());
        }
        if (rules.isEmpty() && facilityId != null) {
            rules = priceRuleRepository.findEffective(priceType, null, null, LocalDate.now());
        }
        return rules.isEmpty() ? Optional.empty() : Optional.of(toResponse(rules.get(0)));
    }

    @Transactional(readOnly = true)
    public List<PriceRuleResponse> getHistory(PriceType priceType, Long facilityId, Integer unitTypeId) {
        resolveScope(facilityId, unitTypeId);
        return priceRuleRepository.findHistory(priceType, facilityId, unitTypeId).stream()
                .map(this::toResponse).toList();
    }

    @Transactional
    public PriceRuleResponse create(PriceRuleRequest request) {
        // Bước 1: tạo entity rỗng. Bước 2: apply() kiểm tra hợp lệ rồi chép dữ liệu. Bước 3: lưu (INSERT).
        assertCanWrite(request.getPriceType(), request.getFacilityId());
        PriceRule rule = new PriceRule();
        apply(rule, request);
        PriceRule saved = priceRuleRepository.save(rule);
        priceChangeNotifier.notifyChange(saved, "đã được thêm mới", facilityAuthorizationService.currentUser());
        return toResponse(saved);
    }

    @Transactional
    public PriceRuleResponse update(Integer id, PriceRuleRequest request) {
        PriceRule rule = priceRuleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy luật giá: " + id));
        // Kiểm tra trên cả bản ghi hiện có lẫn giá trị mới trong request.
        assertCanWrite(rule.getPriceType(), rule.getFacility() != null ? rule.getFacility().getId() : null);
        assertCanWrite(request.getPriceType(), request.getFacilityId());
        String before = priceChangeNotifier.signature(rule);
        apply(rule, request);
        PriceRule saved = priceRuleRepository.save(rule);
        if (!before.equals(priceChangeNotifier.signature(saved))) {
            priceChangeNotifier.notifyChange(saved, "đã được cập nhật", facilityAuthorizationService.currentUser());
        }
        return toResponse(saved);
    }

    /** Xóa hẳn luật giá (khoản thu đã tạo vẫn giữ số tiền riêng nên không bị ảnh hưởng). */
    @Transactional
    public void delete(Integer id) {
        PriceRule rule = priceRuleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy luật giá: " + id));
        assertCanWrite(rule.getPriceType(), rule.getFacility() != null ? rule.getFacility().getId() : null);
        priceRuleRepository.delete(rule);
        priceChangeNotifier.notifyChange(rule, "đã bị xóa", facilityAuthorizationService.currentUser());
    }

    @Transactional
    public PriceRuleResponse disable(Integer id) {
        PriceRule rule = priceRuleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy luật giá: " + id));
        assertCanWrite(rule.getPriceType(), rule.getFacility() != null ? rule.getFacility().getId() : null);
        boolean wasActive = rule.isActive();
        rule.setActive(false);
        PriceRule saved = priceRuleRepository.save(rule);
        if (wasActive) {
            priceChangeNotifier.notifyChange(saved, "đã ngừng áp dụng", facilityAuthorizationService.currentUser());
        }
        return toResponse(saved);
    }

    /**
     * Phân quyền ghi giá:
     *  - Facility Manager: chỉ giá thuê (RENTAL) và chỉ của cơ sở được phân công (không được giá toàn hệ thống).
     *  - Business Manager / Admin: không giới hạn.
     * Chỉ dùng cho các hàm GHI. Các hàm đọc (search, getCurrent, getHistory) không kiểm tra vì module
     * đặt chỗ / thanh toán gọi getCurrent để tính tiền.
     */
    private void assertCanWrite(PriceType priceType, Long facilityId) {
        if (facilityAuthorizationService.currentUser().getRole() != Role.FACILITY_MANAGER) {
            return;
        }
        if (priceType != PriceType.RENTAL) {
            throw new AppException(HttpStatus.FORBIDDEN, "Quản lý cơ sở chỉ được quản lý giá thuê");
        }
        if (facilityId == null) {
            throw new AppException(HttpStatus.FORBIDDEN,
                    "Quản lý cơ sở chỉ được quản lý giá của cơ sở mình");
        }
        facilityAuthorizationService.assertCanAccessFacility(facilityId);
    }

    // Kiểm tra toàn bộ request rồi ghi vào entity (dùng chung cho create và update).
    private void apply(PriceRule rule, PriceRuleRequest request) {
        if (request.getEffectiveTo() != null && request.getEffectiveTo().isBefore(request.getEffectiveFrom())) {
            throw new BadRequestException("Ngày kết thúc hiệu lực phải bằng hoặc sau ngày bắt đầu");
        }
        boolean byPercentage = request.getCalculationType() == CalculationType.PERCENTAGE;
        if (byPercentage && request.getPercentage() == null) {
            throw new BadRequestException("Vui lòng nhập phần trăm khi chọn cách tính theo phần trăm");
        }
        // Giảm giá theo % không được quá 100% (quá 100% làm giá cuối cùng thành số âm).
        if (byPercentage && request.getPriceType() == PriceType.DISCOUNT
                && request.getPercentage().compareTo(MAX_DISCOUNT_PERCENT) > 0) {
            throw new BadRequestException("Giảm giá không được vượt quá 100%");
        }
        if (!byPercentage && request.getAmount() == null) {
            throw new BadRequestException("Vui lòng nhập số tiền cho cách tính đã chọn");
        }
        Scope scope = resolveScope(request.getFacilityId(), request.getUnitTypeId());
        // Không cho hai rule cùng loại + cùng scope cùng hiệu lực trong một khoảng ngày (hệ thống không biết lấy giá nào).
        if (rule.isActive()) {
            LocalDate to = request.getEffectiveTo() != null ? request.getEffectiveTo() : LocalDate.of(9999, 12, 31);
            List<PriceRule> clash = priceRuleRepository.findOverlapping(request.getPriceType(), request.getFacilityId(),
                    request.getUnitTypeId(), request.getEffectiveFrom(), to, rule.getId() != null ? rule.getId() : -1);
            if (!clash.isEmpty()) {
                throw new ConflictException("Đã có luật giá " + request.getPriceType() + " đang áp dụng cho phạm vi này trong khoảng thời gian đó (luật #"
                        + clash.get(0).getId() + "). Hãy vô hiệu hóa luật cũ hoặc đổi ngày hiệu lực.");
            }
        }
        Users createdBy = null;
        if (request.getCreatedBy() != null) {
            createdBy = usersRepository.findById(request.getCreatedBy())
                    .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy người dùng: " + request.getCreatedBy()));
        }
        rule.setFacility(scope.facility());
        rule.setUnitType(scope.unitType());
        rule.setPriceType(request.getPriceType());
        rule.setCalculationType(request.getCalculationType());
        rule.setAmount(byPercentage ? null : request.getAmount());
        rule.setPercentage(byPercentage ? request.getPercentage() : null);
        rule.setEffectiveFrom(request.getEffectiveFrom());
        rule.setEffectiveTo(request.getEffectiveTo());
        if (rule.getCreatedBy() == null) {
            rule.setCreatedBy(createdBy);
        }
    }

    private Scope resolveScope(Long facilityId, Integer unitTypeId) {
        Facility facility = facilityId != null ? facilityService.findOrThrow(facilityId) : null;
        UnitType unitType = unitTypeId != null ? unitTypeService.findOrThrow(unitTypeId) : null;
        if (facility != null && unitType != null && !unitType.getFacility().getId().equals(facility.getId())) {
            throw new BadRequestException("Loại kho " + unitTypeId + " không thuộc cơ sở " + facilityId);
        }
        return new Scope(facility, unitType);
    }

    private record Scope(Facility facility, UnitType unitType) {
    }

    private PriceRuleResponse toResponse(PriceRule r) {
        return PriceRuleResponse.builder()
                .id(r.getId())
                .facilityId(r.getFacility() != null ? r.getFacility().getId() : null)
                .facilityName(r.getFacility() != null ? r.getFacility().getName() : null)
                .unitTypeId(r.getUnitType() != null ? r.getUnitType().getId() : null)
                .unitTypeName(r.getUnitType() != null ? r.getUnitType().getTypeName() : null)
                .priceType(r.getPriceType())
                .calculationType(r.getCalculationType())
                .amount(r.getAmount())
                .percentage(r.getPercentage())
                .effectiveFrom(r.getEffectiveFrom())
                .effectiveTo(r.getEffectiveTo())
                .active(r.isActive())
                .createdBy(r.getCreatedBy() != null ? r.getCreatedBy().getId() : null)
                .createdAt(r.getCreatedAt())
                .updatedAt(r.getUpdatedAt())
                .build();
    }
}
