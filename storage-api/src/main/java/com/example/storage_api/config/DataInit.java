package com.example.storage_api.config;

import com.example.storage_api.entity.CalculationType;
import com.example.storage_api.entity.Facility;
import com.example.storage_api.entity.FacilityStatus;
import com.example.storage_api.entity.PriceRule;
import com.example.storage_api.entity.PriceType;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.StockStatus;
import com.example.storage_api.entity.StorageUnit;
import com.example.storage_api.entity.UnitStatus;
import com.example.storage_api.entity.UnitType;
import com.example.storage_api.entity.Users;
import com.example.storage_api.reponsitory.FacilityRepository;
import com.example.storage_api.reponsitory.PriceRuleRepository;
import com.example.storage_api.reponsitory.StorageUnitRepository;
import com.example.storage_api.reponsitory.UnitTypeRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * DataInit = "người gieo dữ liệu mẫu": mỗi lần app khởi động, nó tự thêm dữ liệu mẫu vào DB
 * để bạn có sẵn dữ liệu test bằng Postman / SSMS mà không phải nhập tay.
 * (Đã gộp DataSeeder vào đây: tài khoản mẫu, cơ sở, loại kho, ô kho và bảng giá đều được tạo ở class này.)
 *
 * Luồng: Spring Boot khởi động -> tạo các Repository -> CommandLineRunner chạy -> Repository.save(...)
 *        -> JPA/Hibernate -> câu INSERT -> SQL Server.
 *
 * Thứ tự seed (BẮT BUỘC theo khoá ngoại):
 *   Users -> Facility -> UnitType -> StorageUnit -> PriceRule -> gán tài khoản mẫu vào cơ sở 1.
 *   Sau đó FacilityAccountSeeder (@Order(3)) tạo thêm manager/staff cho mọi cơ sở.
 *
 * Nguyên tắc:
 * - Seeder này phục vụ môi trường development/test. Không dùng dữ liệu mẫu này cho production.
 * - Idempotent (chạy bao nhiêu lần cũng chỉ ra cùng một kết quả): trước khi thêm từng bản ghi, kiểm tra
 *   bản ghi đó đã có chưa theo "natural key"; chưa có mới thêm. Không xoá dữ liệu có sẵn và không ghi đè
 *   giá trị đã có (ngoại lệ duy nhất: điền giờ mở/đóng cửa cho cơ sở mẫu đang để TRỐNG).
 * - @Profile("!test"): chạy ở mọi profile trừ "test" (integration test dùng H2 và tự dựng dữ liệu riêng,
 *   nếu seed vào đó sẽ làm sai kết quả đếm và vướng FK khi test gọi deleteAll()).
 * - Các cột text của Facility / UnitType / StorageUnit là nvarchar (@Nationalized) nên seed lưu được tiếng Việt có dấu.
 * - PriceRule.CreatedBy luôn để null (cột nullable); không hard-code UserId.
 * - Tên, địa chỉ, số điện thoại của các cơ sở đều là dữ liệu giả để demo.
 */
@Slf4j // Lombok tạo sẵn biến "log" để ghi log
@Profile("!test")
@Order(1) // chạy đầu tiên; FacilityAccountSeeder (@Order(3)) cần user + cơ sở đã có
@Component // Spring tự tạo object này và gọi run(...) sau khi app khởi động xong
@RequiredArgsConstructor // Lombok tạo constructor nhận các field final bên dưới (dependency injection)
public class DataInit implements CommandLineRunner {

    private static final String F1 = "Kho Trung Tâm Quận 1";
    private static final String F2 = "Kho Thủ Đức";

    private final FacilityRepository facilityRepository;
    private final UnitTypeRepository unitTypeRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final PriceRuleRepository priceRuleRepository;
    private final UsersRepository usersRepository;
    private final PasswordEncoder passwordEncoder;

    // CommandLineRunner = một đoạn code Spring chạy MỘT LẦN ngay sau khi context khởi tạo xong
    // (lúc này kết nối DB và Repository đã sẵn sàng). "args" là tham số dòng lệnh, ở đây không dùng.
    @Override
    public void run(String... args) {
        seedUsers(usersRepository, passwordEncoder);
        seedFacilities(facilityRepository);
        seedUnitTypes(facilityRepository, unitTypeRepository);
        seedStorageUnits(facilityRepository, unitTypeRepository, storageUnitRepository);
        seedPriceRules(facilityRepository, unitTypeRepository, priceRuleRepository);
        seedAreaFacilities(facilityRepository, unitTypeRepository, storageUnitRepository, priceRuleRepository);
        assignDemoStaffToFacility(facilityRepository, usersRepository);
        log.info("DataInit: seed dữ liệu mẫu hoàn tất.");
    }

