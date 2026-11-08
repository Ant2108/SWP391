package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.UnitReturn;
import com.example.storage_api.entity.DamageStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UnitReturnRepository extends JpaRepository<UnitReturn, Integer> {

    // Một hợp đồng chỉ được trả một lần.
    boolean existsByRentalContract_Id(Integer contractId);

    // Danh sách biên bản có hư hại của một cơ sở (null = không lọc), mới nhất trước.
    @Query("""
            select ur from UnitReturn ur
            join fetch ur.rentalContract c
            join fetch c.storageUnit u
            join fetch u.facility f
            where ur.hasDamage = true
              and (:facilityId is null or f.id = :facilityId)
              and (:damageStatus is null or ur.damageStatus = :damageStatus)
            order by ur.returnedAt desc
            """)
    List<UnitReturn> searchDamage(@Param("facilityId") Long facilityId, @Param("damageStatus") DamageStatus damageStatus);
}
