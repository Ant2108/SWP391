package com.example.storage_api.service;

import com.example.storage_api.entity.Appointment;
import com.example.storage_api.entity.AppointmentStatus;
import com.example.storage_api.entity.AppointmentType;
import com.example.storage_api.entity.ContractStatus;
import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import com.example.storage_api.entity.RentalContract;
import com.example.storage_api.entity.Reservation;
import com.example.storage_api.entity.ReservationStatus;
import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.StorageUnit;
import com.example.storage_api.entity.UnitStatus;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ConflictException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.model.reponse.AppointmentResponse;
import com.example.storage_api.model.reponse.BookingOptionsResponse;
import com.example.storage_api.model.reponse.StaffOptionResponse;
import com.example.storage_api.model.request.AppointmentCompleteRequest;
import com.example.storage_api.model.request.AppointmentCreateRequest;
import com.example.storage_api.model.request.AppointmentRescheduleRequest;
import com.example.storage_api.model.request.NoShowReportRequest;
import com.example.storage_api.reponsitory.AppointmentRepository;
import com.example.storage_api.reponsitory.PaymentRepository;
import com.example.storage_api.reponsitory.RentalContractRepository;
import com.example.storage_api.reponsitory.ReservationRepository;
import com.example.storage_api.reponsitory.StorageUnitRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * Nghiệp vụ Appointment (lịch hẹn check-in / return / support).
 *
 * Luồng: Customer đặt (SCHEDULED, chưa có staff) -> Facility Manager gán staff -> Staff hoàn tất.
 * Check-in hoàn tất sẽ kích hoạt cả chuỗi: Appointment COMPLETED, Reservation COMPLETED,
 * RentalContract PENDING -> ACTIVE, StorageUnit -> OCCUPIED (trong cùng một transaction).
 * Khách không đến: staff chỉ BÁO (không đổi status), manager quyết định đổi lịch / hủy / NO_SHOW.
 */
@Service
@RequiredArgsConstructor
public class AppointmentService {

    /** Tiền tố Notes đánh dấu lịch đã được staff báo khách vắng, đang chờ manager xử lý. */
    static final String NO_SHOW_MARK = "NO-SHOW REPORT";
    private static final int NOTES_MAX = 500;
    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final String PATH = "/account/appointments";

    private final AppointmentRepository appointmentRepository;
    private final ReservationRepository reservationRepository;
    private final RentalContractRepository rentalContractRepository;
    private final PaymentRepository paymentRepository;
    private final StorageUnitRepository storageUnitRepository;
    private final UsersRepository usersRepository;
    private final CurrentUserService currentUser;
    private final OperationsNotificationService notifier;

    // ===================== TẠO LỊCH =====================

    @Transactional
    public AppointmentResponse create(AppointmentCreateRequest req) {
        Users caller = currentUser.get();
        Users customer = resolveCustomer(caller, req.getCustomerId());
        if (req.getScheduledAt().isBefore(LocalDateTime.now().minusMinutes(1))) {
            throw new BadRequestException("Scheduled time must not be in the past");
        }

        Appointment a = new Appointment();
        a.setCustomer(customer);
        a.setAppointmentType(req.getAppointmentType());
        a.setScheduledAt(req.getScheduledAt());
        a.setNotes(trimTo(req.getNotes(), NOTES_MAX));

        switch (req.getAppointmentType()) {
            case CHECK_IN -> prepareCheckIn(a, req, customer);
            case RETURN, SUPPORT -> prepareContractAppointment(a, req, customer);
        }
        // Staff/manager chỉ đặt hộ khách trong cơ sở của mình.
        if (caller.getRole() != Role.CUSTOMER) {
            currentUser.assertFacilityAccess(caller, a.getFacility().getId());
        }

        Appointment saved = appointmentRepository.save(a);
        notifier.notifyUser(customer, "Appointment scheduled", "Your appointment is scheduled",
                describe(saved) + "\nA facility manager will assign a staff member to you.", PATH);
        return toResponse(saved);
    }

