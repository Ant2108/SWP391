package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.BusinessPolicy;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface BusinessPolicyRepository extends JpaRepository<BusinessPolicy, Integer> {
}
