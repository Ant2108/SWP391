package com.example.storage_api.config;

import com.example.storage_api.entity.CalculationType;
import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.FacilityStatus;
import com.example.storage_api.entity.PriceRule;
import com.example.storage_api.entity.PriceType;
import com.example.storage_api.entity.StockStatus;
import com.example.storage_api.entity.StorageUnit;
import com.example.storage_api.entity.UnitStatus;
import com.example.storage_api.entity.UnitType;
import com.example.storage_api.reponsitory.FacilityRepository;
import com.example.storage_api.reponsitory.PriceRuleRepository;
import com.example.storage_api.reponsitory.StorageUnitRepository;
import com.example.storage_api.reponsitory.UnitTypeRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * DataSeeder = "người gieo dữ liệu mẫu": mỗi lần app khởi động, nó tự thêm dữ liệu mẫu vào DB
 * để bạn có sẵn dữ liệu test bằng Postman / SSMS mà không phải nhập tay.
 *
 * Luồng: Spring Boot khởi động -> tạo các Repository -> CommandLineRunner chạy -> Repository.save(...)
 *        -> JPA/Hibernate -> câu INSERT -> SQL Server.
 *
 * Nguyên tắc:
 * - Seeder này phục vụ môi trường development/test. Không dùng dữ liệu mẫu này cho production.
 * - Idempotent (chạy bao nhiêu lần cũng chỉ ra cùng một kết quả): trước khi thêm từng bản ghi, kiểm tra
 *   bản ghi đó đã có chưa theo "natural key"; chưa có mới thêm. Không bao giờ xoá hay sửa dữ liệu có sẵn.
 * - @Profile("!test"): chạy ở mọi profile trừ "test" (integration test dùng H2 và tự dựng dữ liệu riêng,
 *   nếu seed vào đó sẽ làm sai kết quả đếm và vướng FK khi test gọi deleteAll()).
 * - Các cột text của Facility / UnitType / StorageUnit là nvarchar (@Nationalized) nên seed lưu được tiếng Việt có dấu.
 * - Auth thuộc module khác nên PriceRule.CreatedBy luôn để null (cột nullable); không tạo User, không hard-code UserId.
 */
@Slf4j // Lombok tạo sẵn biến "log" để ghi log
@Profile("!test")
@Configuration // Báo Spring: class này chứa các @Bean để Spring quản lý
public class DataSeeder {

    // @Bean: Spring gọi method này lúc khởi động và giữ kết quả (CommandLineRunner) để chạy sau khi app sẵn sàng.
    // Các tham số là 4 Repository: Spring tự tạo và truyền vào (dependency injection).
    @Bean
    CommandLineRunner seedData(FacilityRepository facilityRepository,
                               UnitTypeRepository unitTypeRepository,
                               StorageUnitRepository storageUnitRepository,
                               PriceRuleRepository priceRuleRepository) {
        // CommandLineRunner = một đoạn code Spring chạy MỘT LẦN ngay sau khi context khởi tạo xong
        // (lúc này kết nối DB và Repository đã sẵn sàng). "args" là tham số dòng lệnh, ở đây không dùng.
        return args -> {
            // Thứ tự BẮT BUỘC theo khoá ngoại: Facility -> UnitType -> StorageUnit -> PriceRule.
            // Cái sau cần cái trước đã tồn tại thì mới INSERT được.
            seedFacilities(facilityRepository);
            seedUnitTypes(facilityRepository, unitTypeRepository);
            seedStorageUnits(facilityRepository, unitTypeRepository, storageUnitRepository);
            seedPriceRules(facilityRepository, unitTypeRepository, priceRuleRepository);
            seedAreaFacilities(facilityRepository, unitTypeRepository, storageUnitRepository, priceRuleRepository);
            log.info("DataSeeder: seed dữ liệu mẫu hoàn tất.");
        };
    }

    // ===================== FACILITIES =====================

