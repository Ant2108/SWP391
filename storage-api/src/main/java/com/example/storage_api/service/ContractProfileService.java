package com.example.storage_api.service;

import com.example.storage_api.entity.*;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.ContractProfileResponse;
import com.example.storage_api.model.request.ContractProfileRejectRequest;
import com.example.storage_api.model.request.ContractProfileRequest;
import com.example.storage_api.reponsitory.*;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Hồ sơ thông tin hợp đồng của khách: khách (hoặc nhân viên điền hộ tại quầy) điền thông tin định danh và ảnh CCCD,
 * quản lý kiểm tra và duyệt / từ chối. Từ chối lần 2 báo cho quản lý và staff để lưu ý; từ lần 3 bắt buộc ký tại quầy.
 */
@Service
@RequiredArgsConstructor
public class ContractProfileService {
    private static final Pattern PHONE = Pattern.compile("^(0|\\+84)[0-9]{9,10}$");
    private static final Pattern NATIONAL_ID = Pattern.compile("^([0-9]{9}|[0-9]{12})$");
    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    public static final Set<String> REASONS = Set.of(
            "ID_BLURRY", "ID_MISMATCH", "INFO_MISMATCH", "SIGNATURE_INVALID", "ADDRESS_UNCLEAR", "OTHER");

    private final ContractProfileRepository profileRepository;
    private final ReservationRepository reservationRepository;
    private final RentalContractRepository contractRepository;
    private final PaymentRepository paymentRepository;
    private final AppointmentRepository appointmentRepository;
    private final CurrentUserService currentUserService;
    private final FileStorageService fileStorageService;
    private final OperationsNotificationService notifier;

    // ---------- Quyền ----------
    private Reservation findReservation(Integer reservationId) {
        return reservationRepository.findById(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy đơn đặt kho: " + reservationId));
    }

    /** Khách chủ đơn, staff được gán, manager cơ sở, business manager và admin được xem hồ sơ. */
    private void assertCanView(Users u, Reservation r) {
        switch (u.getRole()) {
            case CUSTOMER -> {
                if (!r.getCustomer().getId().equals(u.getId())) {
                    throw new AccessDeniedException("Đơn đặt kho này không phải của bạn");
                }
            }
            case FACILITY_STAFF -> {
                currentUserService.assertFacilityAccess(u, r.getFacility().getId());
                if (!appointmentRepository.existsByReservation_IdAndStaff_Id(r.getId(), u.getId())) {
                    throw new AccessDeniedException("Khách này không được gán cho bạn");
                }
            }
            case FACILITY_MANAGER -> currentUserService.assertFacilityAccess(u, r.getFacility().getId());
            default -> { /* BUSINESS_MANAGER, SYSTEM_ADMIN */ }
        }
    }

    private boolean isReviewer(Users u) {
        return u.getRole() == Role.FACILITY_MANAGER || u.getRole() == Role.BUSINESS_MANAGER || u.getRole() == Role.SYSTEM_ADMIN;
    }

    // ---------- Xem ----------
    @Transactional(readOnly = true)
    public ContractProfileResponse get(Integer reservationId) {
        Users u = currentUserService.get();
        Reservation r = findReservation(reservationId);
        assertCanView(u, r);
        return profileRepository.findByReservation_Id(reservationId).map(this::toResponse).orElse(null);
    }

    /** Hồ sơ bị từ chối của khách đang đăng nhập (để hiện thông báo giữa màn hình). */
    @Transactional(readOnly = true)
    public List<ContractProfileResponse> myRejected() {
        Users u = currentUserService.get();
        return profileRepository.findByCustomer_IdAndStatus(u.getId(), ProfileStatus.REJECTED).stream()
                .filter(p -> p.getReservation().getStatus() != ReservationStatus.CANCELLED)
                .map(this::toResponse).toList();
    }

    /** Hồ sơ đã gửi, chờ quản lý kiểm tra (của cơ sở mình). */
    @Transactional(readOnly = true)
    public List<ContractProfileResponse> pendingReview() {
        Users u = currentUserService.get();
        if (!isReviewer(u)) {
            throw new AccessDeniedException("Chỉ quản lý mới xem danh sách hồ sơ chờ duyệt");
        }
        return profileRepository.findByStatusOrderBySubmittedAtAsc(ProfileStatus.SUBMITTED).stream()
                .filter(p -> u.getRole() != Role.FACILITY_MANAGER
                        || u.getFacility() != null && u.getFacility().getId().equals(p.getReservation().getFacility().getId()))
                .map(this::toResponse).toList();
    }

    // ---------- Điền hồ sơ ----------
    private ContractProfile getOrCreate(Reservation r) {
        return profileRepository.findByReservation_Id(r.getId()).orElseGet(() -> {
            ContractProfile p = new ContractProfile();
            p.setReservation(r);
            p.setCustomer(r.getCustomer());
            return p;
        });
    }

    private void assertCanFill(Users u, Reservation r) {
        if (u.getRole() == Role.CUSTOMER) {
            if (!r.getCustomer().getId().equals(u.getId())) {
                throw new AccessDeniedException("Đơn đặt kho này không phải của bạn");
            }
        } else if (u.getRole() == Role.FACILITY_STAFF || u.getRole() == Role.FACILITY_MANAGER) {
            assertCanView(u, r);
        } else {
            throw new AccessDeniedException("Bạn không có quyền điền hồ sơ này");
        }
        if (r.getStatus() == ReservationStatus.CANCELLED) {
            throw new ConflictException("Đơn đặt kho đã hủy");
        }
        boolean deposited = paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID);
        if (!deposited) {
            throw new ConflictException("Quý khách cần đóng cọc Đợt 1 trước khi điền hồ sơ hợp đồng.");
        }
    }