    // ===================== USERS =====================

    /**
     * 5 tài khoản mẫu, mỗi role một tài khoản. Mật khẩu = [tên role]123 (admin123, manager123...).
     * Natural key là email: tài khoản nào chưa có mới tạo, tài khoản đã có (kể cả đã đổi mật khẩu) thì giữ nguyên.
     */
    private void seedUsers(UsersRepository repo, PasswordEncoder encoder) {
        createUserIfNotExists(repo, encoder, "System Admin", "admin@example.com", "0123456789", "admin123", Role.SYSTEM_ADMIN);
        createUserIfNotExists(repo, encoder, "Business Manager", "manager@example.com", "0123456788", "manager123", Role.BUSINESS_MANAGER);
        createUserIfNotExists(repo, encoder, "Customer Test", "customer@example.com", "0123456787", "customer123", Role.CUSTOMER);
        createUserIfNotExists(repo, encoder, "Facility Staff", "staff@example.com", "0123456786", "staff123", Role.FACILITY_STAFF);
        createUserIfNotExists(repo, encoder, "Facility Manager", "fmanager@example.com", "0123456785", "fmanager123", Role.FACILITY_MANAGER);
    }

    private void createUserIfNotExists(UsersRepository repo, PasswordEncoder encoder, String fullname, String email,
                                       String phone, String rawPassword, Role role) {
        if (repo.findByEmail(email).isPresent()) {
            return;
        }
        Users u = new Users();
        u.setFullname(fullname);
        u.setEmail(email);
        u.setPhone(phone);
        u.setPassword(encoder.encode(rawPassword)); // luôn lưu mật khẩu đã mã hoá, không lưu chữ thường
        u.setRole(role);
        u.setStatus(Status.ACTIVE);
        repo.save(u);
        log.info("DataInit: tạo user {} ({})", email, role);
    }

    // ===================== PHÂN CÔNG CƠ SỞ CHO TÀI KHOẢN MẪU =====================

    /**
     * Facility Manager / Facility Staff chỉ thao tác được trên cơ sở được phân công (Users.facility), nên tài khoản mẫu
     * chưa có cơ sở sẽ bị chặn hết. Gán họ vào cơ sở 1 để demo chạy ngay.
     * Chỉ gán khi tài khoản CHƯA có cơ sở, nên không ghi đè việc admin đã phân công.
     */
    private void assignDemoStaffToFacility(FacilityRepository facilityRepo, UsersRepository usersRepo) {
        Facility f1 = facilityRepo.findFirstByName(F1).orElse(null);
        if (f1 == null) {
            return;
        }
        for (String email : new String[]{"fmanager@example.com", "staff@example.com"}) {
            usersRepo.findByEmail(email).filter(u -> u.getFacility() == null).ifPresent(u -> {
                u.setFacility(f1);
                usersRepo.save(u);
                log.info("DataInit: gán {} vào cơ sở '{}'", email, f1.getName());
            });
        }
    }

    // ===================== FACILITIES =====================

    private void seedFacilities(FacilityRepository repo) {
        // Facility phải được seed trước vì UnitType có FK tới Facility.
        // Facility 1 và 2: ACTIVE để test dữ liệu bình thường.
        findOrCreateFacility(repo, F1, "123 Nguyễn Huệ, Quận 1, TP.HCM", "0901000001",
                LocalTime.of(8, 0), LocalTime.of(22, 0), FacilityStatus.ACTIVE, StockStatus.AVAILABLE);
        findOrCreateFacility(repo, F2, "456 Võ Văn Ngân, Thủ Đức, TP.HCM", "0901000002",
                LocalTime.of(7, 30), LocalTime.of(21, 30), FacilityStatus.ACTIVE, StockStatus.AVAILABLE);
        // Facility INACTIVE để test Facility đã disable.
        findOrCreateFacility(repo, "Kho Quận 7", "789 Nguyễn Thị Thập, Quận 7, TP.HCM", "0901000003",
                LocalTime.of(8, 0), LocalTime.of(20, 0), FacilityStatus.INACTIVE, StockStatus.AVAILABLE);
    }