    private void seedFacilities(FacilityRepository repo) {
        // Facility phải được seed trước vì UnitType có FK tới Facility.
        // Facility 1 và 2: ACTIVE để test dữ liệu bình thường.
        findOrCreateFacility(repo, "Kho Trung Tâm Quận 1", "123 Nguyễn Huệ, Quận 1, TP.HCM", "0901000001",
                LocalTime.of(8, 0), LocalTime.of(22, 0), FacilityStatus.ACTIVE);
        findOrCreateFacility(repo, "Kho Thủ Đức", "456 Võ Văn Ngân, Thủ Đức, TP.HCM", "0901000002",
                LocalTime.of(7, 30), LocalTime.of(21, 30), FacilityStatus.ACTIVE);
        // Facility INACTIVE để test Facility đã disable.
        findOrCreateFacility(repo, "Kho Quận 7", "789 Nguyễn Thị Thập, Quận 7, TP.HCM", "0901000003",
                LocalTime.of(8, 0), LocalTime.of(20, 0), FacilityStatus.INACTIVE);
    }

    // Dùng tên Facility làm natural key để tránh insert trùng mỗi lần restart.
    // Natural key = thông tin có thật ngoài đời dùng để nhận ra một bản ghi (khác với id tự tăng).
    private Facility findOrCreateFacility(FacilityRepository repo, String name, String address, String phone,
                                          LocalTime opening, LocalTime closing, FacilityStatus status) {
        // Bước 1: tìm Facility theo tên. Bước 2: nếu ĐÃ CÓ thì trả luôn (không làm gì thêm).
        // orElseGet(...): chỉ khi chưa có mới chạy đoạn code trong ngoặc để tạo mới.
        return repo.findFirstByName(name).orElseGet(() -> {
            // Bước 3: tạo object Facility và điền dữ liệu.
            Facility f = new Facility();
            f.setName(name);
            f.setAddress(address);
            f.setPhone(phone);
            f.setOpeningTime(opening);
            f.setClosingTime(closing);
            f.setStatus(status);
            log.info("DataSeeder: tạo Facility '{}'", name);
            // Bước 4: save => Hibernate sinh INSERT gửi xuống SQL Server.
            return repo.save(f);
        });
    }

    // ===================== UNIT TYPES =====================

    private void seedUnitTypes(FacilityRepository facilityRepo, UnitTypeRepository repo) {
        // Lấy lại Facility từ DB (đã có id thật) để UnitType có đúng Foreign Key.
        Facility f1 = facilityRepo.findFirstByName("Kho Trung Tâm Quận 1").orElseThrow();
        Facility f2 = facilityRepo.findFirstByName("Kho Thủ Đức").orElseThrow();

        // Facility 1: SMALL / MEDIUM / LARGE (các số "2.00"... là rộng, dài, cao theo mét).
        findOrCreateUnitType(repo, f1, "SMALL", "2.00", "2.00", "2.50", "2m x 2m",
                "Kho nhỏ phù hợp lưu trữ cá nhân.", true);
        findOrCreateUnitType(repo, f1, "MEDIUM", "3.00", "3.00", "2.50", "3m x 3m", "Kho trung bình.", true);
        findOrCreateUnitType(repo, f1, "LARGE", "5.00", "5.00", "3.00", "5m x 5m", "Kho lớn.", true);

        // Facility 2 cũng có SMALL: hợp lệ vì unique là (FacilityId, TypeName), khác Facility.
        findOrCreateUnitType(repo, f2, "SMALL", "2.00", "2.50", "2.50", null, null, true);
        findOrCreateUnitType(repo, f2, "MEDIUM", "3.50", "3.50", "2.80", null, null, true);
        // OLD_TYPE IsActive = false để test UnitType đã disable.
        findOrCreateUnitType(repo, f2, "OLD_TYPE", null, null, null, null,
                "Unit type dùng để test disable.", false);
    }

    // Natural key: Facility + TypeName.
    private UnitType findOrCreateUnitType(UnitTypeRepository repo, Facility facility, String typeName,
                                          String width, String length, String height,
                                          String sizeDescription, String description, boolean active) {
        // Đã có UnitType cùng tên trong Facility này thì dùng lại, chưa có mới tạo.
        return repo.findFirstByFacility_IdAndTypeNameIgnoreCase(facility.getId(), typeName).orElseGet(() -> {
            UnitType t = new UnitType();
            t.setFacility(facility); // gán khoá ngoại
            t.setTypeName(typeName);
            // decimal(...) đổi chuỗi "2.00" thành BigDecimal (null giữ nguyên null).
            t.setWidth(decimal(width));
            t.setLength(decimal(length));
            t.setHeight(decimal(height));
            t.setSizeDescription(sizeDescription);
            t.setDescription(description);
            t.setActive(active);
            log.info("DataSeeder: tạo UnitType '{}' cho '{}'", typeName, facility.getName());
            return repo.save(t);
        });
    }

