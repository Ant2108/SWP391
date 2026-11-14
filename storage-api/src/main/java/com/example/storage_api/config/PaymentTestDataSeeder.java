package com.example.storage_api.config;

import com.example.storage_api.entity.CalculationType;
import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.PriceRule;
import com.example.storage_api.entity.PriceType;
import com.example.storage_api.entity.StorageUnit;
import com.example.storage_api.entity.UnitType;
import com.example.storage_api.reponsitory.FacilityRepository;
import com.example.storage_api.reponsitory.PriceRuleRepository;
import com.example.storage_api.reponsitory.StorageUnitRepository;
import com.example.storage_api.reponsitory.UnitTypeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * DỮ LIỆU THỬ THANH TOÁN (DEMO, XÓA FILE NÀY KHI NỘP BÀI): một loại kho "Thử thanh toán" giá 20.000 ₫/tháng
 * và một ô kho TEST-01 tại Kho Trung Tâm Quận 1, để thử chuyển tiền thật với số tiền nhỏ
 * (cọc 50% = 10.000 ₫ cho 1 tháng). Chạy lại nhiều lần vẫn an toàn, không tạo trùng.
 */
@Slf4j
@Profile("!test")
@Component
@RequiredArgsConstructor
public class PaymentTestDataSeeder {
    static final String TYPE_NAME = "Thử thanh toán";
    static final String UNIT_CODE = "TEST-01";

    private final FacilityRepository facilityRepository;
    private final UnitTypeRepository unitTypeRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final PriceRuleRepository priceRuleRepository;

    @Order(30)
    @EventListener(ApplicationReadyEvent.class)
    @Transactional
    public void seed() {
        Facility facility = facilityRepository.findAll().stream()
                .filter(f -> f.getName() != null && f.getName().contains("Quận 1") && f.getName().contains("Trung Tâm"))
                .findFirst().orElse(null);
        if (facility == null) {
            return;
        }
        UnitType type = unitTypeRepository.findByFacility_IdOrderByTypeNameAsc(facility.getId()).stream()
                .filter(t -> TYPE_NAME.equalsIgnoreCase(t.getTypeName())).findFirst().orElse(null);
        if (type == null) {
            type = new UnitType();
            type.setFacility(facility);
            type.setTypeName(TYPE_NAME);
            type.setWidth(new BigDecimal("1.00"));
            type.setLength(new BigDecimal("1.00"));
            type.setHeight(new BigDecimal("1.00"));
            type.setSizeDescription("Ô thử nghiệm 1m x 1m");
            type.setDescription("Ô dùng để thử thanh toán thật với số tiền nhỏ (dữ liệu demo).");
            type.setActive(true);
            type = unitTypeRepository.save(type);
        }
        if (!storageUnitRepository.existsByFacility_IdAndUnitCodeIgnoreCase(facility.getId(), UNIT_CODE)) {
            StorageUnit unit = new StorageUnit();
            unit.setFacility(facility);
            unit.setUnitType(type);
            unit.setUnitCode(UNIT_CODE);
            unit.setFloor("1");
            unit.setLocation("Khu thử nghiệm");
            storageUnitRepository.save(unit);
        }
        final UnitType finalType = type;
        boolean hasRule = priceRuleRepository.findAll().stream().anyMatch(r ->
                r.isActive() && r.getPriceType() == PriceType.RENTAL && r.getUnitType() != null
                        && r.getUnitType().getId().equals(finalType.getId()));
        if (!hasRule) {
            PriceRule rule = new PriceRule();
            rule.setFacility(facility);
            rule.setUnitType(type);
            rule.setPriceType(PriceType.RENTAL);
            rule.setCalculationType(CalculationType.PER_MONTH);
            rule.setAmount(new BigDecimal("20000"));
            rule.setEffectiveFrom(LocalDate.now().minusDays(1));
            rule.setActive(true);
            priceRuleRepository.save(rule);
        }
        log.info("Payment test data ready: unit type '{}' + unit {} at {} (20,000 VND/month)", TYPE_NAME, UNIT_CODE, facility.getName());
    }
}