    private void assertEditable(ContractProfile p) {
        if (p.getStatus() == ProfileStatus.APPROVED) {
            throw new ConflictException("Hồ sơ đã được duyệt, không thể chỉnh sửa.");
        }
    }

    /** Tải ảnh CCCD mặt trước hoặc mặt sau (lưu riêng tư). side = front | back. */
    @Transactional
    public ContractProfileResponse uploadIdImage(Integer reservationId, String side, MultipartFile file) {
        Users u = currentUserService.get();
        Reservation r = findReservation(reservationId);
        assertCanFill(u, r);
        ContractProfile p = getOrCreate(r);
        assertEditable(p);
        String name = fileStorageService.storePrivateImage(file);
        if ("front".equalsIgnoreCase(side)) {
            p.setIdFrontFile(name);
        } else if ("back".equalsIgnoreCase(side)) {
            p.setIdBackFile(name);
        } else {
            throw new BadRequestException("side phải là front hoặc back");
        }
        return toResponse(profileRepository.save(p));
    }

    /** Lưu nháp: ghi lại những gì khách đã điền (không kiểm tra), để lần sau mở lại không phải điền lại. */
    @Transactional
    public ContractProfileResponse saveDraft(Integer reservationId, com.example.storage_api.model.request.ContractProfileDraftRequest q) {
        Users u = currentUserService.get();
        Reservation r = findReservation(reservationId);
        assertCanFill(u, r);
        ContractProfile p = getOrCreate(r);
        assertEditable(p);
        p.setFullName(cut(q.getFullName(), 150));
        p.setDateOfBirth(q.getDateOfBirth());
        p.setGender(cut(q.getGender(), 20));
        p.setNationality(cut(q.getNationality(), 60));
        p.setNationalId(cut(q.getNationalId(), 20));
        p.setIdIssueDate(q.getIdIssueDate());
        p.setIdIssuePlace(cut(q.getIdIssuePlace(), 150));
        p.setPermanentAddress(cut(q.getPermanentAddress(), 300));
        p.setContactAddress(cut(q.getContactAddress(), 300));
        p.setPhone(cut(q.getPhone(), 20));
        p.setEmail(cut(q.getEmail(), 150));
        p.setOccupation(cut(q.getOccupation(), 150));
        p.setGoodsDescription(cut(q.getGoodsDescription(), 500));
        p.setEmergencyName(cut(q.getEmergencyName(), 150));
        p.setEmergencyPhone(cut(q.getEmergencyPhone(), 20));
        // Giữ nguyên trạng thái hiện tại (đã gửi / bị từ chối); hồ sơ mới vẫn là bản nháp.
        return toResponse(profileRepository.save(p));
    }

    private static String cut(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String v = s.trim();
        return v.length() > max ? v.substring(0, max) : v;
    }