    /**
     * Dùng tên Facility làm natural key để tránh insert trùng mỗi lần restart.
     * Natural key = thông tin có thật ngoài đời dùng để nhận ra một bản ghi (khác với id tự tăng).
     * Cơ sở đã có nhưng giờ mở/đóng cửa đang TRỐNG (seed cũ) thì điền giờ vào, vì lịch hẹn cần giờ làm việc.
     * Cơ sở đã có giờ thì giữ nguyên (không ghi đè giờ admin đã sửa).
     */
    private Facility findOrCreateFacility(FacilityRepository repo, String name, String address, String phone,
                                          LocalTime opening, LocalTime closing, FacilityStatus status,
                                          StockStatus stock) {
        Facility existing = repo.findFirstByName(name).orElse(null);
        if (existing != null) {
            if (existing.getOpeningTime() == null && existing.getClosingTime() == null) {
                existing.setOpeningTime(opening);
                existing.setClosingTime(closing);
                log.info("DataInit: bổ sung giờ {}-{} cho Facility '{}'", opening, closing, name);
                return repo.save(existing);
            }
            return existing;
        }
        Facility f = new Facility();
        f.setName(name);
        f.setAddress(address);
        f.setPhone(phone);
        f.setOpeningTime(opening);
        f.setClosingTime(closing);
        f.setStatus(status);
        f.setStockStatus(stock);
        log.info("DataInit: tạo Facility '{}'", name);
        return repo.save(f); // save => Hibernate sinh INSERT gửi xuống SQL Server
    }

    // ===================== UNIT TYPES =====================

    // Kích thước chuẩn (rộng, dài, cao theo mét) dùng chung cho các cơ sở mới.
    private static final String[][] STANDARD_TYPES = {
            // { tên, rộng, dài, cao, mô tả kích thước, mô tả }
            {"SMALL", "2.00", "2.00", "2.50", "2m x 2m", "Kho nhỏ phù hợp lưu trữ cá nhân: thùng đồ, vali, xe máy."},
            {"MEDIUM", "3.00", "3.00", "2.50", "3m x 3m", "Kho trung bình: đồ đạc căn hộ 1-2 phòng ngủ."},
            {"LARGE", "5.00", "5.00", "3.00", "5m x 5m", "Kho lớn: đồ đạc cả gia đình hoặc hàng hoá cửa hàng."},
            {"EXTRA_LARGE", "6.00", "8.00", "3.50", "6m x 8m", "Kho rất lớn cho doanh nghiệp: hàng tồn, pallet; gần cửa bốc dỡ."},
    };