    // ===================== STORAGE UNITS =====================

    private void seedStorageUnits(FacilityRepository facilityRepo, UnitTypeRepository typeRepo,
                                  StorageUnitRepository repo) {
        Facility f1 = facilityRepo.findFirstByName("Kho Trung Tâm Quận 1").orElseThrow();
        Facility f2 = facilityRepo.findFirstByName("Kho Thủ Đức").orElseThrow();

        // UnitType phải lấy lại từ DB để StorageUnit có đúng Foreign Key và cùng Facility.
        UnitType small1 = typeRepo.findFirstByFacility_IdAndTypeNameIgnoreCase(f1.getId(), "SMALL").orElseThrow();
        UnitType medium1 = typeRepo.findFirstByFacility_IdAndTypeNameIgnoreCase(f1.getId(), "MEDIUM").orElseThrow();
        UnitType large1 = typeRepo.findFirstByFacility_IdAndTypeNameIgnoreCase(f1.getId(), "LARGE").orElseThrow();
        UnitType small2 = typeRepo.findFirstByFacility_IdAndTypeNameIgnoreCase(f2.getId(), "SMALL").orElseThrow();
        UnitType medium2 = typeRepo.findFirstByFacility_IdAndTypeNameIgnoreCase(f2.getId(), "MEDIUM").orElseThrow();

        // Seed đủ các status để test filter GET /api/storage-units?status=...
        // Tham số theo thứ tự: repo, facility, unitType, mã ô kho, tầng, vị trí, trạng thái.
        // A01, A02 AVAILABLE (test lọc "còn trống"); A03 RESERVED.
        createStorageUnitIfNotExists(repo, f1, small1, "A01", "1", "Zone A - Row 1", UnitStatus.AVAILABLE);
        createStorageUnitIfNotExists(repo, f1, small1, "A02", "1", "Zone A - Row 2", UnitStatus.AVAILABLE);
        createStorageUnitIfNotExists(repo, f1, small1, "A03", "1", "Zone A - Row 3", UnitStatus.RESERVED);

        // B01 OCCUPIED, B02 INSPECTION, B03 MAINTENANCE.
        createStorageUnitIfNotExists(repo, f1, medium1, "B01", "2", "Zone B - Row 1", UnitStatus.OCCUPIED);
        createStorageUnitIfNotExists(repo, f1, medium1, "B02", "2", "Zone B - Row 2", UnitStatus.INSPECTION);
        createStorageUnitIfNotExists(repo, f1, medium1, "B03", "2", "Zone B - Row 3", UnitStatus.MAINTENANCE);

        createStorageUnitIfNotExists(repo, f1, large1, "C01", "3", "Zone C - Row 1", UnitStatus.AVAILABLE);

        // Facility 2 (Thủ Đức).
        createStorageUnitIfNotExists(repo, f2, small2, "TD-A01", "1", "TD Zone A", UnitStatus.AVAILABLE);
        createStorageUnitIfNotExists(repo, f2, small2, "TD-A02", "1", "TD Zone A", UnitStatus.OCCUPIED);
        createStorageUnitIfNotExists(repo, f2, medium2, "TD-B01", "2", "TD Zone B", UnitStatus.MAINTENANCE);
    }

    // Natural key: Facility + UnitCode. Unit đã có thì giữ nguyên (kể cả khi status đã bị đổi qua API).
    private void createStorageUnitIfNotExists(StorageUnitRepository repo, Facility facility, UnitType unitType,
                                              String unitCode, String floor, String location, UnitStatus status) {
        // Bước 1: đã có ô kho cùng mã trong Facility này -> bỏ qua, không làm gì.
        if (repo.existsByFacility_IdAndUnitCodeIgnoreCase(facility.getId(), unitCode)) {
            return;
        }
        // Bước 2: chưa có -> tạo mới và điền dữ liệu.
        StorageUnit u = new StorageUnit();
        u.setFacility(facility);
        u.setUnitType(unitType);
        u.setUnitCode(unitCode);
        u.setFloor(floor);
        u.setLocation(location);
        u.setStatus(status);
        // Bước 3: lưu (INSERT).
        repo.save(u);
        log.info("DataSeeder: tạo StorageUnit '{}' ({}) cho '{}'", unitCode, status, facility.getName());
    }

    // ===================== PRICE RULES =====================

