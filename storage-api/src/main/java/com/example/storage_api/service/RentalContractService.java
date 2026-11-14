package com.example.storage_api.service;

import com.example.storage_api.entity.*;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.RentalContractResponse;
import com.example.storage_api.model.request.ContractSignRequest;
import com.example.storage_api.model.request.RenewalRequest;
import com.example.storage_api.reponsitory.AppointmentRepository;
import com.example.storage_api.reponsitory.ContractProfileRepository;
import org.springframework.security.access.AccessDeniedException;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.PriceRuleRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.ReservationRepository;
import com.example.storage_api.reponsitory.StorageUnitRepository;
import com.example.storage_api.reponsitory.UnitReturnRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class RentalContractService {
    private static final Pattern STORED_FILE_URL = Pattern.compile(
            "^/api/files/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\.(png|jpg|jpeg|gif|webp)$");

    private final RentalContractRepository contractRepository;
    private final com.example.storage_api.reponsitory.ContractTerminationRepository terminationRepository;
    private final ReservationRepository reservationRepository;
    private final PolicyService policyService;
    private final PaymentRepository paymentRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final PriceRuleRepository priceRuleRepository;
    private final AppointmentRepository appointmentRepository;
    private final UnitReturnRepository unitReturnRepository;
    private final ContractProfileRepository contractProfileRepository;
    private final ContractPreSignApplier preSignApplier;
    private final CurrentUserService currentUserService;
    // Member 4: chuông thông báo khi hợp đồng quá hạn.
    private final OperationsNotificationService notifier;

    @Transactional
    public RentalContractResponse create(Integer reservationId) {
        Users caller = currentUserService.get();
        Reservation reservation = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy đơn đặt kho: " + reservationId));
        if (caller.getRole() == Role.CUSTOMER) {
            if (!reservation.getCustomer().getId().equals(caller.getId())) {
                throw new BadRequestException("Đơn đặt kho này không phải của bạn");
            }
        } else {
            currentUserService.assertFacilityAccess(caller, reservation.getFacility().getId());
        }

        if (reservation.getStorageUnit() == null) {
            throw new BadRequestException("Đơn đặt kho cần được gán ô kho trước");
        }
        if (reservation.getStatus() != ReservationStatus.CONFIRMED
                && reservation.getStatus() != ReservationStatus.ASSIGNED) {
            throw new ConflictException("Chỉ đơn đã gán ô hoặc đã xác nhận mới tạo được hợp đồng");
        }
        Optional<RentalContract> existing = contractRepository.findByReservation_Id(reservationId);
        if (existing.isPresent()) {
            throw new ConflictException("Đơn đặt kho này đã có hợp đồng");
        }

        BigDecimal monthlyPrice = resolveMonthlyAmount(
                reservation.getFacility().getId(), reservation.getUnitType().getId());
        BigDecimal depositAmount = resolveDepositAmount(reservation, monthlyPrice);

        RentalContract contract = new RentalContract();
        contract.setReservation(reservation);
        contract.setCustomer(reservation.getCustomer());
        contract.setStorageUnit(reservation.getStorageUnit());
        contract.setStartDate(reservation.getStartDate());
        contract.setEndDate(reservation.getStartDate().plusMonths(reservation.getRentalMonths()).minusDays(1));
        contract.setMonthlyPrice(ContractPricing.lockedMonthlyPrice(reservation, monthlyPrice));
        contract.setDepositAmount(depositAmount);
        contract.setStatus(ContractStatus.PENDING);
        preSignApplier.apply(contract);
        RentalContract saved = contractRepository.save(contract);
        appointmentRepository.findByCustomer_IdOrderByScheduledAtDesc(reservation.getCustomer().getId()).stream()
                .filter(a -> a.getReservation() != null && a.getReservation().getId().equals(reservation.getId()))
                .forEach(a -> { a.setRentalContract(saved); appointmentRepository.save(a); });
        return toResponse(saved);
    }

    @Transactional(readOnly = true)
    public List<RentalContractResponse> mine() {
        Users customer = currentUserService.get();
        return contractRepository.findByCustomer_IdOrderByCreatedAtDesc(customer.getId())
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<RentalContractResponse> list(Long facilityId) {
        return list(facilityId, null);
    }

    @Transactional(readOnly = true)
    public List<RentalContractResponse> list(Long facilityId, ContractStatus status) {
        Users caller = currentUserService.get();
        Long scope = facilityId;
        if (caller.getRole() == Role.FACILITY_STAFF || caller.getRole() == Role.FACILITY_MANAGER) {
            Long assigned = currentUserService.requireFacilityId(caller);
            if (facilityId != null && !facilityId.equals(assigned)) {
                throw new BadRequestException("Bạn không có quyền truy cập cơ sở này");
            }
            scope = assigned;
        }
        if (scope == null) {
            List<RentalContract> all = status == null
                    ? contractRepository.findAllByOrderByCreatedAtDesc()
                    : contractRepository.findByStatusOrderByCreatedAtDesc(status);
            return all.stream().map(this::toResponse).toList();
        }
        if (caller.getRole() != Role.BUSINESS_MANAGER) {
            currentUserService.assertFacilityAccess(caller, scope);
        }
        List<RentalContract> rows = status == null
                ? contractRepository.findByStorageUnit_Facility_IdOrderByCreatedAtDesc(scope)
                : contractRepository.findByStorageUnit_Facility_IdAndStatusOrderByCreatedAtDesc(scope, status);
        // Staff chỉ thấy hợp đồng của khách được gán cho mình.
        return rows.stream()
                .filter(c -> caller.getRole() != Role.FACILITY_STAFF
                        || (c.getReservation() != null && appointmentRepository
                        .existsByReservation_IdAndStaff_Id(c.getReservation().getId(), caller.getId())))
                .map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public RentalContractResponse get(Integer id) {
        RentalContract contract = findOrThrow(id);
        authorizeView(currentUserService.get(), contract);
        return toResponse(contract);
    }

    /**
     * Ký hợp đồng điện tử (POST /api/rental-contracts/{id}/sign):
     * - Chỉ CUSTOMER là chủ hợp đồng được gọi.
     * - Chỉ cho ký khi hợp đồng đang PENDING.
     * - Nếu đã ký rồi (signedAt != null) thì trả 409 Conflict ("Hợp đồng đã được ký").
     * - Kiểm tra signatureUrl phải là ảnh hợp lệ (data URL base64 có magic bytes PNG/JPEG/GIF/WebP hoặc /api/files/<uuid>).
     */
    @Transactional
    public RentalContractResponse signContract(Integer id, ContractSignRequest request) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        authorizeView(caller, contract);
        if (caller.getRole() != Role.CUSTOMER) {
            throw new BadRequestException("Chỉ khách hàng của hợp đồng mới được ký");
        }
        if (contract.getSignedAt() != null) {
            throw new ConflictException("Hợp đồng đã được ký");
        }
        if (contract.getStatus() != ContractStatus.PENDING) {
            throw new ConflictException("Chỉ hợp đồng đang chờ mới ký được (hiện tại: " + contract.getStatus() + ")");
        }
        // Phải có hồ sơ thông tin đã gửi; hồ sơ sai 3 lần thì chỉ được ký tại quầy.
        ContractProfile profile = contract.getReservation() == null ? null
                : contractProfileRepository.findByReservation_Id(contract.getReservation().getId()).orElse(null);
        if (profile == null || profile.getStatus() == ProfileStatus.DRAFT || profile.getStatus() == ProfileStatus.REJECTED) {
            throw new ConflictException("Quý khách cần điền và gửi hồ sơ thông tin hợp đồng trước khi ký.");
        }
        if (profile.isSignAtCounterRequired()) {
            throw new ConflictException("Hồ sơ của quý khách cần ký trực tiếp tại quầy khi nhận kho, nhân viên sẽ hỗ trợ.");
        }
        applySignature(contract, request, caller.getFullname(), false);
        return toResponse(contractRepository.save(contract));
    }

    /**
     * Nhân viên / quản lý ký hộ cho khách tại quầy (khách đến gặp trực tiếp): ghi rõ là ký tại quầy.
     * Vẫn bắt buộc hồ sơ thông tin đã gửi (nhân viên có thể điền hộ trước).
     */
    @Transactional
    public RentalContractResponse signAtCounter(Integer id, ContractSignRequest request) {
        Users caller = currentUserService.get();
        if (caller.getRole() != Role.FACILITY_STAFF && caller.getRole() != Role.FACILITY_MANAGER) {
            throw new AccessDeniedException("Chỉ nhân viên hoặc quản lý cơ sở mới ký tại quầy");
        }
        RentalContract contract = findOrThrow(id);
        authorizeView(caller, contract);
        if (contract.getSignedAt() != null) {
            throw new ConflictException("Hợp đồng đã được ký");
        }
        if (contract.getStatus() != ContractStatus.PENDING) {
            throw new ConflictException("Chỉ hợp đồng đang chờ mới ký được (hiện tại: " + contract.getStatus() + ")");
        }
        ContractProfile profile = contract.getReservation() == null ? null
                : contractProfileRepository.findByReservation_Id(contract.getReservation().getId()).orElse(null);
        if (profile == null || profile.getStatus() == ProfileStatus.DRAFT || profile.getStatus() == ProfileStatus.REJECTED) {
            throw new ConflictException("Cần điền và gửi hồ sơ thông tin hợp đồng của khách trước khi ký.");
        }
        applySignature(contract, request, contract.getCustomer().getFullname(), true);
        return toResponse(contractRepository.save(contract));
    }

    // ---------- Ký trước khi gán kho ----------
    /** Khách ký điện tử trước khi quản lý gán ô kho: lưu chữ ký trên hồ sơ, chép sang hợp đồng khi hợp đồng được tạo. */
    @Transactional
    public ContractProfile preSign(Integer reservationId, ContractSignRequest request) {
        Users caller = currentUserService.get();
        Reservation r = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy đơn đặt kho: " + reservationId));
        if (caller.getRole() != Role.CUSTOMER || !r.getCustomer().getId().equals(caller.getId())) {
            throw new AccessDeniedException("Chỉ khách của đơn này mới được ký");
        }
        if (contractRepository.findByReservation_Id(reservationId).isPresent()) {
            throw new ConflictException("Đơn này đã có hợp đồng, hãy ký ở mục Hợp đồng của tôi");
        }
        ContractProfile p = contractProfileRepository.findByReservation_Id(reservationId)
                .orElseThrow(() -> new ConflictException("Quý khách cần điền và gửi hồ sơ thông tin hợp đồng trước khi ký."));
        if (p.getStatus() == ProfileStatus.DRAFT || p.getStatus() == ProfileStatus.REJECTED) {
            throw new ConflictException("Quý khách cần điền và gửi hồ sơ thông tin hợp đồng trước khi ký.");
        }
        if (p.isSignAtCounterRequired()) {
            throw new ConflictException("Hồ sơ của quý khách cần ký trực tiếp tại quầy khi nhận kho, nhân viên sẽ hỗ trợ.");
        }
        if (p.getPreSignedAt() != null) {
            throw new ConflictException("Quý khách đã ký rồi. Muốn ký lại hãy rút chữ ký trước.");
        }
        if ("PENDING_REVIEW".equals(p.getPreScanStatus()) || "APPROVED".equals(p.getPreScanStatus())) {
            throw new ConflictException("Hợp đồng đã được ký tại cơ sở, quý khách không cần ký thêm.");
        }
        String sig = request == null || request.getSignatureUrl() == null ? "" : request.getSignatureUrl().trim();
        if (!isValidSignatureImage(sig)) {
            throw new BadRequestException("Chữ ký phải là ảnh hợp lệ (PNG, JPEG, GIF hoặc WebP)");
        }
        p.setPreSignedAt(LocalDateTime.now());
        p.setPreSignerName(request.getSignerName() != null && !request.getSignerName().isBlank()
                ? request.getSignerName().trim() : caller.getFullname());
        p.setPreSignatureUrl(sig);
        return contractProfileRepository.save(p);
    }

    /** Rút chữ ký ký trước, chỉ được khi hợp đồng chưa được tạo (chưa gán kho). */
    @Transactional
    public void withdrawPreSign(Integer reservationId) {
        Users caller = currentUserService.get();
        ContractProfile p = contractProfileRepository.findByReservation_Id(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Chưa có hồ sơ cho đơn " + reservationId));
        if (caller.getRole() != Role.CUSTOMER || !p.getCustomer().getId().equals(caller.getId())) {
            throw new AccessDeniedException("Chỉ khách của đơn này mới được rút chữ ký");
        }
        if (contractRepository.findByReservation_Id(reservationId).isPresent()) {
            throw new ConflictException("Hợp đồng đã được tạo, không rút chữ ký được nữa");
        }
        if (p.getPreSignedAt() == null) {
            throw new ConflictException("Quý khách chưa ký trước");
        }
        p.setPreSignedAt(null);
        p.setPreSignerName(null);
        p.setPreSignatureUrl(null);
        contractProfileRepository.save(p);
    }

    // ---------- Ảnh hợp đồng đã ký tại chỗ ----------
    /**
     * Nhân viên / quản lý tải lên ảnh hợp đồng giấy khách đã ký tại chỗ. Chỉ tải một lần: tải xong phải chờ quản lý duyệt;
     * bị từ chối thì mới được tải lại. Quản lý tự tải thì được duyệt luôn.
     */
    @Transactional
    public RentalContractResponse uploadSignedScan(Integer id, String url) {
        Users caller = currentUserService.get();
        if (caller.getRole() != Role.FACILITY_STAFF && caller.getRole() != Role.FACILITY_MANAGER) {
            throw new AccessDeniedException("Chỉ nhân viên hoặc quản lý cơ sở mới tải ảnh hợp đồng");
        }
        RentalContract c = findOrThrow(id);
        authorizeView(caller, c);
        if (c.getSignedAt() != null) {
            throw new ConflictException("Hợp đồng đã được ký");
        }
        if (c.getStatus() != ContractStatus.PENDING) {
            throw new ConflictException("Chỉ hợp đồng đang chờ mới tải ảnh được");
        }
        if ("PENDING_REVIEW".equals(c.getSignedScanStatus())) {
            throw new ConflictException("Ảnh hợp đồng đã được tải lên và đang chờ quản lý duyệt");
        }
        String clean = url == null ? "" : url.trim();
        if (!STORED_FILE_URL.matcher(clean).matches()) {
            throw new BadRequestException("Ảnh hợp đồng phải được tải lên hệ thống trước");
        }
        c.setSignedScanUrl(clean);
        c.setSignedScanUploader(caller.getFullname());
        c.setSignedScanUploadedAt(LocalDateTime.now());
        c.setSignedScanNote(null);
        if (caller.getRole() == Role.FACILITY_MANAGER) {
            approveScanInternal(c);
        } else {
            c.setSignedScanStatus("PENDING_REVIEW");
            notifier.notifyFacilityManagers(c.getStorageUnit().getFacility().getId(),
                    "Cần duyệt ảnh hợp đồng", "Ảnh hợp đồng đã ký tại chỗ cần duyệt",
                    caller.getFullname() + " vừa tải ảnh hợp đồng #" + c.getId() + " đã ký tại chỗ, vui lòng kiểm tra và duyệt.",
                    "/admin/reservations");
        }
        return toResponse(contractRepository.save(c));
    }

    @Transactional
    public RentalContractResponse reviewSignedScan(Integer id, boolean approve, String reason) {
        Users caller = currentUserService.get();
        RentalContract c = findOrThrow(id);
        currentUserService.assertManagerOfFacility(caller, c.getStorageUnit().getFacility().getId());
        if (!"PENDING_REVIEW".equals(c.getSignedScanStatus())) {
            throw new ConflictException("Không có ảnh hợp đồng nào đang chờ duyệt");
        }
        if (approve) {
            approveScanInternal(c);
        } else {
            if (reason == null || reason.isBlank()) {
                throw new BadRequestException("Vui lòng nhập lý do từ chối");
            }
            c.setSignedScanStatus("REJECTED");
            c.setSignedScanNote(reason.trim());
        }
        return toResponse(contractRepository.save(c));
    }

    // ---------- Ảnh ký tại chỗ khi chưa có hợp đồng ----------
    @Transactional
    public ContractProfile uploadPreScan(Integer reservationId, String url) {
        Users caller = currentUserService.get();
        if (caller.getRole() != Role.FACILITY_STAFF && caller.getRole() != Role.FACILITY_MANAGER) {
            throw new AccessDeniedException("Chỉ nhân viên hoặc quản lý cơ sở mới tải ảnh hợp đồng");
        }
        Reservation r = reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy đơn đặt kho: " + reservationId));
        currentUserService.assertFacilityAccess(caller, r.getFacility().getId());
        if (contractRepository.findByReservation_Id(reservationId).isPresent()) {
            throw new ConflictException("Đơn này đã có hợp đồng, hãy tải ảnh ở hợp đồng");
        }
        ContractProfile p = contractProfileRepository.findByReservation_Id(reservationId)
                .orElseThrow(() -> new ConflictException("Cần có hồ sơ thông tin hợp đồng của khách trước."));
        if (p.getStatus() == ProfileStatus.DRAFT || p.getStatus() == ProfileStatus.REJECTED) {
            throw new ConflictException("Cần điền và gửi hồ sơ thông tin hợp đồng của khách trước khi tải ảnh.");
        }
        if (p.getPreSignedAt() != null || "PENDING_REVIEW".equals(p.getPreScanStatus()) || "APPROVED".equals(p.getPreScanStatus())) {
            throw new ConflictException("Hợp đồng này đã có chữ ký hoặc ảnh đang chờ duyệt");
        }
        String clean = url == null ? "" : url.trim();
        if (!STORED_FILE_URL.matcher(clean).matches()) {
            throw new BadRequestException("Ảnh hợp đồng phải được tải lên hệ thống trước");
        }
        p.setPreScanUrl(clean);
        p.setPreScanUploader(caller.getFullname());
        p.setPreScanNote(null);
        if (caller.getRole() == Role.FACILITY_MANAGER) {
            p.setPreScanStatus("APPROVED");
        } else {
            p.setPreScanStatus("PENDING_REVIEW");
            notifier.notifyFacilityManagers(r.getFacility().getId(),
                    "Cần duyệt ảnh hợp đồng", "Ảnh hợp đồng đã ký tại chỗ cần duyệt",
                    caller.getFullname() + " vừa tải ảnh hợp đồng đã ký tại chỗ của đơn #" + r.getId() + ", vui lòng kiểm tra và duyệt.",
                    "/admin/contract-profiles/" + r.getId() + "/fill");
        }
        return contractProfileRepository.save(p);
    }

    @Transactional
    public ContractProfile reviewPreScan(Integer reservationId, boolean approve, String reason) {
        Users caller = currentUserService.get();
        ContractProfile p = contractProfileRepository.findByReservation_Id(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Chưa có hồ sơ cho đơn " + reservationId));
        currentUserService.assertManagerOfFacility(caller, p.getReservation().getFacility().getId());
        if (!"PENDING_REVIEW".equals(p.getPreScanStatus())) {
            throw new ConflictException("Không có ảnh hợp đồng nào đang chờ duyệt");
        }
        if (approve) {
            p.setPreScanStatus("APPROVED");
        } else {
            if (reason == null || reason.isBlank()) {
                throw new BadRequestException("Vui lòng nhập lý do từ chối");
            }
            p.setPreScanStatus("REJECTED");
            p.setPreScanNote(reason.trim());
        }
        return contractProfileRepository.save(p);
    }

    private void approveScanInternal(RentalContract c) {
        c.setSignedScanStatus("APPROVED");
        c.setSignedAt(LocalDateTime.now());
        c.setSignerName(c.getCustomer().getFullname());
        c.setSignedAtCounter(true);
    }

    private void applySignature(RentalContract contract, ContractSignRequest request, String defaultSigner, boolean atCounter) {
        if (request == null || request.getSignatureUrl() == null || request.getSignatureUrl().isBlank()) {
            throw new BadRequestException("Cần có chữ ký");
        }
        String trimmedSig = request.getSignatureUrl().trim();
        if (!isValidSignatureImage(trimmedSig)) {
            throw new BadRequestException("Chữ ký phải là ảnh hợp lệ (PNG, JPEG, GIF hoặc WebP)");
        }
        String resolvedSigner = (request.getSignerName() != null && !request.getSignerName().isBlank())
                ? request.getSignerName().trim()
                : defaultSigner;
        contract.setSignedAt(LocalDateTime.now());
        contract.setSignerName(resolvedSigner);
        contract.setSignatureUrl(trimmedSig);
        contract.setSignedAtCounter(atCounter);
    }

    private boolean isValidSignatureImage(String sig) {
        if (sig == null || sig.isBlank()) {
            return false;
        }
        if (STORED_FILE_URL.matcher(sig).matches()) {
            return true;
        }
        if (!sig.startsWith("data:image/")) {
            return false;
        }
        int base64Idx = sig.indexOf(";base64,");
        if (base64Idx <= "data:image/".length()) {
            return false;
        }
        String mimeSub = sig.substring("data:image/".length(), base64Idx).toLowerCase();
        if (!mimeSub.equals("png") && !mimeSub.equals("jpeg") && !mimeSub.equals("jpg")
                && !mimeSub.equals("gif") && !mimeSub.equals("webp")) {
            return false;
        }
        String b64 = sig.substring(base64Idx + ";base64,".length()).replaceAll("\\s+", "");
        if (b64.isEmpty()) {
            return false;
        }
        try {
            byte[] h = Base64.getDecoder().decode(b64);
            if (h.length >= 8 && (h[0] & 0xFF) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G') {
                return true;
            }
            if (h.length >= 3 && (h[0] & 0xFF) == 0xFF && (h[1] & 0xFF) == 0xD8 && (h[2] & 0xFF) == 0xFF) {
                return true;
            }
            if (h.length >= 6 && h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8') {
                return true;
            }
            if (h.length >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F'
                    && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P') {
                return true;
            }
            return false;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    /**
     * Luồng Renewal chuẩn theo đặc tả:
     * Customer request renewal -> BE lấy giá RENEWAL từ PriceRules -> Create Payment (PENDING).
     * Khách không được tự đặt paid=true khi tạo yêu cầu gia hạn; chỉ khi khoản thanh toán RENEWAL
     * được nhân viên/quản lý xác nhận PAID (qua PATCH /api/payments/{id}/paid) thì EndDate mới được cộng thêm tháng.
     */
    @Transactional
    public RentalContractResponse renew(Integer id, RenewalRequest request) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        authorizeView(caller, contract);
        if (caller.getRole() != Role.CUSTOMER) {
            throw new BadRequestException("Chỉ khách hàng của hợp đồng mới yêu cầu gia hạn được");
        }
        if (request.getMonths() == null || request.getMonths() < 1 || request.getMonths() > policyService.get().getMaxRenewalMonths()) {
            throw new BadRequestException("Mỗi lần gia hạn chỉ được từ 1 đến " + policyService.get().getMaxRenewalMonths() + " tháng.");
        }
        if (Boolean.TRUE.equals(request.getPaid())) {
            throw new BadRequestException("Khách hàng không thể tự đánh dấu đã thanh toán gia hạn; vui lòng thanh toán qua mã QR");
        }
        if (contract.getStatus() != ContractStatus.ACTIVE && contract.getStatus() != ContractStatus.OVERDUE) {
            throw new ConflictException("Chỉ hợp đồng đang thuê hoặc quá hạn mới gia hạn được");
        }

        BigDecimal renewalMonthly = resolveRenewalMonthlyRate(contract);
        BigDecimal currentRate = currentPaidMonthlyRate(contract);
        if (currentRate != null && renewalMonthly.compareTo(currentRate) != 0
                && !Boolean.TRUE.equals(request.getConfirmPriceChange())) {
            throw new ConflictException("PRICE_CHANGED:Giá gia hạn mỗi tháng đã đổi từ " + currentRate.toPlainString()
                    + " sang " + renewalMonthly.toPlainString() + ". Vui lòng xác nhận giá mới để tiếp tục.");
        }
        BigDecimal totalRenewalAmount = renewalMonthly.multiply(BigDecimal.valueOf(request.getMonths()))
                .setScale(2, RoundingMode.HALF_UP);

        String method = request.getPaymentMethod() != null && !request.getPaymentMethod().isBlank()
                ? request.getPaymentMethod().trim()
                : null;
        String ref = "RENEW_MONTHS:" + request.getMonths();

        Payment renewalPayment = paymentRepository
                .findFirstByRentalContract_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        contract.getId(), PaymentType.RENEWAL, PaymentStatus.PENDING)
                .orElseGet(Payment::new);

        renewalPayment.setCustomer(contract.getCustomer());
        renewalPayment.setReservation(contract.getReservation());
        renewalPayment.setRentalContract(contract);
        renewalPayment.setPaymentType(PaymentType.RENEWAL);
        renewalPayment.setAmount(totalRenewalAmount);
        renewalPayment.setPaymentMethod(method);
        renewalPayment.setTransactionReference(ref);
        renewalPayment.setStatus(PaymentStatus.PENDING);
        renewalPayment.setPaidAt(null);
        paymentRepository.save(renewalPayment);

        return toResponse(contract);
    }

    /** Giá tháng khách đang trả: lần gia hạn đã thanh toán gần nhất (tiền / số tháng), chưa gia hạn thì lấy giá trên hợp đồng. */
    private BigDecimal currentPaidMonthlyRate(RentalContract contract) {
        for (Payment p : paymentRepository.findByRentalContract_IdOrderByCreatedAtDesc(contract.getId())) {
            String ref = p.getTransactionReference();
            if (p.getPaymentType() == PaymentType.RENEWAL && p.getStatus() == PaymentStatus.PAID
                    && ref != null && ref.startsWith("RENEW_MONTHS:")) {
                try {
                    int n = Integer.parseInt(ref.substring("RENEW_MONTHS:".length()).trim());
                    if (n > 0 && p.getAmount() != null) {
                        return p.getAmount().divide(BigDecimal.valueOf(n), 2, RoundingMode.HALF_UP);
                    }
                } catch (NumberFormatException ignored) {
                    // bỏ qua, xét khoản tiếp theo
                }
            }
        }
        return contract.getMonthlyPrice() != null ? contract.getMonthlyPrice().setScale(2, RoundingMode.HALF_UP) : null;
    }

    /** Báo giá gia hạn cho khách: so giá đang trả với giá gia hạn hiện hành. */
    @Transactional(readOnly = true)
    public com.example.storage_api.model.reponse.RenewalQuoteResponse renewalQuote(Integer id, Integer months) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        authorizeView(caller, contract);
        int m = months == null ? 1 : months;
        int max = policyService.get().getMaxRenewalMonths();
        if (m < 1 || m > max) {
            throw new BadRequestException("Mỗi lần gia hạn chỉ được từ 1 đến " + max + " tháng.");
        }
        BigDecimal newRate = resolveRenewalMonthlyRate(contract);
        BigDecimal current = currentPaidMonthlyRate(contract);
        boolean changed = current != null && newRate.compareTo(current) != 0;
        BigDecimal percent = BigDecimal.ZERO;
        if (changed && current.signum() > 0) {
            percent = newRate.subtract(current).multiply(BigDecimal.valueOf(100))
                    .divide(current, 1, RoundingMode.HALF_UP);
        }
        return new com.example.storage_api.model.reponse.RenewalQuoteResponse(contract.getId(), m, current, newRate,
                newRate.multiply(BigDecimal.valueOf(m)).setScale(2, RoundingMode.HALF_UP), changed, percent);
    }

    /**
     * Đánh dấu 1 hợp đồng là OVERDUE (PATCH /api/rental-contracts/{id}/overdue) và tự động tạo Payment OVERDUE_FEE (PENDING).
     */
    @Transactional
    public RentalContractResponse markSingleOverdue(Integer id) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        currentUserService.assertFacilityAccess(caller, contract.getStorageUnit().getFacility().getId());
        if (contract.getStatus() != ContractStatus.ACTIVE && contract.getStatus() != ContractStatus.OVERDUE) {
            throw new ConflictException("Chỉ hợp đồng đang thuê hoặc quá hạn mới đánh dấu quá hạn được (hiện tại: " + contract.getStatus() + ")");
        }
        applyOverdueAndCreateFee(contract);
        return toResponse(contract);
    }

    /**
     * Quét hàng loạt tất cả hợp đồng ACTIVE đã quá hạn (EndDate < hôm nay), chuyển sang OVERDUE và tạo Payment OVERDUE_FEE.
     * Chạy tự động theo lịch định kỳ và khi quản lý bấm nút quét trên FE.
     */
    @Scheduled(initialDelayString = "${app.reminders.initial-delay-ms:60000}", fixedDelayString = "${app.reminders.interval-ms:900000}")
    @Transactional
    public int markOverdue() {
        List<RentalContract> expired = new java.util.ArrayList<>(contractRepository.findByStatusAndEndDateBefore(
                ContractStatus.ACTIVE, LocalDate.now()));
        // Hợp đồng đã OVERDUE cũng được cập nhật mỗi ngày để phí quá hạn tăng theo số ngày.
        expired.addAll(contractRepository.findByStatusAndEndDateBefore(ContractStatus.OVERDUE, LocalDate.now()));
        expired.forEach(this::applyOverdueAndCreateFee);
        return expired.size();
    }

    /**
     * Kích hoạt hợp đồng (PATCH /api/rental-contracts/{id}/activate) — BR-52 & BR-62:
     * Bắt buộc khách đã ký hợp đồng (signedAt != null) và đã thanh toán đủ cả Đợt 1 (DEPOSIT = PAID)
     * lẫn Đợt 2 (RENTAL = PAID, không còn khoản RENTAL nào đang PENDING).
     * Đồng thời tự động đóng (COMPLETED) lịch hẹn CHECK_IN đang chờ (SCHEDULED) của đơn/hợp đồng đó.
     */
    @Transactional
    public RentalContractResponse activateContract(Integer id) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        currentUserService.assertFacilityAccess(caller, contract.getStorageUnit().getFacility().getId());
        if (contract.getStatus() != ContractStatus.PENDING) {
            throw new ConflictException("Hợp đồng phải ở trạng thái chờ mới kích hoạt được (hiện tại: " + contract.getStatus() + ")");
        }
        if (contract.getSignedAt() == null) {
            throw new BadRequestException("Khách hàng cần ký hợp đồng trước khi kích hoạt");
        }
        Reservation reservation = contract.getReservation();
        if (reservation == null || !paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                reservation.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID)) {
            throw new BadRequestException("Chưa thanh toán tiền cọc (Đợt 1)");
        }
        // Tiền thuê (Đợt 2) không cần trả trước khi nhận kho: khách trả trong vòng nửa thời gian thuê (xem Stage2PaymentService).

        contract.setStatus(ContractStatus.ACTIVE);
        StorageUnit unit = contract.getStorageUnit();
        unit.setStatus(UnitStatus.OCCUPIED);
        storageUnitRepository.save(unit);
        if (reservation.getStatus() == ReservationStatus.CONFIRMED) {
            reservation.setStatus(ReservationStatus.COMPLETED);
            reservationRepository.save(reservation);
        }
        RentalContract saved = contractRepository.save(contract);
        closeScheduledCheckInAppointments(saved);
        return toResponse(saved);
    }

    /**
     * Hoàn tất hợp đồng (PATCH /api/rental-contracts/{id}/complete) — BR-56:
     * Bắt buộc đã có biên bản trả kho (UnitReturn), giải phóng StorageUnit nếu còn đang OCCUPIED,
     * và hoàn trả tiền đặt cọc (DEPOSIT -> REFUNDED).
     */
    @Transactional
    public RentalContractResponse completeContract(Integer id) {
        Users caller = currentUserService.get();
        RentalContract contract = findOrThrow(id);
        currentUserService.assertFacilityAccess(caller, contract.getStorageUnit().getFacility().getId());
        if (contract.getStatus() != ContractStatus.ACTIVE && contract.getStatus() != ContractStatus.OVERDUE) {
            throw new ConflictException("Chỉ hợp đồng đang thuê hoặc quá hạn mới hoàn tất được");
        }
        if (!unitReturnRepository.existsByRentalContract_Id(contract.getId())) {
            throw new BadRequestException("Cần lập biên bản kiểm tra trả kho trước khi hoàn tất hợp đồng");
        }
        StorageUnit unit = contract.getStorageUnit();
        if (unit != null && unit.getStatus() == UnitStatus.OCCUPIED) {
            unit.setStatus(UnitStatus.AVAILABLE);
            storageUnitRepository.save(unit);
        }
        refundDepositOnReturn(contract, null);
        contract.setStatus(ContractStatus.COMPLETED);
        RentalContract saved = contractRepository.save(contract);
        closeScheduledCheckInAppointments(saved);
        return toResponse(saved);
    }

    /**
     * Hoàn trả tiền cọc (DEPOSIT -> REFUNDED) khi khách trả kho / kết thúc hợp đồng bình thường.
     * Nếu có phí hư hại (damageFee > 0) thì khấu trừ vào tiền cọc hoàn lại.
     */
    @Transactional
    public void refundDepositOnReturn(RentalContract contract, BigDecimal damageFee) {
        if (contract == null) {
            return;
        }
        closeScheduledCheckInAppointments(contract);
        Optional<Payment> paidDepositOpt = Optional.empty();
        if (contract.getReservation() != null) {
            paidDepositOpt = paymentRepository.findFirstByReservation_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                    contract.getReservation().getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        }
        if (paidDepositOpt.isEmpty()) {
            paidDepositOpt = paymentRepository.findFirstByRentalContract_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                    contract.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        }
        if (paidDepositOpt.isPresent()) {
            Payment depositPayment = paidDepositOpt.get();
            BigDecimal baseDeposit = contract.getDepositAmount() != null
                    ? contract.getDepositAmount()
                    : depositPayment.getAmount();
            BigDecimal remaining = baseDeposit;
            java.util.List<String> lines = new java.util.ArrayList<>();

            // 1) Phí quá hạn / phụ thu chưa thanh toán được trừ vào cọc trước.
            for (Payment fee : paymentRepository.findByRentalContract_IdOrderByCreatedAtDesc(contract.getId())) {
                if (fee.getStatus() == PaymentStatus.PENDING
                        && (fee.getPaymentType() == PaymentType.OVERDUE_FEE || fee.getPaymentType() == PaymentType.EXTRA_FEE)
                        && remaining.compareTo(fee.getAmount()) >= 0) {
                    remaining = remaining.subtract(fee.getAmount());
                    fee.setStatus(PaymentStatus.PAID);
                    fee.setPaidAt(LocalDateTime.now());
                    fee.setPaymentMethod("TRU_VAO_COC");
                    paymentRepository.save(fee);
                    lines.add((fee.getPaymentType() == PaymentType.OVERDUE_FEE ? "Phí quá hạn" : "Phụ phí phát sinh")
                            + "|" + fee.getAmount().toPlainString());
                }
            }
            // 2) Phí hư hại do manager chốt: trừ trong phạm vi tiền cọc còn lại (phần vượt thành hóa đơn riêng).
            BigDecimal damageDeduction = BigDecimal.ZERO;
            if (damageFee != null && damageFee.signum() > 0) {
                damageDeduction = damageFee.min(remaining);
                remaining = remaining.subtract(damageDeduction);
                lines.add("Phí hư hại|" + damageDeduction.toPlainString());
            }
            BigDecimal deduction = baseDeposit.subtract(remaining);
            BigDecimal refundAmount = remaining.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);

            depositPayment.setStatus(PaymentStatus.REFUNDED);
            depositPayment.setRefundAmount(refundAmount);
            depositPayment.setDeductionAmount(deduction.setScale(2, RoundingMode.HALF_UP));
            depositPayment.setDeductionLines(lines.isEmpty() ? null : String.join(";", lines));
            depositPayment.setTransactionReference(refundAmount.signum() == 0
                    ? "KHAU_TRU_HET_COC:0.00"
                    : (deduction.signum() > 0 ? "HOAN_COC_SAU_KHAU_TRU:" + refundAmount : "HOAN_COC_DU:" + refundAmount));
            paymentRepository.save(depositPayment);
        }
    }

    private void closeScheduledCheckInAppointments(RentalContract contract) {
        if (contract == null) {
            return;
        }
        if (contract.getReservation() != null) {
            appointmentRepository.findByReservation_IdAndAppointmentTypeAndStatus(
                            contract.getReservation().getId(), AppointmentType.CHECK_IN, AppointmentStatus.SCHEDULED)
                    .forEach(a -> {
                        a.setRentalContract(contract);
                        a.setStatus(AppointmentStatus.COMPLETED);
                        appointmentRepository.save(a);
                    });
        }
        if (contract.getId() != null) {
            appointmentRepository.findByRentalContract_IdAndAppointmentTypeAndStatus(
                            contract.getId(), AppointmentType.CHECK_IN, AppointmentStatus.SCHEDULED)
                    .forEach(a -> {
                        a.setStatus(AppointmentStatus.COMPLETED);
                        appointmentRepository.save(a);
                    });
        }
    }

    private void applyOverdueAndCreateFee(RentalContract contract) {
        boolean firstTime = contract.getStatus() != ContractStatus.OVERDUE;
        contract.setStatus(ContractStatus.OVERDUE);
        contractRepository.save(contract);
        if (firstTime) {
            notifier.notifyUser(contract.getCustomer(), "Hợp đồng đã quá hạn", "Hợp đồng thuê kho của quý khách đã quá hạn",
                    "Hợp đồng #" + contract.getId() + " (ô " + contract.getStorageUnit().getUnitCode() + ") đã hết hạn ngày "
                            + contract.getEndDate() + ". Quý khách vui lòng gia hạn hoặc dọn kho và trả kho sớm. Phí lưu kho quá hạn được tính theo từng ngày "
                            + "và trừ vào tiền đặt cọc.", "/account/contracts");
        }

        java.util.Optional<Payment> pendingFee = paymentRepository
                .findFirstByRentalContract_IdAndPaymentTypeAndStatusOrderByCreatedAtDesc(
                        contract.getId(), PaymentType.OVERDUE_FEE, PaymentStatus.PENDING);
        if (pendingFee.isPresent()) {
            // Phí quá hạn tăng theo từng ngày: cập nhật số tiền của hóa đơn đang chờ.
            Payment fee = pendingFee.get();
            BigDecimal updated = calculateOverdueFee(contract);
            if (updated.compareTo(fee.getAmount()) != 0) {
                fee.setAmount(updated);
                paymentRepository.save(fee);
            }
        } else if (!paymentRepository.existsByRentalContract_IdAndPaymentTypeAndStatus(
                contract.getId(), PaymentType.OVERDUE_FEE, PaymentStatus.PAID)
                && !paymentRepository.existsByRentalContract_IdAndPaymentTypeAndWaivedAtIsNotNull(
                contract.getId(), PaymentType.OVERDUE_FEE)) {
            BigDecimal overdueFee = calculateOverdueFee(contract);
            Payment feePayment = new Payment();
            feePayment.setCustomer(contract.getCustomer());
            feePayment.setReservation(contract.getReservation());
            feePayment.setRentalContract(contract);
            feePayment.setPaymentType(PaymentType.OVERDUE_FEE);
            feePayment.setAmount(overdueFee);
            feePayment.setStatus(PaymentStatus.PENDING);
            paymentRepository.save(feePayment);
        }
    }

    public BigDecimal calculateOverdueFee(RentalContract contract) {
        long days = Math.max(1L, ChronoUnit.DAYS.between(contract.getEndDate(), LocalDate.now()));
        return overdueFeeForDays(contract, days);
    }

    /** Phí trễ hạn theo số ngày: mặc định mỗi ngày bằng 1/30 giá thuê tháng, hoặc theo luật giá "Phí quá hạn" nếu có. */
    public BigDecimal overdueFeeForDays(RentalContract contract, long daysOverdue) {
        Long facilityId = contract.getStorageUnit().getFacility().getId();
        Integer unitTypeId = contract.getStorageUnit().getUnitType().getId();
        Optional<PriceRule> ruleOpt = findRuleGracefully(PriceType.OVERDUE, facilityId, unitTypeId);
        // Mặc định: mỗi ngày quá hạn tính bằng 1/30 giá thuê tháng; luật giá OVERDUE theo ngày thì dùng đơn giá của luật.
        BigDecimal dailyDefault = contract.getMonthlyPrice()
                .divide(BigDecimal.valueOf(30), 2, RoundingMode.HALF_UP);
        if (ruleOpt.isEmpty()) {
            return dailyDefault.multiply(BigDecimal.valueOf(daysOverdue)).setScale(2, RoundingMode.HALF_UP);
        }
        PriceRule rule = ruleOpt.get();
        if (rule.getCalculationType() == CalculationType.PERCENTAGE && rule.getPercentage() != null) {
            return contract.getMonthlyPrice().multiply(rule.getPercentage())
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        if (rule.getCalculationType() == CalculationType.PER_DAY && rule.getAmount() != null) {
            return rule.getAmount().multiply(BigDecimal.valueOf(daysOverdue))
                    .setScale(2, RoundingMode.HALF_UP);
        }
        if (rule.getAmount() != null) {
            return rule.getAmount().setScale(2, RoundingMode.HALF_UP);
        }
        return dailyDefault.multiply(BigDecimal.valueOf(daysOverdue)).setScale(2, RoundingMode.HALF_UP);
    }

    public BigDecimal resolveRenewalMonthlyRate(RentalContract contract) {
        Long facilityId = contract.getStorageUnit().getFacility().getId();
        Integer unitTypeId = contract.getStorageUnit().getUnitType().getId();
        Optional<PriceRule> ruleOpt = findRuleGracefully(PriceType.RENEWAL, facilityId, unitTypeId);
        if (ruleOpt.isEmpty()) {
            return contract.getMonthlyPrice().setScale(2, RoundingMode.HALF_UP);
        }
        PriceRule rule = ruleOpt.get();
        if (rule.getCalculationType() == CalculationType.PERCENTAGE && rule.getPercentage() != null) {
            return contract.getMonthlyPrice().multiply(rule.getPercentage())
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        if (rule.getCalculationType() == CalculationType.PER_DAY && rule.getAmount() != null) {
            return rule.getAmount().multiply(BigDecimal.valueOf(30)).setScale(2, RoundingMode.HALF_UP);
        }
        if (rule.getAmount() != null) {
            return rule.getAmount().setScale(2, RoundingMode.HALF_UP);
        }
        return contract.getMonthlyPrice().setScale(2, RoundingMode.HALF_UP);
    }

    private RentalContract findOrThrow(Integer id) {
        return contractRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy hợp đồng thuê kho: " + id));
    }

    private void authorizeView(Users caller, RentalContract contract) {
        if (caller.getRole() == Role.CUSTOMER) {
            if (!caller.getId().equals(contract.getCustomer().getId())) {
                throw new BadRequestException("Hợp đồng này không phải của bạn");
            }
            return;
        }
        if (caller.getRole() != Role.BUSINESS_MANAGER) {
            currentUserService.assertFacilityAccess(caller, contract.getStorageUnit().getFacility().getId());
        }
    }

    private BigDecimal resolveMonthlyAmount(Long facilityId, Integer unitTypeId) {
        Optional<PriceRule> ruleOpt = findRuleGracefully(PriceType.RENTAL, facilityId, unitTypeId);
        if (ruleOpt.isEmpty() || ruleOpt.get().getAmount() == null) {
            return BigDecimal.valueOf(1000000).setScale(2, RoundingMode.HALF_UP);
        }
        PriceRule rule = ruleOpt.get();
        if (rule.getCalculationType() == CalculationType.PER_DAY) {
            return rule.getAmount().multiply(BigDecimal.valueOf(30)).setScale(2, RoundingMode.HALF_UP);
        }
        return rule.getAmount().setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal resolveDepositAmount(Reservation reservation, BigDecimal monthlyPrice) {
        Optional<PriceRule> ruleOpt = findRuleGracefully(
                PriceType.DEPOSIT,
                reservation.getFacility().getId(),
                reservation.getUnitType().getId());
        if (ruleOpt.isEmpty()) {
            return monthlyPrice.multiply(BigDecimal.valueOf(50))
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        PriceRule rule = ruleOpt.get();
        if (rule.getCalculationType() == CalculationType.PERCENTAGE && rule.getPercentage() != null) {
            return monthlyPrice.multiply(rule.getPercentage())
                    .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        }
        if (rule.getAmount() != null) {
            return rule.getAmount().setScale(2, RoundingMode.HALF_UP);
        }
        return monthlyPrice.multiply(BigDecimal.valueOf(50))
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    private Optional<PriceRule> findRuleGracefully(PriceType type, Long facilityId, Integer unitTypeId) {
        LocalDate today = LocalDate.now();
        List<PriceRule> rules = priceRuleRepository.findEffective(type, facilityId, unitTypeId, today);
        if (rules.isEmpty() && unitTypeId != null) {
            rules = priceRuleRepository.findEffective(type, facilityId, null, today);
        }
        if (rules.isEmpty() && facilityId != null) {
            rules = priceRuleRepository.findEffective(type, null, null, today);
        }
        return rules.isEmpty() ? Optional.empty() : Optional.of(rules.get(0));
    }

    private RentalContractResponse toResponse(RentalContract contract) {
        StorageUnit unit = contract.getStorageUnit();
        Facility facility = unit != null ? unit.getFacility() : contract.getReservation().getFacility();
        UnitType unitType = unit != null ? unit.getUnitType() : contract.getReservation().getUnitType();
        boolean isOverdue = contract.getStatus() == ContractStatus.OVERDUE
                || (contract.getStatus() == ContractStatus.ACTIVE
                && contract.getEndDate() != null
                && contract.getEndDate().isBefore(LocalDate.now()));

        com.example.storage_api.entity.ContractTermination term = terminationRepository
                .findFirstByRentalContract_IdOrderByRequestedAtDesc(contract.getId()).orElse(null);
        return RentalContractResponse.builder()
                .id(contract.getId())
                .signedScanUrl(contract.getSignedScanUrl())
                .signedScanStatus(contract.getSignedScanStatus())
                .signedScanUploader(contract.getSignedScanUploader())
                .signedScanUploadedAt(contract.getSignedScanUploadedAt())
                .signedScanNote(contract.getSignedScanNote())
                .profileStatus(contractProfileRepository.findByReservation_Id(contract.getReservation().getId())
                        .map(p -> p.getStatus().name()).orElse(null))
                .terminationId(term != null ? term.getId() : null)
                .terminationStatus(term != null ? term.getStatus().name() : null)
                .reservationId(contract.getReservation().getId())
                .customerId(contract.getCustomer().getId())
                .customerName(contract.getCustomer().getFullname())
                .facilityId(facility != null ? facility.getId() : null)
                .facilityName(facility != null ? facility.getName() : null)
                .unitTypeId(unitType != null ? unitType.getId() : null)
                .unitTypeName(unitType != null ? unitType.getTypeName() : null)
                .storageUnitId(unit != null ? unit.getId() : null)
                .unitCode(unit != null ? unit.getUnitCode() : null)
                .unitFloor(unit != null ? unit.getFloor() : null)
                .unitLocation(unit != null ? unit.getLocation() : null)
                .signedBeforeAssign(contract.getSignedBeforeAssign())
                .startDate(contract.getStartDate())
                .endDate(contract.getEndDate())
                .monthlyPrice(contract.getMonthlyPrice())
                .depositAmount(contract.getDepositAmount())
                .status(contract.getStatus())
                .overdue(isOverdue)
                .signedAt(contract.getSignedAt())
                .signerName(contract.getSignerName())
                .signedAtCounter(Boolean.TRUE.equals(contract.getSignedAtCounter()))
                .signatureUrl(contract.getSignatureUrl())
                .createdAt(contract.getCreatedAt())
                .updatedAt(contract.getUpdatedAt())
                .build();
    }
}