    /** Gửi hồ sơ: kiểm tra đầy đủ, hợp lệ rồi chuyển sang chờ quản lý kiểm tra. */
    @Transactional
    public ContractProfileResponse submit(Integer reservationId, ContractProfileRequest req) {
        Users u = currentUserService.get();
        Reservation r = findReservation(reservationId);
        assertCanFill(u, r);
        ContractProfile p = getOrCreate(r);
        assertEditable(p);
        validate(req);
        if (p.getIdFrontFile() == null || p.getIdBackFile() == null) {
            throw new BadRequestException("Vui lòng tải ảnh CCCD / CMND đủ mặt trước và mặt sau.");
        }
        p.setFullName(req.getFullName().trim());
        p.setDateOfBirth(req.getDateOfBirth());
        p.setGender(req.getGender().trim());
        p.setNationality(req.getNationality() == null || req.getNationality().isBlank() ? "Việt Nam" : req.getNationality().trim());
        p.setNationalId(req.getNationalId().trim());
        p.setIdIssueDate(req.getIdIssueDate());
        p.setIdIssuePlace(req.getIdIssuePlace().trim());
        p.setPermanentAddress(req.getPermanentAddress().trim());
        p.setContactAddress(req.getContactAddress() == null || req.getContactAddress().isBlank()
                ? req.getPermanentAddress().trim() : req.getContactAddress().trim());
        p.setPhone(req.getPhone().trim());
        p.setEmail(req.getEmail().trim());
        p.setOccupation(req.getOccupation() == null ? null : req.getOccupation().trim());
        p.setGoodsDescription(req.getGoodsDescription().trim());
        p.setEmergencyName(req.getEmergencyName().trim());
        p.setEmergencyPhone(req.getEmergencyPhone().trim());
        p.setStatus(ProfileStatus.SUBMITTED);
        p.setSubmittedAt(LocalDateTime.now());
        p.setFilledByStaff(u.getRole() == Role.CUSTOMER ? null : u);
        p.setRejectReasonCodes(null);
        p.setRejectNote(null);
        ContractProfile saved = profileRepository.save(p);

        notifier.notifyFacilityManagers(r.getFacility().getId(), "Contract profile submitted",
                "Có hồ sơ hợp đồng mới cần kiểm tra",
                saved.getFullName() + " đã gửi hồ sơ cho đơn #" + r.getId() + ". Vui lòng kiểm tra thông tin và ảnh CCCD.",
                "/admin/contract-profiles");
        return toResponse(saved);
    }

    private void validate(ContractProfileRequest q) {
        if (!Boolean.TRUE.equals(q.getAgreedTruthful())) {
            throw new BadRequestException("Quý khách cần xác nhận cam kết thông tin khai báo là trung thực.");
        }
        if (!NATIONAL_ID.matcher(q.getNationalId().trim()).matches()) {
            throw new BadRequestException("Số CCCD phải gồm 12 chữ số (hoặc CMND 9 chữ số).");
        }
        if (!PHONE.matcher(q.getPhone().trim()).matches() || !PHONE.matcher(q.getEmergencyPhone().trim()).matches()) {
            throw new BadRequestException("Số điện thoại không hợp lệ (ví dụ 0912345678).");
        }
        if (!EMAIL.matcher(q.getEmail().trim()).matches()) {
            throw new BadRequestException("Email không hợp lệ.");
        }
        LocalDate today = LocalDate.now();
        if (q.getDateOfBirth().isAfter(today.minusYears(18))) {
            throw new BadRequestException("Người ký hợp đồng phải đủ 18 tuổi.");
        }
        if (q.getDateOfBirth().isBefore(today.minusYears(100))) {
            throw new BadRequestException("Ngày sinh không hợp lệ.");
        }
        if (q.getIdIssueDate().isAfter(today) || !q.getIdIssueDate().isAfter(q.getDateOfBirth())) {
            throw new BadRequestException("Ngày cấp giấy tờ không hợp lệ.");
        }
    }