    private void seedPriceRules(FacilityRepository facilityRepo, UnitTypeRepository typeRepo,
                                PriceRuleRepository repo) {
        // Lấy lại Facility và 3 UnitType của Facility 1 (SMALL/MEDIUM/LARGE) để gắn vào PriceRule.
        Facility f1 = facilityRepo.findFirstByName("Kho Trung Tâm Quận 1").orElseThrow();
        UnitType small = typeRepo.findFirstByFacility_IdAndTypeNameIgnoreCase(f1.getId(), "SMALL").orElseThrow();
        UnitType medium = typeRepo.findFirstByFacility_IdAndTypeNameIgnoreCase(f1.getId(), "MEDIUM").orElseThrow();
        UnitType large = typeRepo.findFirstByFacility_IdAndTypeNameIgnoreCase(f1.getId(), "LARGE").orElseThrow();

        // Dùng LocalDate.now() để dữ liệu current vẫn hợp lệ dù project được chạy vào thời điểm khác.
        // (Nếu ghi cứng một ngày cố định thì vài tháng sau rule sẽ tự hết hạn và /current không còn dữ liệu.)
        LocalDate today = LocalDate.now();
        LocalDate monthAgo = today.minusMonths(1);

        // Giá thuê hiện tại: EffectiveTo = null và IsActive = true nên là rule current duy nhất của từng scope.
        // Tham số theo thứ tự: repo, facility, unitType, PriceType, CalculationType, amount, percentage,
        //                      effectiveFrom, effectiveTo, active.
        createPriceRuleIfNotExists(repo, f1, small, PriceType.RENTAL, CalculationType.PER_MONTH,
                "1000000", null, monthAgo, null, true);
        createPriceRuleIfNotExists(repo, f1, medium, PriceType.RENTAL, CalculationType.PER_MONTH,
                "1800000", null, monthAgo, null, true);
        createPriceRuleIfNotExists(repo, f1, large, PriceType.RENTAL, CalculationType.PER_MONTH,
                "3000000", null, monthAgo, null, true);

        // PriceRule lịch sử có EffectiveTo trong quá khứ nên không được trả về từ endpoint /current.
        // Kết thúc trước khi giá hiện tại bắt đầu (2 tháng trước < 1 tháng trước) nên hai khoảng không overlap.
        createPriceRuleIfNotExists(repo, f1, small, PriceType.RENTAL, CalculationType.PER_MONTH,
                "800000", null, today.minusYears(1), today.minusMonths(2), true);

        // Các loại giá khác của Facility 1 + SMALL: đặt cọc, gia hạn, quá hạn (theo ngày), phụ phí, đền bù.
        createPriceRuleIfNotExists(repo, f1, small, PriceType.DEPOSIT, CalculationType.FIXED,
                "500000", null, monthAgo, null, true);
        createPriceRuleIfNotExists(repo, f1, small, PriceType.RENEWAL, CalculationType.FIXED,
                "100000", null, monthAgo, null, true);
        createPriceRuleIfNotExists(repo, f1, small, PriceType.OVERDUE, CalculationType.PER_DAY,
                "50000", null, monthAgo, null, true);
        createPriceRuleIfNotExists(repo, f1, small, PriceType.EXTRA_FEE, CalculationType.FIXED,
                "200000", null, monthAgo, null, true);
        createPriceRuleIfNotExists(repo, f1, small, PriceType.DAMAGE_FEE, CalculationType.FIXED,
                "500000", null, monthAgo, null, true);

        // Facility = null và UnitType = null nghĩa là PriceRule này có scope toàn hệ thống.
        // Hiện backend chưa implement fallback global, dữ liệu này chỉ dùng để test đúng structure PriceRules.
        // Giảm giá 10% (PERCENTAGE nên dùng percentage = "10", amount = null).
        createPriceRuleIfNotExists(repo, null, null, PriceType.DISCOUNT, CalculationType.PERCENTAGE,
                null, "10", today.minusDays(1), today.plusDays(30), true);

        // Rule đã disable (IsActive = false) và đã hết hạn: GET /api/price-rules vẫn thấy, /current không được lấy.
        createPriceRuleIfNotExists(repo, f1, small, PriceType.DISCOUNT, CalculationType.PERCENTAGE,
                null, "5", today.minusMonths(6), today.minusMonths(5), false);
    }

