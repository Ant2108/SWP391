package com.example.storage_api.reponsitory;

import com.example.storage_api.entity.Facility;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repository = "cửa" duy nhất để Service nói chuyện với bảng facilities.
 *
 * Ta chỉ viết interface, KHÔNG viết code bên trong. Spring Data JPA tự tạo class thật lúc chạy và có sẵn:
 * findAll(), findById(id), save(entity), deleteById(id), count()... (JpaRepository<Entity, kiểu của Id>).
 */
@Repository
public interface FacilityRepository extends JpaRepository<Facility, Long> {

    // Spring đọc TÊN method để tự sinh SQL:
    //   findFirst + By + Name  =>  SELECT TOP 1 ... FROM facilities WHERE facility_name = ?
    // Optional: có thể rỗng nếu không tìm thấy (tránh NullPointerException).
    // Dùng bởi DataSeeder: tên Facility là "natural key" để biết Facility mẫu đã tồn tại chưa.
    Optional<Facility> findFirstByName(String name);
}