    // ---------- Duyệt / từ chối ----------
    @Transactional
    public ContractProfileResponse approve(Integer reservationId) {
        Users u = currentUserService.get();
        if (!isReviewer(u)) {
            throw new AccessDeniedException("Chỉ quản lý mới được duyệt hồ sơ");
        }
        Reservation r = findReservation(reservationId);
        assertCanView(u, r);
        ContractProfile p = profileRepository.findByReservation_Id(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Chưa có hồ sơ"));
        if (p.getStatus() != ProfileStatus.SUBMITTED) {
            throw new ConflictException("Chỉ duyệt được hồ sơ đang chờ kiểm tra");
        }
        p.setStatus(ProfileStatus.APPROVED);
        p.setReviewedBy(u);
        p.setReviewedAt(LocalDateTime.now());
        notifier.notifyUser(p.getCustomer(), "Contract profile approved", "Hồ sơ hợp đồng đã được duyệt",
                "Hồ sơ hợp đồng của đơn #" + r.getId() + " đã được duyệt. Quý khách vui lòng đến nhận kho đúng lịch hẹn.",
                "/account/contracts");
        return toResponse(profileRepository.save(p));
    }

    /**
     * Từ chối hồ sơ: yêu cầu khách chỉnh và ký lại (chữ ký cũ bị gỡ). Lần thứ 2: báo manager và staff để lưu ý.
     * Lần thứ 3: bắt buộc ký trực tiếp tại quầy khi nhận kho, không ký online nữa.
     */
    @Transactional
    public ContractProfileResponse reject(Integer reservationId, ContractProfileRejectRequest req) {
        Users u = currentUserService.get();
        if (!isReviewer(u)) {
            throw new AccessDeniedException("Chỉ quản lý mới được từ chối hồ sơ");
        }
        Reservation r = findReservation(reservationId);
        assertCanView(u, r);
        ContractProfile p = profileRepository.findByReservation_Id(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Chưa có hồ sơ"));
        if (p.getStatus() != ProfileStatus.SUBMITTED && p.getStatus() != ProfileStatus.APPROVED) {
            throw new ConflictException("Hồ sơ này chưa gửi nên chưa thể từ chối");
        }
        List<String> codes = req == null || req.getReasonCodes() == null ? List.of()
                : req.getReasonCodes().stream().filter(REASONS::contains).toList();
        String note = req == null || req.getNote() == null || req.getNote().isBlank() ? null : req.getNote().trim();
        if (codes.isEmpty() && note == null) {
            throw new BadRequestException("Vui lòng chọn ít nhất một lý do hoặc nhập ghi chú.");
        }
        p.setStatus(ProfileStatus.REJECTED);
        p.setReviewedBy(u);
        p.setReviewedAt(LocalDateTime.now());
        p.setRejectReasonCodes(String.join(",", codes));
        p.setRejectNote(note);
        p.setRejectCount(p.getRejectCount() + 1);
        if (p.getRejectCount() >= 3) {
            p.setSignAtCounterRequired(true);
        }
        // Gỡ chữ ký cũ để khách ký lại (hoặc ký tại quầy).
        contractRepository.findByReservation_Id(reservationId).ifPresent(c -> {
            if (c.getStatus() == ContractStatus.PENDING) {
                c.setSignedAt(null);
                c.setSignerName(null);
                c.setSignatureUrl(null);
                c.setSignedAtCounter(false);
                contractRepository.save(c);
            }
        });

        String link = "/account/contracts";
        if (p.isSignAtCounterRequired()) {
            notifier.notifyUser(p.getCustomer(), "Contract profile rejected", "Hồ sơ hợp đồng chưa được chấp nhận",
                    "Hồ sơ của đơn #" + r.getId() + " đã không đạt " + p.getRejectCount()
                            + " lần. Để đảm bảo chính xác, quý khách vui lòng ký hợp đồng trực tiếp tại quầy khi nhận kho, nhân viên sẽ hỗ trợ.",
                    link);
            notifier.notifyFacilityManagers(r.getFacility().getId(), "Sign at counter required",
                    "Khách phải ký tại quầy", "Đơn #" + r.getId() + " (" + p.getFullName()
                            + ") sai hồ sơ 3 lần, bắt buộc ký trực tiếp khi nhận kho.", "/admin/contract-profiles");
            appointmentRepository.findByCustomer_IdOrderByScheduledAtDesc(p.getCustomer().getId()).stream()
                    .filter(a -> a.getReservation() != null && a.getReservation().getId().equals(r.getId()) && a.getStaff() != null)
                    .forEach(a -> notifier.notifyUser(a.getStaff(), "Sign at counter required", "Khách phải ký tại quầy",
                            "Đơn #" + r.getId() + " (" + p.getFullName() + "): hồ sơ bị từ chối 3 lần, vui lòng hướng dẫn khách ký trực tiếp và kiểm tra giấy tờ kỹ.",
                            "/admin/appointments"));
        } else {
            notifier.notifyUser(p.getCustomer(), "Contract profile rejected", "Hồ sơ hợp đồng chưa được chấp nhận",
                    "Hồ sơ của đơn #" + r.getId() + " cần chỉnh sửa. Vui lòng xem lý do và điền lại, sau đó ký lại hợp đồng.", link);
            if (p.getRejectCount() == 2) {
                notifier.notifyFacilityManagers(r.getFacility().getId(), "Profile rejected twice", "Khách sai hồ sơ lần thứ 2",
                        "Đơn #" + r.getId() + " (" + p.getFullName() + ") đã bị từ chối 2 lần. Lần thứ 3 sẽ bắt buộc ký tại quầy.",
                        "/admin/contract-profiles");
                appointmentRepository.findByCustomer_IdOrderByScheduledAtDesc(p.getCustomer().getId()).stream()
                        .filter(a -> a.getReservation() != null && a.getReservation().getId().equals(r.getId()) && a.getStaff() != null)
                        .forEach(a -> notifier.notifyUser(a.getStaff(), "Profile rejected twice", "Khách sai hồ sơ lần thứ 2",
                                "Đơn #" + r.getId() + " (" + p.getFullName() + ") đã bị từ chối 2 lần, vui lòng lưu ý khi tiếp khách.",
                                "/admin/appointments"));
            }
        }
        return toResponse(profileRepository.save(p));
    }

    // ---------- Ảnh CCCD (riêng tư) ----------
    @Transactional(readOnly = true)
    public Resource idImage(Integer reservationId, String side) {
        Users u = currentUserService.get();
        Reservation r = findReservation(reservationId);
        assertCanView(u, r);
        ContractProfile p = profileRepository.findByReservation_Id(reservationId)
                .orElseThrow(() -> new ResourceNotFoundException("Chưa có hồ sơ"));
        String name = "front".equalsIgnoreCase(side) ? p.getIdFrontFile() : p.getIdBackFile();
        if (name == null) {
            throw new ResourceNotFoundException("Chưa có ảnh");
        }
        return fileStorageService.loadPrivate(name);
    }

    public String idImageName(Integer reservationId, String side) {
        ContractProfile p = profileRepository.findByReservation_Id(reservationId).orElseThrow();
        return "front".equalsIgnoreCase(side) ? p.getIdFrontFile() : p.getIdBackFile();
    }

    private ContractProfileResponse toResponse(ContractProfile p) {
        Reservation r = p.getReservation();
        return ContractProfileResponse.builder()
                .id(p.getId())
                .reservationId(r.getId())
                .customerId(p.getCustomer().getId())
                .customerName(p.getCustomer().getFullname())
                .facilityName(r.getFacility().getName())
                .unitTypeName(r.getUnitType().getTypeName())
                .status(p.getStatus())
                .fullName(p.getFullName()).dateOfBirth(p.getDateOfBirth()).gender(p.getGender())
                .nationality(p.getNationality()).nationalId(p.getNationalId())
                .idIssueDate(p.getIdIssueDate()).idIssuePlace(p.getIdIssuePlace())
                .permanentAddress(p.getPermanentAddress()).contactAddress(p.getContactAddress())
                .phone(p.getPhone()).email(p.getEmail()).occupation(p.getOccupation())
                .goodsDescription(p.getGoodsDescription())
                .emergencyName(p.getEmergencyName()).emergencyPhone(p.getEmergencyPhone())
                .hasIdFront(p.getIdFrontFile() != null).hasIdBack(p.getIdBackFile() != null)
                .submittedAt(p.getSubmittedAt())
                .filledByStaffName(p.getFilledByStaff() == null ? null : p.getFilledByStaff().getFullname())
                .reviewedAt(p.getReviewedAt())
                .reviewedByName(p.getReviewedBy() == null ? null : p.getReviewedBy().getFullname())
                .rejectReasonCodes(p.getRejectReasonCodes() == null || p.getRejectReasonCodes().isBlank()
                        ? List.of() : Arrays.asList(p.getRejectReasonCodes().split(",")))
                .rejectNote(p.getRejectNote())
                .rejectCount(p.getRejectCount())
                .signAtCounterRequired(p.isSignAtCounterRequired())
                .preSignedAt(p.getPreSignedAt())
                .preSignerName(p.getPreSignerName())
                .preSignatureUrl(p.getPreSignatureUrl())
                .preScanUrl(p.getPreScanUrl())
                .preScanStatus(p.getPreScanStatus())
                .preScanUploader(p.getPreScanUploader())
                .preScanNote(p.getPreScanNote())
                .hasContract(contractRepository.findByReservation_Id(r.getId()).isPresent())
                .build();
    }
}
