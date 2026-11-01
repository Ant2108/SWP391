package com.example.storage_api.service;

import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.AppException;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * Kiểm tra người dùng hiện tại có được thao tác trên một cơ sở (Facility) hay không.
 *
 *  - SYSTEM_ADMIN, BUSINESS_MANAGER: mọi cơ sở.
 *  - FACILITY_MANAGER, FACILITY_STAFF: chỉ cơ sở được phân công (Users.facility).
 *  - Role khác (CUSTOMER): không có quyền ghi trên cơ sở nào.
 *
 * Controller chỉ kiểm tra VAI TRÒ (@PreAuthorize); việc "đúng cơ sở của mình" phải kiểm tra ở Service
 * bằng assertCanAccessFacility, nếu không Facility Manager của cơ sở này sửa được dữ liệu cơ sở khác.
 */
@Service("facilityAuthorizationService")
@RequiredArgsConstructor
public class FacilityAuthorizationService {

    private final UsersRepository usersRepository;

    /** Người dùng đang đăng nhập (đọc từ SecurityContext rồi tra DB theo email). */
    public Users currentUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            throw new AppException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }
        return usersRepository.findByEmail(auth.getName())
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "User not found"));
    }

    public boolean canAccessFacility(Long requestedFacilityId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return false;
        }

        Users user = currentUser();

        // System admin và Business manager quản lý mọi cơ sở
        if (user.getRole() == Role.SYSTEM_ADMIN || user.getRole() == Role.BUSINESS_MANAGER) {
            return true;
        }

        // Facility staff / manager chỉ được thao tác trên cơ sở được phân công
        if (user.getRole() == Role.FACILITY_STAFF || user.getRole() == Role.FACILITY_MANAGER) {
            return requestedFacilityId != null
                    && user.getFacility() != null
                    && requestedFacilityId.equals(user.getFacility().getId());
        }

        // Role khác (CUSTOMER) không có quyền ghi
        return false;
    }

    /** Ném 403 nếu người dùng hiện tại không được thao tác trên cơ sở này. */
    public void assertCanAccessFacility(Long facilityId) {
        if (!canAccessFacility(facilityId)) {
            throw new AppException(
                    HttpStatus.FORBIDDEN,
                    "You do not have access to facility " + facilityId
            );
        }
    }
}