    private void prepareCheckIn(Appointment a, AppointmentCreateRequest req, Users customer) {
        if (req.getReservationId() == null) {
            throw new BadRequestException("Reservation ID is required for a CHECK_IN appointment");
        }
        Reservation r = reservationRepository.findById(req.getReservationId())
                .orElseThrow(() -> new ResourceNotFoundException("Reservation not found: " + req.getReservationId()));
        if (!r.getCustomer().getId().equals(customer.getId())) {
            throw new ResourceNotFoundException("Reservation not found: " + req.getReservationId());
        }
        assertCheckInReady(r);
        if (appointmentRepository.existsByReservation_IdAndAppointmentTypeAndStatus(
                r.getId(), AppointmentType.CHECK_IN, AppointmentStatus.SCHEDULED)) {
            throw new ConflictException("This reservation already has a scheduled check-in appointment");
        }
        a.setReservation(r);
        a.setFacility(r.getFacility());
        rentalContractRepository.findByReservation_Id(r.getId()).ifPresent(a::setRentalContract);
    }

    private void prepareContractAppointment(Appointment a, AppointmentCreateRequest req, Users customer) {
        if (req.getRentalContractId() == null) {
            throw new BadRequestException("Rental contract ID is required for a RETURN or SUPPORT appointment");
        }
        RentalContract c = rentalContractRepository.findById(req.getRentalContractId())
                .orElseThrow(() -> new ResourceNotFoundException("Rental contract not found: " + req.getRentalContractId()));
        if (!c.getCustomer().getId().equals(customer.getId())) {
            throw new ResourceNotFoundException("Rental contract not found: " + req.getRentalContractId());
        }
        if (c.getStatus() != ContractStatus.ACTIVE && c.getStatus() != ContractStatus.OVERDUE) {
            throw new BadRequestException("Rental contract must be ACTIVE or OVERDUE (current: " + c.getStatus() + ")");
        }
        if (appointmentRepository.existsByRentalContract_IdAndAppointmentTypeAndStatus(
                c.getId(), req.getAppointmentType(), AppointmentStatus.SCHEDULED)) {
            throw new ConflictException("This contract already has a scheduled "
                    + req.getAppointmentType() + " appointment");
        }
        a.setRentalContract(c);
        a.setFacility(c.getStorageUnit().getFacility());
    }

