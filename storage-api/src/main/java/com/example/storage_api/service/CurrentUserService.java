package com.example.storage_api.service;

import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.exceptions.BadRequestException;
import com.example.storage_api.exception.exceptions.ResourceNotFoundException;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * Lấy user đang đăng nhập và kiểm tra quyền theo cơ sở cho module Appointment / Return / Support.
 * Quy tắc: SYSTEM_ADMIN xem được mọi cơ sở; FACILITY_STAFF / FACILITY_MANAGER chỉ làm việc trong
 * cơ sở của mình (Users.facility). Quyền theo role (ai được gọi API nào) đã chặn bằng @PreAuthorize ở controller.
 */
@Service
@RequiredArgsConstructor
public class CurrentUserService {

    private final UsersRepository usersRepository;

    public Users get() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new AccessDeniedException("Chưa đăng nhập");
        }
        return usersRepository.findByEmail(auth.getName())
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy người dùng"));
    }

    public boolean isStaffOrManager(Users u) {
        return u.getRole() == Role.FACILITY_STAFF || u.getRole() == Role.FACILITY_MANAGER;
    }

    /** Id cơ sở của staff/manager; ném 403 nếu chưa được gán cơ sở. */
    public Long requireFacilityId(Users u) {
        if (u.getFacility() == null) {
            throw new AccessDeniedException("Tài khoản của bạn chưa được gán cơ sở");
        }
        return u.getFacility().getId();
    }

    /** SYSTEM_ADMIN luôn được; staff/manager chỉ khi đúng cơ sở của mình. */
    public boolean canAccessFacility(Users u, Long facilityId) {
        if (u.getRole() == Role.SYSTEM_ADMIN) {
            return true;
        }
        return isStaffOrManager(u) && u.getFacility() != null && u.getFacility().getId().equals(facilityId);
    }

    public void assertFacilityAccess(Users u, Long facilityId) {
        if (!canAccessFacility(u, facilityId)) {
            throw new AccessDeniedException("Bạn không có quyền truy cập cơ sở " + facilityId);
        }
    }

    /** Staff được gán việc phải đúng role, đang ACTIVE và thuộc cùng cơ sở với việc đó. */
    public void assertAssignableStaff(Users staff, Long facilityId) {
        if (staff.getRole() != Role.FACILITY_STAFF) {
            throw new BadRequestException("Người dùng " + staff.getId() + " không phải nhân viên cơ sở");
        }
        if (staff.getStatus() != Status.ACTIVE) {
            throw new BadRequestException("Nhân viên " + staff.getId() + " đang bị khóa");
        }
        if (staff.getFacility() == null || !staff.getFacility().getId().equals(facilityId)) {
            throw new BadRequestException("Nhân viên " + staff.getId() + " không làm việc tại cơ sở " + facilityId);
        }
    }

    /** Thao tác của Facility Manager phải đúng cơ sở của manager đó. */
    public void assertManagerOfFacility(Users u, Long facilityId) {
        if (u.getRole() != Role.FACILITY_MANAGER || !canAccessFacility(u, facilityId)) {
            throw new AccessDeniedException("Chỉ quản lý của cơ sở " + facilityId + " mới thực hiện được thao tác này");
        }
    }
}