    private void seedUnitTypes(FacilityRepository facilityRepo, UnitTypeRepository repo) {
        // Lấy lại Facility từ DB (đã có id thật) để UnitType có đúng Foreign Key.
        Facility f1 = facilityRepo.findFirstByName(F1).orElseThrow();
        Facility f2 = facilityRepo.findFirstByName(F2).orElseThrow();

        // Facility 1: SMALL / MEDIUM / LARGE / EXTRA_LARGE.
        findOrCreateUnitType(repo, f1, "SMALL", "2.00", "2.00", "2.50", "2m x 2m",
                "Kho nhỏ phù hợp lưu trữ cá nhân.", true);
        findOrCreateUnitType(repo, f1, "MEDIUM", "3.00", "3.00", "2.50", "3m x 3m", "Kho trung bình.", true);
        findOrCreateUnitType(repo, f1, "LARGE", "5.00", "5.00", "3.00", "5m x 5m", "Kho lớn.", true);
        String[] xl = STANDARD_TYPES[3];
        findOrCreateUnitType(repo, f1, xl[0], xl[1], xl[2], xl[3], xl[4], xl[5], true);

        // Facility 2 cũng có SMALL: hợp lệ vì unique là (FacilityId, TypeName), khác Facility.
        findOrCreateUnitType(repo, f2, "SMALL", "2.00", "2.50", "2.50", "2m x 2.5m", "Kho nhỏ.", true);
        findOrCreateUnitType(repo, f2, "MEDIUM", "3.50", "3.50", "2.80", "3.5m x 3.5m", "Kho trung bình.", true);
        findOrCreateUnitType(repo, f2, "LARGE", "5.00", "6.00", "3.00", "5m x 6m", "Kho lớn.", true);
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
            log.info("DataInit: tạo UnitType '{}' cho '{}'", typeName, facility.getName());
            return repo.save(t);
        });
    }

    private UnitType findOrCreateStandardType(UnitTypeRepository repo, Facility facility, int index) {
        String[] t = STANDARD_TYPES[index];
        return findOrCreateUnitType(repo, facility, t[0], t[1], t[2], t[3], t[4], t[5], true);
    }

    // ===================== STORAGE UNITS =====================

    private void seedStorageUnits(FacilityRepository facilityRepo, UnitTypeRepository typeRepo,
                                  StorageUnitRepository repo) {
        Facility f1 = facilityRepo.findFirstByName(F1).orElseThrow();
        Facility f2 = facilityRepo.findFirstByName(F2).orElseThrow();

        // UnitType phải lấy lại từ DB để StorageUnit có đúng Foreign Key và cùng Facility.
        UnitType small1 = type(typeRepo, f1, "SMALL");
        UnitType medium1 = type(typeRepo, f1, "MEDIUM");
        UnitType large1 = type(typeRepo, f1, "LARGE");
        UnitType xl1 = type(typeRepo, f1, "EXTRA_LARGE");
        UnitType small2 = type(typeRepo, f2, "SMALL");
        UnitType medium2 = type(typeRepo, f2, "MEDIUM");
        UnitType large2 = type(typeRepo, f2, "LARGE");

        // Seed đủ các status để test filter GET /api/storage-units?status=...
        // Tham số theo thứ tự: repo, facility, unitType, mã ô kho, tầng, vị trí, trạng thái.
        // Facility 1 - SMALL (tầng 1): A01, A02, A04, A05 AVAILABLE; A03 RESERVED.
        createStorageUnitIfNotExists(repo, f1, small1, "A01", "1", "Zone A - Row 1", UnitStatus.AVAILABLE);
        createStorageUnitIfNotExists(repo, f1, small1, "A02", "1", "Zone A - Row 2", UnitStatus.AVAILABLE);
        createStorageUnitIfNotExists(repo, f1, small1, "A03", "1", "Zone A - Row 3", UnitStatus.RESERVED);
        createStorageUnitIfNotExists(repo, f1, small1, "A04", "1", "Zone A - Row 4", UnitStatus.AVAILABLE);
        createStorageUnitIfNotExists(repo, f1, small1, "A05", "1", "Zone A - Row 5", UnitStatus.AVAILABLE);

        // MEDIUM (tầng 2): B01 OCCUPIED, B02 INSPECTION, B03 MAINTENANCE, B04 AVAILABLE.
        createStorageUnitIfNotExists(repo, f1, medium1, "B01", "2", "Zone B - Row 1", UnitStatus.OCCUPIED);
        createStorageUnitIfNotExists(repo, f1, medium1, "B02", "2", "Zone B - Row 2", UnitStatus.INSPECTION);
        createStorageUnitIfNotExists(repo, f1, medium1, "B03", "2", "Zone B - Row 3", UnitStatus.MAINTENANCE);
        createStorageUnitIfNotExists(repo, f1, medium1, "B04", "2", "Zone B - Row 4", UnitStatus.AVAILABLE);

        // LARGE (tầng 3) và EXTRA_LARGE (tầng trệt, gần cửa bốc dỡ).
        createStorageUnitIfNotExists(repo, f1, large1, "C01", "3", "Zone C - Row 1", UnitStatus.AVAILABLE);
        createStorageUnitIfNotExists(repo, f1, large1, "C02", "3", "Zone C - Row 2", UnitStatus.AVAILABLE);
        createStorageUnitIfNotExists(repo, f1, xl1, "D01", "G", "Zone D - Gần cửa bốc dỡ", UnitStatus.AVAILABLE);
        createStorageUnitIfNotExists(repo, f1, xl1, "D02", "G", "Zone D - Gần cửa bốc dỡ", UnitStatus.AVAILABLE);

        // Facility 2 (Thủ Đức).
        createStorageUnitIfNotExists(repo, f2, small2, "TD-A01", "1", "TD Zone A", UnitStatus.AVAILABLE);
        createStorageUnitIfNotExists(repo, f2, small2, "TD-A02", "1", "TD Zone A", UnitStatus.OCCUPIED);
        createStorageUnitIfNotExists(repo, f2, small2, "TD-A03", "1", "TD Zone A", UnitStatus.AVAILABLE);
        createStorageUnitIfNotExists(repo, f2, medium2, "TD-B01", "2", "TD Zone B", UnitStatus.MAINTENANCE);
        createStorageUnitIfNotExists(repo, f2, medium2, "TD-B02", "2", "TD Zone B", UnitStatus.AVAILABLE);
        createStorageUnitIfNotExists(repo, f2, large2, "TD-C01", "3", "TD Zone C", UnitStatus.AVAILABLE);
    }

    private UnitType type(UnitTypeRepository repo, Facility facility, String typeName) {
        return repo.findFirstByFacility_IdAndTypeNameIgnoreCase(facility.getId(), typeName).orElseThrow();
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
        log.info("DataInit: tạo StorageUnit '{}' ({}) cho '{}'", unitCode, status, facility.getName());
    }

    // ===================== PRICE RULES =====================

    private void seedPriceRules(FacilityRepository facilityRepo, UnitTypeRepository typeRepo,
                                PriceRuleRepository repo) {
        Facility f1 = facilityRepo.findFirstByName(F1).orElseThrow();
        Facility f2 = facilityRepo.findFirstByName(F2).orElseThrow();
        UnitType small = type(typeRepo, f1, "SMALL");
        UnitType medium = type(typeRepo, f1, "MEDIUM");
        UnitType large = type(typeRepo, f1, "LARGE");
        UnitType xl = type(typeRepo, f1, "EXTRA_LARGE");

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
        createPriceRuleIfNotExists(repo, f1, xl, PriceType.RENTAL, CalculationType.PER_MONTH,
                "5000000", null, monthAgo, null, true);
        createPriceRuleIfNotExists(repo, f1, xl, PriceType.DEPOSIT, CalculationType.FIXED,
                "2000000", null, monthAgo, null, true);

        // PriceRule lịch sử có EffectiveTo trong quá khứ và đã tắt (active=false) nên không được trả về từ endpoint /current.
        // Kết thúc trước khi giá hiện tại bắt đầu (2 tháng trước < 1 tháng trước) nên hai khoảng không overlap.
        createPriceRuleIfNotExists(repo, f1, small, PriceType.RENTAL, CalculationType.PER_MONTH,
                "800000", null, today.minusYears(1), today.minusMonths(2), false);

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

        // Facility 2 (Thủ Đức): giá rẻ hơn trung tâm. Trước đây chưa có rule nên rơi vào giá mặc định 1.000.000.
        String[][] thuDuc = {{"SMALL", "900000", "450000"}, {"MEDIUM", "1500000", "700000"}, {"LARGE", "2600000", "1100000"}};
        for (String[] p : thuDuc) {
            UnitType t = type(typeRepo, f2, p[0]);
            createPriceRuleIfNotExists(repo, f2, t, PriceType.RENTAL, CalculationType.PER_MONTH, p[1], null, monthAgo, null, true);
            createPriceRuleIfNotExists(repo, f2, t, PriceType.DEPOSIT, CalculationType.FIXED, p[2], null, monthAgo, null, true);
        }

        // Facility = null và UnitType = null nghĩa là PriceRule này có scope toàn hệ thống.
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
        r.setCreatedBy(null); // seed không gắn người tạo (cột nullable)
        // Bước 4: lưu (INSERT).
        repo.save(r);
        log.info("DataInit: tạo PriceRule {} {} (facility={}, unitType={}, active={})",
                priceType, calculationType, facilityId, unitTypeId, active);
    }

    // ===================== KHU VỰC MẪU: 6 khu vực x 3 cơ sở =====================

    // Mỗi dòng: { tên cơ sở (natural key), địa chỉ, SĐT, tình trạng hàng, hệ số giá theo khu vực (% so với giá gốc),
    //             mã ô, giờ mở cửa, giờ đóng cửa }
    private static final String[][] AREA_FACILITIES = {
            // Quận 3
            {"Kho Quận 3 - Võ Văn Tần", "215 Võ Văn Tần, Phường 5, Quận 3, TP.HCM", "0901000010", "AVAILABLE", "120", "Q3A", "07:00", "22:00"},
            {"Kho Quận 3 - Nam Kỳ Khởi Nghĩa", "88 Nam Kỳ Khởi Nghĩa, Phường Võ Thị Sáu, Quận 3, TP.HCM", "0901000011", "AVAILABLE", "125", "Q3B", "08:00", "22:00"},
            {"Kho Quận 3 - Cách Mạng Tháng 8", "402 Cách Mạng Tháng Tám, Phường 11, Quận 3, TP.HCM", "0901000012", "COMING_SOON", "115", "Q3C", "08:00", "21:00"},
            // Tân Bình
            {"Kho Tân Bình - Cộng Hòa", "18 Cộng Hòa, Phường 12, Tân Bình, TP.HCM", "0901000013", "AVAILABLE", "100", "TBA", "06:30", "22:00"},
            {"Kho Tân Bình - Hoàng Văn Thụ", "66 Hoàng Văn Thụ, Phường 9, Tân Bình, TP.HCM", "0901000014", "AVAILABLE", "105", "TBB", "07:00", "21:30"},
            {"Kho Tân Bình - Trường Chinh", "305 Trường Chinh, Phường 13, Tân Bình, TP.HCM", "0901000015", "OUT_OF_STOCK", "95", "TBC", "07:00", "21:00"},
            // Gò Vấp
            {"Kho Gò Vấp - Quang Trung", "120 Quang Trung, Phường 10, Gò Vấp, TP.HCM", "0901000016", "AVAILABLE", "90", "GVA", "07:00", "21:00"},
            {"Kho Gò Vấp - Phạm Văn Đồng", "47 Phạm Văn Đồng, Phường 3, Gò Vấp, TP.HCM", "0901000017", "AVAILABLE", "92", "GVB", "06:30", "22:00"},
            {"Kho Gò Vấp - Nguyễn Oanh", "214 Nguyễn Oanh, Phường 17, Gò Vấp, TP.HCM", "0901000018", "AVAILABLE", "88", "GVC", "07:30", "21:00"},
            // Bình Thạnh
            {"Kho Bình Thạnh - Xô Viết Nghệ Tĩnh", "135 Xô Viết Nghệ Tĩnh, Phường 17, Bình Thạnh, TP.HCM", "0901000019", "AVAILABLE", "110", "BTA", "07:00", "22:00"},
            {"Kho Bình Thạnh - Điện Biên Phủ", "512 Điện Biên Phủ, Phường 21, Bình Thạnh, TP.HCM", "0901000020", "AVAILABLE", "108", "BTB", "08:00", "22:00"},
            {"Kho Bình Thạnh - Nơ Trang Long", "76 Nơ Trang Long, Phường 14, Bình Thạnh, TP.HCM", "0901000021", "AVAILABLE", "98", "BTC", "07:00", "21:00"},
            // Quận 10
            {"Kho Quận 10 - 3 Tháng 2", "285 Đường 3 Tháng 2, Phường 10, Quận 10, TP.HCM", "0901000022", "AVAILABLE", "115", "QXA", "07:00", "22:00"},
            {"Kho Quận 10 - Lý Thường Kiệt", "190 Lý Thường Kiệt, Phường 14, Quận 10, TP.HCM", "0901000023", "AVAILABLE", "112", "QXB", "07:30", "21:30"},
            {"Kho Quận 10 - Sư Vạn Hạnh", "640 Sư Vạn Hạnh, Phường 12, Quận 10, TP.HCM", "0901000024", "COMING_SOON", "118", "QXC", "08:00", "21:00"},
            // Phú Nhuận
            {"Kho Phú Nhuận - Phan Xích Long", "98 Phan Xích Long, Phường 2, Phú Nhuận, TP.HCM", "0901000025", "AVAILABLE", "112", "PNA", "07:00", "22:00"},
            {"Kho Phú Nhuận - Nguyễn Văn Trỗi", "250 Nguyễn Văn Trỗi, Phường 8, Phú Nhuận, TP.HCM", "0901000026", "AVAILABLE", "110", "PNB", "06:30", "22:30"},
            {"Kho Phú Nhuận - Huỳnh Văn Bánh", "301 Huỳnh Văn Bánh, Phường 11, Phú Nhuận, TP.HCM", "0901000027", "AVAILABLE", "105", "PNC", "07:30", "21:00"},
    };

    // Bố trí ô kho của mỗi cơ sở khu vực (12 ô). Mỗi dòng: { loại kho (index STANDARD_TYPES), hậu tố mã, tầng, vị trí }
    // 5 ô đầu (S01, S02, M01, M02, L01) giữ đúng như seed cũ; 7 ô sau là ô mới.
    private static final String[][] AREA_UNITS = {
            {"0", "S01", "1", "Zone A - Row 1"}, {"0", "S02", "1", "Zone A - Row 2"},
            {"1", "M01", "2", "Zone B - Row 1"}, {"1", "M02", "2", "Zone B - Row 2"},
            {"2", "L01", "3", "Zone C - Row 1"},
            {"0", "S03", "1", "Zone A - Row 3"}, {"0", "S04", "1", "Zone A - Row 4"},
            {"1", "M03", "2", "Zone B - Row 3"}, {"1", "M04", "2", "Zone B - Row 4"},
            {"2", "L02", "3", "Zone C - Row 2"},
            {"3", "XL01", "G", "Zone D - Gần cửa bốc dỡ"}, {"3", "XL02", "G", "Zone D - Gần cửa bốc dỡ"},
    };

    private void seedAreaFacilities(FacilityRepository facilityRepo, UnitTypeRepository typeRepo,
                                    StorageUnitRepository unitRepo, PriceRuleRepository ruleRepo) {
        LocalDate from = LocalDate.now().minusMonths(1);
        // Giá gốc theo tháng của SMALL / MEDIUM / LARGE / EXTRA_LARGE và tiền cọc cố định.
        long[] baseRent = {1_000_000L, 1_700_000L, 2_900_000L, 4_800_000L};
        String[] deposit = {"500000", "800000", "1200000", "2000000"};

        for (int i = 0; i < AREA_FACILITIES.length; i++) {
            String[] row = AREA_FACILITIES[i];
            StockStatus stock = StockStatus.valueOf(row[3]);
            int factor = Integer.parseInt(row[4]);
            String prefix = row[5];

            Facility f = findOrCreateFacility(facilityRepo, row[0], row[1], row[2],
                    LocalTime.parse(row[6]), LocalTime.parse(row[7]), FacilityStatus.ACTIVE, stock);

            UnitType[] types = new UnitType[STANDARD_TYPES.length];
            for (int k = 0; k < STANDARD_TYPES.length; k++) {
                types[k] = findOrCreateStandardType(typeRepo, f, k);
            }

            // "Sắp có" (COMING_SOON): mọi ô đang chuẩn bị (INSPECTION). "Hết hàng" (OUT_OF_STOCK): mọi ô đã có khách.
            // Cơ sở thường: phần lớn còn trống, vài ô đã thuê hoặc đang bảo trì để demo bộ lọc.
            for (int u = 0; u < AREA_UNITS.length; u++) {
                String[] unit = AREA_UNITS[u];
                UnitType t = types[Integer.parseInt(unit[0])];
                createStorageUnitIfNotExists(unitRepo, f, t, prefix + "-" + unit[1], unit[2], unit[3],
                        areaUnitStatus(stock, i, u));
            }

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

    /**
     * Trạng thái ban đầu của ô thứ u ở cơ sở khu vực thứ i.
     * 5 ô đầu giữ đúng công thức của seed cũ; các ô mới: vài ô OCCUPIED / MAINTENANCE xen kẽ theo cơ sở.
     */
    private static UnitStatus areaUnitStatus(StockStatus stock, int i, int u) {
        if (stock == StockStatus.COMING_SOON) {
            return UnitStatus.INSPECTION;
        }
        if (stock == StockStatus.OUT_OF_STOCK) {
            return UnitStatus.OCCUPIED;
        }
        return switch (u) {
            case 1 -> i % 3 == 1 ? UnitStatus.OCCUPIED : UnitStatus.AVAILABLE; // S02
            case 3 -> UnitStatus.OCCUPIED;                                     // M02
            case 4 -> i % 3 == 2 ? UnitStatus.OCCUPIED : UnitStatus.AVAILABLE; // L01
            case 6 -> i % 4 == 0 ? UnitStatus.OCCUPIED : UnitStatus.AVAILABLE; // S04
            case 8 -> i % 5 == 0 ? UnitStatus.MAINTENANCE : UnitStatus.AVAILABLE; // M04
            case 11 -> i % 2 == 0 ? UnitStatus.OCCUPIED : UnitStatus.AVAILABLE; // XL02
            default -> UnitStatus.AVAILABLE;
        };
    }

    // Đổi chuỗi số ("2.00") thành BigDecimal; null thì giữ null (cột cho phép trống).
    private static BigDecimal decimal(String value) {
        return value == null ? null : new BigDecimal(value);
    }
}