    /**
     * Key chống trùng: scope + PriceType + CalculationType + IsActive + (EffectiveTo có hay không).
     * Không dùng ngày (đổi theo LocalDate.now()) hay số tiền (có thể đã sửa tay qua API) để restart
     * không sinh thêm rule, nhất là rule current thứ hai khiến /api/price-rules/current trả 409.
     */
    private void createPriceRuleIfNotExists(PriceRuleRepository repo, Facility facility, UnitType unitType,
                                            PriceType priceType, CalculationType calculationType,
                                            String amount, String percentage,
                                            LocalDate effectiveFrom, LocalDate effectiveTo, boolean active) {
        // Bước 1: lấy id của Facility/UnitType (null nếu rule toàn hệ thống / không theo loại kho).
        Long facilityId = facility != null ? facility.getId() : null;
        Integer unitTypeId = unitType != null ? unitType.getId() : null;
        // Bước 2: đã có rule "cùng loại" thì bỏ qua (effectiveTo == null cho biết rule này "đang mở" hay "đã đóng").
        if (repo.existsSeedMatch(priceType, calculationType, facilityId, unitTypeId, active, effectiveTo == null)) {
            return;
        }

        // Bước 3: chưa có -> tạo mới và điền dữ liệu.
        PriceRule r = new PriceRule();
        r.setFacility(facility);
        r.setUnitType(unitType);
        r.setPriceType(priceType);
        r.setCalculationType(calculationType);
        r.setAmount(decimal(amount));
        r.setPercentage(decimal(percentage));
        r.setEffectiveFrom(effectiveFrom);
        r.setEffectiveTo(effectiveTo);
        r.setActive(active);
        // Auth thuộc module khác. Sau khi merge Auth, CreatedBy sẽ lấy UserId từ authenticated user.
        // Seed data hiện để null đúng theo column nullable.
        r.setCreatedBy(null);
        // Bước 4: lưu (INSERT).
        repo.save(r);
        log.info("DataSeeder: tạo PriceRule {} {} (facility={}, unitType={}, active={})",
                priceType, calculationType, facilityId, unitTypeId, active);
    }

    // Đổi chuỗi số ("2.00") thành BigDecimal; null thì giữ null (cột cho phép trống).

    // ===================== KHU VỰC MẪU: 3 khu vực x 3 cơ sở =====================

    // Dữ liệu mẫu để demo: tên, địa chỉ và số điện thoại đều là giả. Mỗi dòng:
    // { tên cơ sở (natural key), địa chỉ, SĐT, tình trạng hàng, hệ số giá theo khu vực (% so với giá gốc), mã ô }
    private static final String[][] AREA_FACILITIES = {
            // Quận 3
            {"Kho Quận 3 - Võ Văn Tần", "215 Võ Văn Tần, Phường 5, Quận 3, TP.HCM", "0901000010", "AVAILABLE", "120", "Q3A"},
            {"Kho Quận 3 - Nam Kỳ Khởi Nghĩa", "88 Nam Kỳ Khởi Nghĩa, Phường Võ Thị Sáu, Quận 3, TP.HCM", "0901000011", "AVAILABLE", "125", "Q3B"},
            {"Kho Quận 3 - Cách Mạng Tháng 8", "402 Cách Mạng Tháng Tám, Phường 11, Quận 3, TP.HCM", "0901000012", "COMING_SOON", "115", "Q3C"},
            // Tân Bình
            {"Kho Tân Bình - Cộng Hòa", "18 Cộng Hòa, Phường 12, Tân Bình, TP.HCM", "0901000013", "AVAILABLE", "100", "TBA"},
            {"Kho Tân Bình - Hoàng Văn Thụ", "66 Hoàng Văn Thụ, Phường 9, Tân Bình, TP.HCM", "0901000014", "AVAILABLE", "105", "TBB"},
            {"Kho Tân Bình - Trường Chinh", "305 Trường Chinh, Phường 13, Tân Bình, TP.HCM", "0901000015", "OUT_OF_STOCK", "95", "TBC"},
            // Gò Vấp
            {"Kho Gò Vấp - Quang Trung", "120 Quang Trung, Phường 10, Gò Vấp, TP.HCM", "0901000016", "AVAILABLE", "90", "GVA"},
            {"Kho Gò Vấp - Phạm Văn Đồng", "47 Phạm Văn Đồng, Phường 3, Gò Vấp, TP.HCM", "0901000017", "AVAILABLE", "92", "GVB"},
            {"Kho Gò Vấp - Nguyễn Oanh", "214 Nguyễn Oanh, Phường 17, Gò Vấp, TP.HCM", "0901000018", "AVAILABLE", "88", "GVC"},
    };

