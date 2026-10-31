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

import java.time.LocalDate;
import java.util.List;

/**
 * Nghiệp vụ PriceRule (giá thuê, đặt cọc, gia hạn, quá hạn, phụ phí, đền bù, giảm giá).
 *
 * Luồng tạo: HTTP -> PriceRuleController -> PriceRuleRequest -> PriceRuleService (kiểm tra hợp lệ)
 *            -> PriceRuleRepository -> Hibernate -> bảng price_rules.
 * Luồng giá hiện tại: GET /api/price-rules/current -> findEffective(scope chính xác, hôm nay)
 *            -> 0 rule: 404, 1 rule: PriceRuleResponse, >1 rule: 409.
 */
@Service
@RequiredArgsConstructor
public class PriceRuleService {

    private final PriceRuleRepository priceRuleRepository;
    private final FacilityService facilityService;
    private final UnitTypeService unitTypeService;
    // Chỉ dùng để ĐỌC bảng Users khi có createdBy (Users thuộc module khác, ta không sửa).
    private final UsersRepository usersRepository;
    private final FacilityAuthorizationService facilityAuthorizationService;

    // Danh sách cho màn hình quản lý, mỗi tham số lọc đều tuỳ chọn.
    @Transactional(readOnly = true)
    public List<PriceRuleResponse> search(PriceType priceType, Long facilityId, Integer unitTypeId) {
        return priceRuleRepository.search(priceType, facilityId, unitTypeId).stream()
                .map(this::toResponse).toList();
    }

    /**
     * Giá đang hiệu lực cho ĐÚNG scope được truyền vào. Không fallback giữa global / facility / unit type
     * vì requirement chưa quy định thứ tự ưu tiên.
     */
    @Transactional(readOnly = true)
    public PriceRuleResponse getCurrent(PriceType priceType, Long facilityId, Integer unitTypeId) {
        // Bước 1: kiểm tra Facility / UnitType (nếu có truyền) tồn tại và khớp nhau.
        resolveScope(facilityId, unitTypeId);

        // Bước 2: hỏi DB các rule đang hiệu lực hôm nay (LocalDate.now()) cho đúng scope.
        List<PriceRule> rules = priceRuleRepository.findEffective(priceType, facilityId, unitTypeId, LocalDate.now());
        // Bước 3a: không có rule nào -> 404.
        if (rules.isEmpty()) {
            throw new ResourceNotFoundException("No current " + priceType + " price rule for the given scope");
        }
        // Bước 3b: nhiều hơn 1 rule cùng hiệu lực -> dữ liệu mơ hồ, báo 409 chứ không chọn bừa một cái.
        if (rules.size() > 1) {
            throw new ConflictException("Multiple current " + priceType + " price rules found for the given scope");
        }
        // Bước 3c: đúng 1 rule -> trả về.
        return toResponse(rules.get(0));
    }

