package com.example.storage_api.service;

import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.exception.AppException;
import com.example.storage_api.reponsitory.UsersRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * Facility-level authorization service.
 *
 * Usage in controllers:
 * <pre>
 *   @PreAuthorize("@facilityAuthorizationService.canAccessFacility(#facilityId)")
 *   public ResponseEntity<?> getStorageUnits(@PathVariable Long facilityId) { ... }
 * </pre>
 *
 * Rules:
 *  - SYSTEM_ADMIN  → can access all facilities.
 *  - FACILITY_STAFF / FACILITY_MANAGER → can only access their own facility.
 *    (The Users entity stores a facilityId when the project adds that field;
 *     until then this service uses the current user's email to load the Users entity.)
 *
 * NOTE: The current Users entity does NOT have a facilityId column yet.
 * When the facility-assignment feature is implemented, add a facilityId field to
 * Users and update canAccessFacility() accordingly.
 */
@Service("facilityAuthorizationService")
@RequiredArgsConstructor
public class FacilityAuthorizationService {

    private final UsersRepository usersRepository;

    /**
     * Returns true if the currently authenticated user is allowed to access
     * the resource that belongs to {@code requestedFacilityId}.
     *
     * SYSTEM_ADMIN always returns true.
     * FACILITY_STAFF and FACILITY_MANAGER are allowed only when their own
     * facilityId matches the requested one.
     *
     * @param requestedFacilityId the facility being accessed
     * @return true if access is allowed
     */
    public boolean canAccessFacility(Long requestedFacilityId) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return false;
        }

        String email = auth.getName();
        Users user = usersRepository.findByEmail(email)
                .orElseThrow(() -> new AppException(HttpStatus.NOT_FOUND, "User not found"));

        // System admins bypass facility-level restrictions
        if (user.getRole() == Role.SYSTEM_ADMIN) {
            return true;
        }

        // Only facility staff/manager roles are subject to facility-level restriction
        if (user.getRole() == Role.FACILITY_STAFF || user.getRole() == Role.FACILITY_MANAGER) {
            return user.getFacility() != null && requestedFacilityId.equals(user.getFacility().getId());
        }

        // Other roles (CUSTOMER, BUSINESS_MANAGER) are not expected to access facility APIs
        return false;
    }

    /**
     * Convenience method: throws 403 AppException if the user cannot access the facility.
     */
    public void assertCanAccessFacility(Long facilityId) {
        if (!canAccessFacility(facilityId)) {
            throw new AppException(
                    HttpStatus.FORBIDDEN,
                    "You do not have access to facility " + facilityId
            );
        }
    }
}