    // Check-in chỉ được đặt/hoàn tất khi: Reservation CONFIRMED, đã gán unit, và cọc đã PAID.
    private void assertCheckInReady(Reservation r) {
        if (r.getStatus() != ReservationStatus.CONFIRMED) {
            throw new BadRequestException("Reservation must be CONFIRMED for check-in (current: " + r.getStatus() + ")");
        }
        if (r.getStorageUnit() == null) {
            throw new BadRequestException("No storage unit has been assigned to this reservation yet");
        }
        if (!paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID)) {
            throw new BadRequestException("The deposit for this reservation has not been paid");
        }
    }

    private Users resolveCustomer(Users caller, Long customerId) {
        if (caller.getRole() == Role.CUSTOMER) {
            return caller;
        }
        if (!currentUser.isStaffOrManager(caller)) {
            throw new AccessDeniedException("You are not allowed to create appointments");
        }
        if (customerId == null) {
            throw new BadRequestException("Customer ID is required when booking on behalf of a customer");
        }
        Users customer = usersRepository.findById(customerId)
                .orElseThrow(() -> new ResourceNotFoundException("Customer not found: " + customerId));
        if (customer.getRole() != Role.CUSTOMER) {
            throw new BadRequestException("User " + customerId + " is not a customer");
        }
        return customer;
    }

    // ===================== XEM / TÌM =====================

    @Transactional(readOnly = true)
    public List<AppointmentResponse> myAppointments() {
        Users caller = currentUser.get();
        return appointmentRepository.findByCustomer_IdOrderByScheduledAtDesc(caller.getId()).stream()
                .map(this::toResponse).toList();
    }

    /** Reservation / hợp đồng mà customer hiện được phép đặt lịch hoặc gửi yêu cầu hỗ trợ. */
    @Transactional(readOnly = true)
    public BookingOptionsResponse bookingOptions() {
        Users caller = currentUser.get();
        List<BookingOptionsResponse.CheckInOption> checkIns = reservationRepository
                .findByCustomer_IdAndStatus(caller.getId(), ReservationStatus.CONFIRMED).stream()
                .filter(r -> r.getStorageUnit() != null)
                .filter(r -> paymentRepository.existsByReservation_IdAndPaymentTypeAndStatus(
                        r.getId(), PaymentType.DEPOSIT, PaymentStatus.PAID))
                .filter(r -> !appointmentRepository.existsByReservation_IdAndAppointmentTypeAndStatus(
                        r.getId(), AppointmentType.CHECK_IN, AppointmentStatus.SCHEDULED))
                .map(r -> new BookingOptionsResponse.CheckInOption(r.getId(), r.getFacility().getId(),
                        r.getFacility().getName(), r.getStorageUnit().getUnitCode(), r.getStartDate()))
                .toList();
        List<BookingOptionsResponse.ContractOption> contracts = rentalContractRepository
                .findByCustomer_IdAndStatusIn(caller.getId(), List.of(ContractStatus.ACTIVE, ContractStatus.OVERDUE)).stream()
                .map(c -> new BookingOptionsResponse.ContractOption(c.getId(),
                        c.getStorageUnit().getFacility().getId(), c.getStorageUnit().getFacility().getName(),
                        c.getStorageUnit().getUnitCode(), c.getEndDate(), c.getStatus()))
                .toList();
        return new BookingOptionsResponse(checkIns, contracts);
    }

    /** Staff ACTIVE của cơ sở mình quản lý (manager dùng để gán lịch hẹn / support request). */
    @Transactional(readOnly = true)
    public List<StaffOptionResponse> facilityStaff() {
        Users caller = currentUser.get();
        Long facilityId = currentUser.requireFacilityId(caller);
        return usersRepository.findByRoleAndFacility_IdAndStatus(Role.FACILITY_STAFF, facilityId, Status.ACTIVE).stream()
                .map(u -> new StaffOptionResponse(u.getId(), u.getFullname()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AppointmentResponse> list(Long facilityId, AppointmentType type, AppointmentStatus status,
                                          Long staffId, LocalDate date, boolean noShowOnly) {
        Users caller = currentUser.get();
        return query(scopeFacility(caller, facilityId), type, status, staffId, date, noShowOnly);
    }

    /** Việc hôm nay: staff chỉ thấy lịch được gán cho mình; manager/admin thấy cả cơ sở. */
    @Transactional(readOnly = true)
    public List<AppointmentResponse> today() {
        Users caller = currentUser.get();
        Long staffId = caller.getRole() == Role.FACILITY_STAFF ? caller.getId() : null;
        return query(scopeFacility(caller, null), null, null, staffId, LocalDate.now(), false);
    }

    @Transactional(readOnly = true)
    public AppointmentResponse get(Integer id) {
        Users caller = currentUser.get();
        Appointment a = findOrThrow(id);
        assertCanView(caller, a);
        return toResponse(a);
    }

    private List<AppointmentResponse> query(Long facilityId, AppointmentType type, AppointmentStatus status,
                                            Long staffId, LocalDate date, boolean noShowOnly) {
        LocalDateTime from = date != null ? date.atStartOfDay() : LocalDateTime.of(1970, 1, 1, 0, 0);
        LocalDateTime to = date != null ? date.plusDays(1).atStartOfDay() : LocalDateTime.of(2999, 1, 1, 0, 0);
        return appointmentRepository.search(facilityId, type, status, staffId, from, to, noShowOnly).stream()
                .map(this::toResponse).toList();
    }

    // Admin lọc theo facility tuỳ ý; staff/manager luôn bị khoá vào cơ sở của mình.
    private Long scopeFacility(Users caller, Long requestedFacilityId) {
        if (caller.getRole() == Role.SYSTEM_ADMIN) {
            return requestedFacilityId;
        }
        Long own = currentUser.requireFacilityId(caller);
        if (requestedFacilityId != null && !requestedFacilityId.equals(own)) {
            throw new AccessDeniedException("You do not have access to facility " + requestedFacilityId);
        }
        return own;
    }

    private void assertCanView(Users caller, Appointment a) {
        switch (caller.getRole()) {
            case CUSTOMER -> {
                if (!a.getCustomer().getId().equals(caller.getId())) {
                    throw new ResourceNotFoundException("Appointment not found: " + a.getId());
                }
            }
            case SYSTEM_ADMIN, FACILITY_STAFF, FACILITY_MANAGER ->
                    currentUser.assertFacilityAccess(caller, a.getFacility().getId());
            default -> throw new AccessDeniedException("You do not have permission to view this appointment");
        }
    }

    // ===================== MANAGER: GÁN STAFF, ĐỔI LỊCH, NO-SHOW =====================

    @Transactional
    public AppointmentResponse assign(Integer id, Long staffId) {
        Users caller = currentUser.get();
        Appointment a = findOrThrow(id);
        currentUser.assertManagerOfFacility(caller, a.getFacility().getId());
        requireScheduled(a);

        Users staff = usersRepository.findById(staffId)
                .orElseThrow(() -> new ResourceNotFoundException("Staff not found: " + staffId));
        currentUser.assertAssignableStaff(staff, a.getFacility().getId());
        a.setStaff(staff);
        Appointment saved = appointmentRepository.save(a);

        notifier.notifyUser(a.getCustomer(), "Staff assigned to your appointment", "A staff member is assigned",
                describe(saved) + "\nYour staff member: " + staff.getFullname(), PATH);
        notifier.notifyUser(staff, "New appointment assigned", "You have a new appointment",
                describe(saved) + "\nCustomer: " + a.getCustomer().getFullname(), null);
        return toResponse(saved);
    }

    @Transactional
    public AppointmentResponse reschedule(Integer id, AppointmentRescheduleRequest req) {
        Users caller = currentUser.get();
        Appointment a = findOrThrow(id);
        currentUser.assertManagerOfFacility(caller, a.getFacility().getId());
        requireScheduled(a);
        if (req.getScheduledAt().isBefore(LocalDateTime.now().minusMinutes(1))) {
            throw new BadRequestException("Scheduled time must not be in the past");
        }
        // Đổi lịch xong thì cảnh báo no-show (nếu có) coi như đã được xử lý.
        if (isNoShowReported(a)) {
            a.setNotes(trimTo("Rescheduled after no-show report (was " + a.getScheduledAt().format(FMT)
                    + "). Previous: " + a.getNotes(), NOTES_MAX));
        }
        a.setScheduledAt(req.getScheduledAt());
        Appointment saved = appointmentRepository.save(a);
        notifier.notifyUser(a.getCustomer(), "Appointment rescheduled", "Your appointment was rescheduled",
                describe(saved), PATH);
        return toResponse(saved);
    }

    @Transactional
    public AppointmentResponse markNoShow(Integer id) {
        Users caller = currentUser.get();
        Appointment a = findOrThrow(id);
        currentUser.assertManagerOfFacility(caller, a.getFacility().getId());
        requireScheduled(a);
        a.setStatus(AppointmentStatus.NO_SHOW);
        Appointment saved = appointmentRepository.save(a);
        notifier.notifyUser(a.getCustomer(), "Missed appointment", "We missed you",
                describe(saved) + "\nThis appointment was marked as a no-show. Please book a new one.", PATH);
        return toResponse(saved);
    }

    /** Customer hủy lịch của mình, hoặc manager hủy lịch trong cơ sở; chỉ khi còn SCHEDULED. */
    @Transactional
    public AppointmentResponse cancel(Integer id) {
        Users caller = currentUser.get();
        Appointment a = findOrThrow(id);
        boolean byCustomer = caller.getRole() == Role.CUSTOMER;
        if (byCustomer) {
            if (!a.getCustomer().getId().equals(caller.getId())) {
                throw new ResourceNotFoundException("Appointment not found: " + id);
            }
        } else {
            currentUser.assertManagerOfFacility(caller, a.getFacility().getId());
        }
        requireScheduled(a);
        a.setStatus(AppointmentStatus.CANCELLED);
        Appointment saved = appointmentRepository.save(a);
        if (!byCustomer) {
            notifier.notifyUser(a.getCustomer(), "Appointment cancelled", "Your appointment was cancelled",
                    describe(saved), PATH);
        }
        return toResponse(saved);
    }

    // ===================== STAFF: HOÀN TẤT / BÁO NO-SHOW =====================

    /**
     * Hoàn tất lịch. CHECK_IN: bàn giao chìa khóa và kích hoạt hợp đồng. SUPPORT: chỉ đóng lịch.
     * RETURN: không dùng endpoint này, trả kho đi qua POST /api/unit-returns.
     */
    @Transactional
    public AppointmentResponse complete(Integer id, AppointmentCompleteRequest req) {
        Users caller = currentUser.get();
        Appointment a = findOrThrow(id);
        assertCanOperate(caller, a);
        requireScheduled(a);

        switch (a.getAppointmentType()) {
            case CHECK_IN -> completeCheckIn(a, req);
            case SUPPORT -> { }
            case RETURN -> throw new BadRequestException(
                    "Return appointments are completed by submitting the unit inspection (POST /api/unit-returns)");
        }
        a.setStatus(AppointmentStatus.COMPLETED);
        String extra = trimTo(req.getNotes(), 300);
        if (extra != null) {
            a.setNotes(appendNote(a.getNotes(), extra));
        }
        Appointment saved = appointmentRepository.save(a);

        if (a.getAppointmentType() == AppointmentType.CHECK_IN) {
            notifier.notifyUser(a.getCustomer(), "Check-in completed", "Welcome to your storage unit",
                    "Your check-in at " + a.getFacility().getName() + " is complete. "
                            + "Unit " + a.getReservation().getStorageUnit().getUnitCode()
                            + " is now active and the key has been handed over to you.", "/account/units");
        }
        return toResponse(saved);
    }

    private void completeCheckIn(Appointment a, AppointmentCompleteRequest req) {
        if (!Boolean.TRUE.equals(req.getKeyHandedOver())) {
            throw new BadRequestException("Please confirm that you handed the key to the customer");
        }
        Reservation r = a.getReservation();
        if (r == null) {
            throw new BadRequestException("This check-in appointment has no reservation");
        }
        assertCheckInReady(r);

        RentalContract c = a.getRentalContract() != null
                ? a.getRentalContract()
                : rentalContractRepository.findByReservation_Id(r.getId())
                        .orElseThrow(() -> new BadRequestException("No rental contract exists for this reservation yet"));
        if (c.getStatus() != ContractStatus.PENDING) {
            throw new BadRequestException("Rental contract must be PENDING to be activated (current: " + c.getStatus() + ")");
        }
        StorageUnit unit = r.getStorageUnit();
        if (!c.getStorageUnit().getId().equals(unit.getId())) {
            throw new BadRequestException("The contract unit does not match the unit assigned to the reservation");
        }
        if (unit.getStatus() != UnitStatus.RESERVED && unit.getStatus() != UnitStatus.AVAILABLE) {
            throw new BadRequestException("Storage unit " + unit.getUnitCode()
                    + " is not ready for handover (status: " + unit.getStatus() + ")");
        }

        r.setStatus(ReservationStatus.COMPLETED);
        c.setStatus(ContractStatus.ACTIVE);
        unit.setStatus(UnitStatus.OCCUPIED);
        reservationRepository.save(r);
        rentalContractRepository.save(c);
        storageUnitRepository.save(unit);
        a.setRentalContract(c);
        a.setNotes(appendNote(a.getNotes(), "Key handed over."));
    }

    /**
     * Staff báo khách không đến: chỉ ghi báo cáo vào Notes (không đổi status) và báo manager của cơ sở.
     * Manager hỏi lại khách rồi quyết định đổi lịch / hủy / đánh NO_SHOW.
     */
    @Transactional
    public AppointmentResponse reportNoShow(Integer id, NoShowReportRequest req) {
        Users caller = currentUser.get();
        Appointment a = findOrThrow(id);
        if (caller.getRole() != Role.FACILITY_STAFF) {
            throw new AccessDeniedException("Only facility staff can report a no-show");
        }
        assertCanOperate(caller, a);
        requireScheduled(a);

        String report = NO_SHOW_MARK + " (" + LocalDateTime.now().format(FMT) + " by " + caller.getFullname()
                + "): " + req.getNote().trim();
        a.setNotes(trimTo(a.getNotes() == null ? report : report + " | " + a.getNotes(), NOTES_MAX));
        Appointment saved = appointmentRepository.save(a);

        usersRepository.findByRoleAndFacility_IdAndStatus(Role.FACILITY_MANAGER, a.getFacility().getId(), Status.ACTIVE)
                .forEach(m -> notifier.notifyUser(m, "Customer did not show up", "No-show reported",
                        describe(saved) + "\nCustomer: " + a.getCustomer().getFullname()
                                + "\nStaff note: " + req.getNote().trim()
                                + "\nPlease contact the customer to reschedule, cancel or mark it as a no-show.", null));
        return toResponse(saved);
    }

    // Staff chỉ thao tác lịch được gán cho mình; manager thao tác mọi lịch của cơ sở.
    private void assertCanOperate(Users caller, Appointment a) {
        if (caller.getRole() == Role.FACILITY_STAFF) {
            currentUser.assertFacilityAccess(caller, a.getFacility().getId());
            if (a.getStaff() == null || !a.getStaff().getId().equals(caller.getId())) {
                throw new AccessDeniedException("This appointment is not assigned to you");
            }
        } else {
            currentUser.assertManagerOfFacility(caller, a.getFacility().getId());
        }
    }

    // ===================== HELPER =====================

    private Appointment findOrThrow(Integer id) {
        return appointmentRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Appointment not found: " + id));
    }

    private void requireScheduled(Appointment a) {
        if (a.getStatus() != AppointmentStatus.SCHEDULED) {
            throw new BadRequestException("Appointment is " + a.getStatus() + "; only SCHEDULED appointments can be changed");
        }
    }

    private boolean isNoShowReported(Appointment a) {
        return a.getNotes() != null && a.getNotes().startsWith(NO_SHOW_MARK);
    }

    private String describe(Appointment a) {
        return a.getAppointmentType() + " appointment at " + a.getFacility().getName()
                + " on " + a.getScheduledAt().format(FMT) + ".";
    }

    private static String appendNote(String existing, String extra) {
        return trimTo(existing == null || existing.isBlank() ? extra : existing + " | " + extra, NOTES_MAX);
    }

    private static String trimTo(String s, int max) {
        if (s == null || s.isBlank()) {
            return null;
        }
        String t = s.trim();
        return t.length() > max ? t.substring(0, max) : t;
    }

    private AppointmentResponse toResponse(Appointment a) {
        StorageUnit unit = a.getRentalContract() != null ? a.getRentalContract().getStorageUnit()
                : a.getReservation() != null ? a.getReservation().getStorageUnit() : null;
        return AppointmentResponse.builder()
                .id(a.getId())
                .appointmentType(a.getAppointmentType())
                .status(a.getStatus())
                .scheduledAt(a.getScheduledAt())
                .notes(a.getNotes())
                .noShowReported(isNoShowReported(a) && a.getStatus() == AppointmentStatus.SCHEDULED)
                .customerId(a.getCustomer().getId())
                .customerName(a.getCustomer().getFullname())
                .customerPhone(a.getCustomer().getPhone())
                .facilityId(a.getFacility().getId())
                .facilityName(a.getFacility().getName())
                .reservationId(a.getReservation() != null ? a.getReservation().getId() : null)
                .rentalContractId(a.getRentalContract() != null ? a.getRentalContract().getId() : null)
                .storageUnitId(unit != null ? unit.getId() : null)
                .unitCode(unit != null ? unit.getUnitCode() : null)
                .staffId(a.getStaff() != null ? a.getStaff().getId() : null)
                .staffName(a.getStaff() != null ? a.getStaff().getFullname() : null)
                .createdAt(a.getCreatedAt())
                .updatedAt(a.getUpdatedAt())
                .build();
    }
}
