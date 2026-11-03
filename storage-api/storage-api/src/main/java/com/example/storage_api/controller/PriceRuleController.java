package com.example.storage_api.controller;

import com.example.storage_api.entity.PriceType;
import com.example.storage_api.model.reponse.PriceRuleResponse;
import com.example.storage_api.model.request.PriceRuleRequest;
import com.example.storage_api.service.PriceRuleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * API cho PriceRule (quy tắc giá).
 * /api/price-rules/current và /api/price-rules/history match ĐÚNG scope (facilityId, unitTypeId);
 * tham số vắng mặt được hiểu là scope NULL (không phải "không lọc").
 * Quyền: ghi cho FACILITY_MANAGER hoặc BUSINESS_MANAGER. Đọc: mọi user đã đăng nhập.
 */
@RestController
@RequestMapping("/api/price-rules")
@RequiredArgsConstructor
public class PriceRuleController {

    private final PriceRuleService priceRuleService;

    // GET /api/price-rules?priceType=RENTAL&facilityId=1 -> danh sách rule (mọi tham số đều tuỳ chọn).
    @GetMapping
    public List<PriceRuleResponse> search(@RequestParam(required = false) PriceType priceType,
                                          @RequestParam(required = false) Long facilityId,
                                          @RequestParam(required = false) Integer unitTypeId) {
        return priceRuleService.search(priceType, facilityId, unitTypeId);
    }

    // GET /api/price-rules/current?priceType=RENTAL&facilityId=1&unitTypeId=1 -> giá đang hiệu lực hôm nay.
    // priceType bắt buộc (không có required = false). 404 nếu không có, 409 nếu có nhiều hơn một.
    @GetMapping("/current")
    public PriceRuleResponse getCurrent(@RequestParam PriceType priceType,
                                        @RequestParam(required = false) Long facilityId,
                                        @RequestParam(required = false) Integer unitTypeId) {
        return priceRuleService.getCurrent(priceType, facilityId, unitTypeId);
    }

    // GET /api/price-rules/history?... -> toàn bộ lịch sử giá của scope đó (cả rule đã hết hạn / disable).
    @GetMapping("/history")
    public List<PriceRuleResponse> getHistory(@RequestParam PriceType priceType,
                                              @RequestParam(required = false) Long facilityId,
                                              @RequestParam(required = false) Integer unitTypeId) {
        return priceRuleService.getHistory(priceType, facilityId, unitTypeId);
    }

    // POST /api/price-rules -> tạo rule mới, trả 201.
    @PostMapping
    @PreAuthorize("hasAnyRole('FACILITY_MANAGER','BUSINESS_MANAGER')")
    public ResponseEntity<PriceRuleResponse> create(@Valid @RequestBody PriceRuleRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(priceRuleService.create(request));
    }

    // PUT /api/price-rules/{id} -> sửa rule.
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('FACILITY_MANAGER','BUSINESS_MANAGER')")
    public PriceRuleResponse update(@PathVariable Integer id, @Valid @RequestBody PriceRuleRequest request) {
        return priceRuleService.update(id, request);
    }

    // PATCH /api/price-rules/{id}/disable -> tắt rule (IsActive = false, vẫn giữ trong lịch sử).
    @PatchMapping("/{id}/disable")
    @PreAuthorize("hasAnyRole('FACILITY_MANAGER','BUSINESS_MANAGER')")
    public PriceRuleResponse disable(@PathVariable Integer id) {
        return priceRuleService.disable(id);
    }
}