    // Lịch sử giá của đúng scope, gồm cả rule đã hết hạn / đã disable.
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
        return toResponse(priceRuleRepository.save(rule));
    }

    @Transactional
    public PriceRuleResponse update(Integer id, PriceRuleRequest request) {
        // Tìm rule cũ (không có -> 404), kiểm tra + ghi đè bằng apply(), rồi lưu (UPDATE).
        PriceRule rule = priceRuleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Price rule not found: " + id));
        // Kiểm tra trên cả bản ghi hiện có lẫn giá trị mới trong request.
        assertCanWrite(rule.getPriceType(), rule.getFacility() != null ? rule.getFacility().getId() : null);
        assertCanWrite(request.getPriceType(), request.getFacilityId());
        apply(rule, request);
        return toResponse(priceRuleRepository.save(rule));
    }

    // Disable mềm: IsActive = false. Giữ lại row để còn lịch sử giá.
    @Transactional
    public PriceRuleResponse disable(Integer id) {
        PriceRule rule = priceRuleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Price rule not found: " + id));
        assertCanWrite(rule.getPriceType(), rule.getFacility() != null ? rule.getFacility().getId() : null);
        rule.setActive(false);
        return toResponse(priceRuleRepository.save(rule));
    }

    // Kiểm tra toàn bộ request rồi ghi vào entity (dùng chung cho create và update).
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
            throw new AppException(HttpStatus.FORBIDDEN, "Facility managers can only manage RENTAL prices");
        }
        if (facilityId == null) {
            throw new AppException(HttpStatus.FORBIDDEN,
                    "Facility managers can only manage prices of their own facility");
        }
        facilityAuthorizationService.assertCanAccessFacility(facilityId);
    }

    private void apply(PriceRule rule, PriceRuleRequest request) {
        // Bước 1: ngày kết thúc (nếu có) không được sớm hơn ngày bắt đầu.
        if (request.getEffectiveTo() != null && request.getEffectiveTo().isBefore(request.getEffectiveFrom())) {
            throw new BadRequestException("Effective to must be on or after effective from");
        }

        // Bước 2: PERCENTAGE dùng Percentage; các CalculationType còn lại dùng Amount.
        boolean byPercentage = request.getCalculationType() == CalculationType.PERCENTAGE;
        // 2a: tính theo % mà thiếu Percentage -> lỗi.
        if (byPercentage && request.getPercentage() == null) {
            throw new BadRequestException("Percentage is required when calculation type is PERCENTAGE");
        }
        // 2b: tính theo tiền (FIXED/PER_DAY/PER_MONTH) mà thiếu Amount -> lỗi.
        if (!byPercentage && request.getAmount() == null) {
            throw new BadRequestException("Amount is required when calculation type is " + request.getCalculationType());
        }

        // Bước 3: kiểm tra scope: Facility/UnitType tồn tại, và UnitType thuộc Facility nếu có cả hai.
        Scope scope = resolveScope(request.getFacilityId(), request.getUnitTypeId());

        // Bước 4: createdBy là tuỳ chọn; nếu có thì phải là User có thật.
        Users createdBy = null;
        if (request.getCreatedBy() != null) {
            createdBy = usersRepository.findById(request.getCreatedBy())
                    .orElseThrow(() -> new ResourceNotFoundException("User not found: " + request.getCreatedBy()));
        }

        // Bước 5: ghi dữ liệu vào entity.
        // FacilityId = null nghĩa là rule áp dụng toàn hệ thống; UnitTypeId = null nghĩa là không phụ thuộc loại kho.
        rule.setFacility(scope.facility());
        rule.setUnitType(scope.unitType());
        rule.setPriceType(request.getPriceType());
        rule.setCalculationType(request.getCalculationType());
        // Chỉ lưu field tương ứng với CalculationType, field còn lại để NULL cho nhất quán.
        rule.setAmount(byPercentage ? null : request.getAmount());
        rule.setPercentage(byPercentage ? request.getPercentage() : null);
        rule.setEffectiveFrom(request.getEffectiveFrom());
        rule.setEffectiveTo(request.getEffectiveTo());
        // Chỉ điền người tạo lần đầu; khi update không ghi đè người tạo cũ.
        if (rule.getCreatedBy() == null) {
            rule.setCreatedBy(createdBy);
        }
    }

    /**
     * Kiểm tra Facility / UnitType tồn tại, và nếu có cả hai thì UnitType phải thuộc Facility đó.
     * Giá trị null được giữ nguyên (scope rộng).
     */
    private Scope resolveScope(Long facilityId, Integer unitTypeId) {
        // Có truyền id thì tìm (không thấy -> 404); không truyền thì giữ null.
        Facility facility = facilityId != null ? facilityService.findOrThrow(facilityId) : null;
        UnitType unitType = unitTypeId != null ? unitTypeService.findOrThrow(unitTypeId) : null;

        // UnitType phải thuộc Facility đang được chọn.
        if (facility != null && unitType != null && !unitType.getFacility().getId().equals(facility.getId())) {
            throw new BadRequestException("Unit type " + unitTypeId + " does not belong to facility " + facilityId);
        }
        return new Scope(facility, unitType);
    }

    // record: class nhỏ chỉ để gói hai giá trị (facility, unitType) trả về cùng lúc từ resolveScope.
    private record Scope(Facility facility, UnitType unitType) {
    }

    // Entity -> Response. Facility/UnitType/CreatedBy có thể null nên phải kiểm tra trước khi lấy id.
    private PriceRuleResponse toResponse(PriceRule r) {
        return PriceRuleResponse.builder()
                .id(r.getId())
                .facilityId(r.getFacility() != null ? r.getFacility().getId() : null)
                .unitTypeId(r.getUnitType() != null ? r.getUnitType().getId() : null)
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
