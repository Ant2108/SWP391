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
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class PriceRuleService {

    private final PriceRuleRepository priceRuleRepository;
    private final FacilityService facilityService;
    private final UnitTypeService unitTypeService;
    private final UsersRepository usersRepository;
    private final FacilityAuthorizationService facilityAuthorizationService;

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
            throw new ResourceNotFoundException("No current " + priceType + " price rule for the given scope");
        }
        if (rules.size() > 1) {
            throw new ConflictException("Multiple current " + priceType + " price rules found for the given scope");
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
        return toResponse(priceRuleRepository.save(rule));
    }

    @Transactional
    public PriceRuleResponse update(Integer id, PriceRuleRequest request) {
        PriceRule rule = priceRuleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Price rule not found: " + id));
        // Kiểm tra trên cả bản ghi hiện có lẫn giá trị mới trong request.
        assertCanWrite(rule.getPriceType(), rule.getFacility() != null ? rule.getFacility().getId() : null);
        assertCanWrite(request.getPriceType(), request.getFacilityId());
        apply(rule, request);
        return toResponse(priceRuleRepository.save(rule));
    }

    @Transactional
    public PriceRuleResponse disable(Integer id) {
        PriceRule rule = priceRuleRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Price rule not found: " + id));
        assertCanWrite(rule.getPriceType(), rule.getFacility() != null ? rule.getFacility().getId() : null);
        rule.setActive(false);
        return toResponse(priceRuleRepository.save(rule));
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
            throw new AppException(HttpStatus.FORBIDDEN, "Facility managers can only manage RENTAL prices");
        }
        if (facilityId == null) {
            throw new AppException(HttpStatus.FORBIDDEN,
                    "Facility managers can only manage prices of their own facility");
        }
        facilityAuthorizationService.assertCanAccessFacility(facilityId);
    }

    // Kiểm tra toàn bộ request rồi ghi vào entity (dùng chung cho create và update).
    private void apply(PriceRule rule, PriceRuleRequest request) {
        if (request.getEffectiveTo() != null && request.getEffectiveTo().isBefore(request.getEffectiveFrom())) {
            throw new BadRequestException("Effective to must be on or after effective from");
        }
        boolean byPercentage = request.getCalculationType() == CalculationType.PERCENTAGE;
        if (byPercentage && request.getPercentage() == null) {
            throw new BadRequestException("Percentage is required when calculation type is PERCENTAGE");
        }
        if (!byPercentage && request.getAmount() == null) {
            throw new BadRequestException("Amount is required when calculation type is " + request.getCalculationType());
        }
        Scope scope = resolveScope(request.getFacilityId(), request.getUnitTypeId());
        Users createdBy = null;
        if (request.getCreatedBy() != null) {
            createdBy = usersRepository.findById(request.getCreatedBy())
                    .orElseThrow(() -> new ResourceNotFoundException("User not found: " + request.getCreatedBy()));
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
            throw new BadRequestException("Unit type " + unitTypeId + " does not belong to facility " + facilityId);
        }
        return new Scope(facility, unitType);
    }

    private record Scope(Facility facility, UnitType unitType) {
    }

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