    private void seedAreaFacilities(FacilityRepository facilityRepo, UnitTypeRepository typeRepo,
                                    StorageUnitRepository unitRepo, PriceRuleRepository ruleRepo) {
        LocalDate from = LocalDate.now().minusMonths(1);
        // Giá gốc theo tháng của SMALL / MEDIUM / LARGE và tiền cọc cố định.
        long[] baseRent = {1_000_000L, 1_700_000L, 2_900_000L};
        String[] deposit = {"500000", "800000", "1200000"};

        for (int i = 0; i < AREA_FACILITIES.length; i++) {
            String[] row = AREA_FACILITIES[i];
            StockStatus stock = StockStatus.valueOf(row[3]);
            int factor = Integer.parseInt(row[4]);
            String prefix = row[5];

            // Facility
            Facility f = facilityRepo.findFirstByName(row[0]).orElseGet(() -> {
                Facility nf = new Facility();
                nf.setName(row[0]);
                nf.setAddress(row[1]);
                nf.setPhone(row[2]);
                nf.setStatus(FacilityStatus.ACTIVE);
                nf.setStockStatus(stock);
                log.info("DataSeeder: tạo Facility '{}'", row[0]);
                return facilityRepo.save(nf);
            });

            // UnitType: SMALL / MEDIUM / LARGE
            UnitType small = findOrCreateUnitType(typeRepo, f, "SMALL", "2.00", "2.00", "2.50", "2m x 2m", "Kho nhỏ phù hợp lưu trữ cá nhân.", true);
            UnitType medium = findOrCreateUnitType(typeRepo, f, "MEDIUM", "3.00", "3.00", "2.50", "3m x 3m", "Kho trung bình.", true);
            UnitType large = findOrCreateUnitType(typeRepo, f, "LARGE", "5.00", "5.00", "3.00", "5m x 5m", "Kho lớn.", true);
            UnitType[] types = {small, medium, large};

            // StorageUnit: 2 ô SMALL, 2 ô MEDIUM, 1 ô LARGE.
            // "Sắp có": ô đang chuẩn bị (INSPECTION). "Hết hàng": mọi ô đã có khách (OCCUPIED).
            // Cơ sở thường: còn trống hầu hết, mỗi cơ sở có một ô đã thuê cho thật.
            UnitStatus free = stock == StockStatus.COMING_SOON ? UnitStatus.INSPECTION
                    : stock == StockStatus.OUT_OF_STOCK ? UnitStatus.OCCUPIED : UnitStatus.AVAILABLE;
            UnitStatus taken = stock == StockStatus.COMING_SOON ? UnitStatus.INSPECTION : UnitStatus.OCCUPIED;
            createStorageUnitIfNotExists(unitRepo, f, small, prefix + "-S01", "1", "Zone A - Row 1", free);
            createStorageUnitIfNotExists(unitRepo, f, small, prefix + "-S02", "1", "Zone A - Row 2", i % 3 == 1 ? taken : free);
            createStorageUnitIfNotExists(unitRepo, f, medium, prefix + "-M01", "2", "Zone B - Row 1", free);
            createStorageUnitIfNotExists(unitRepo, f, medium, prefix + "-M02", "2", "Zone B - Row 2", taken);
            createStorageUnitIfNotExists(unitRepo, f, large, prefix + "-L01", "3", "Zone C - Row 1", i % 3 == 2 ? taken : free);

            // PriceRule: thuê theo tháng (đã nhân hệ số khu vực, làm tròn 10.000) và tiền cọc
            for (int k = 0; k < types.length; k++) {
                long rent = Math.round(baseRent[k] * factor / 100.0 / 10_000.0) * 10_000L;
                createPriceRuleIfNotExists(ruleRepo, f, types[k], PriceType.RENTAL, CalculationType.PER_MONTH,
                        String.valueOf(rent), null, from, null, true);
                createPriceRuleIfNotExists(ruleRepo, f, types[k], PriceType.DEPOSIT, CalculationType.FIXED,
                        deposit[k], null, from, null, true);
            }
        }
    }

    private static BigDecimal decimal(String value) {
        return value == null ? null : new BigDecimal(value);
    }
}
