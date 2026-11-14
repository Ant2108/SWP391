package com.example.storage_api.controller;

import com.example.storage_api.entity.PaymentStatus;
import com.example.storage_api.entity.PaymentType;
import com.example.storage_api.model.reponse.PaymentResponse;
import com.example.storage_api.model.request.PaymentCreateRequest;
import com.example.storage_api.service.PaymentService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
public class PaymentController {
    private final PaymentService paymentService;

    @GetMapping
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_STAFF','FACILITY_MANAGER')")
    public List<PaymentResponse> list(
            @RequestParam(required = false) Long facilityId,
            @RequestParam(required = false) PaymentStatus status,
            @RequestParam(required = false) PaymentType paymentType) {
        return paymentService.list(facilityId, status, paymentType);
    }

    @GetMapping("/my")
    @PreAuthorize("hasRole('CUSTOMER')")
    public List<PaymentResponse> mine() {
        return paymentService.mine();
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_STAFF','FACILITY_MANAGER')")
    public PaymentResponse get(@PathVariable Integer id) {
        return paymentService.get(id);
    }

    @GetMapping("/{id}/invoice")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_STAFF','FACILITY_MANAGER')")
    public com.example.storage_api.model.reponse.InvoiceResponse invoice(@PathVariable Integer id) {
        return paymentService.invoice(id);
    }

    @PatchMapping("/{id}/waive")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_MANAGER')")
    public PaymentResponse waive(@PathVariable Integer id, @RequestBody java.util.Map<String, String> body) {
        return paymentService.waive(id, body == null ? null : body.get("reason"));
    }

    @PatchMapping("/{id}/refund-transferred")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_MANAGER')")
    public PaymentResponse refundTransferred(@PathVariable Integer id, @RequestParam(required = false) String reference) {
        return paymentService.markRefundTransferred(id, reference);
    }

    @GetMapping("/contract/{contractId}")
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_STAFF','FACILITY_MANAGER')")
    public List<PaymentResponse> listForContract(@PathVariable Integer contractId) {
        return paymentService.listForContract(contractId);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('CUSTOMER','SYSTEM_ADMIN','FACILITY_STAFF','FACILITY_MANAGER')")
    public ResponseEntity<PaymentResponse> create(@Valid @RequestBody PaymentCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(paymentService.create(request));
    }

    @PatchMapping("/{id}/submit-reference")
    @PreAuthorize("hasRole('CUSTOMER')")
    public PaymentResponse submitReference(@PathVariable Integer id,
            @RequestParam(required = false) String paymentMethod,
            @RequestParam(required = false) String transactionReference) {
        return paymentService.submitTransferReference(id, paymentMethod, transactionReference);
    }

    @PostMapping("/{id}/simulate-gateway")
    @PreAuthorize("hasRole('CUSTOMER')")
    public PaymentResponse simulateGateway(@PathVariable Integer id,
            @RequestParam(required = false) String paymentMethod,
            @RequestParam(required = false) String transactionReference,
            @RequestParam(defaultValue = "false") boolean full) {
        return paymentService.simulateGatewayPayment(id, paymentMethod, transactionReference, full);
    }

    /**
     * Webhook ngân hàng / trung gian thanh toán (SePay, Casso...) gọi khi có tiền vào tài khoản công ty.
     * Khớp nội dung chuyển khoản "SS<id>" và đúng số tiền thì khoản thu tự động chuyển PAID, không cần nhân viên xác nhận.
     */
    @PostMapping("/bank-webhook")
    public PaymentResponse bankWebhook(@RequestHeader(value = "X-Webhook-Secret", required = false) String secret,
            @RequestBody java.util.Map<String, Object> body) {
        String content = String.valueOf(body.getOrDefault("content", ""));
        java.math.BigDecimal amount = new java.math.BigDecimal(String.valueOf(body.getOrDefault("amount", "0")));
        String txn = String.valueOf(body.getOrDefault("transactionId", ""));
        return paymentService.applyBankTransfer(secret, content, amount, txn);
    }

    /**
     * Webhook của SePay. SePay gửi JSON {id, gateway, transferType, transferAmount, content, code, referenceCode, ...}
     * kèm header "Authorization: Apikey <khóa>". Chỉ xử lý giao dịch tiền vào; luôn trả 200 {"success":true}
     * để SePay không gửi lại, trường "matched" cho biết có khớp khoản thu nào không.
     */
    @PostMapping("/sepay-webhook")
    public java.util.Map<String, Object> sepayWebhook(
            @RequestHeader(value = "Authorization", required = false) String authorization,
            @RequestBody java.util.Map<String, Object> body) {
        return paymentService.handleSepayWebhook(authorization, body);
    }

    @PatchMapping("/{id}/paid")
    @PreAuthorize("hasAnyRole('SYSTEM_ADMIN','BUSINESS_MANAGER','FACILITY_STAFF','FACILITY_MANAGER')")
    public PaymentResponse markPaid(@PathVariable Integer id,
            @RequestParam(required = false) String paymentMethod,
            @RequestParam(required = false) String transactionReference) {
        return paymentService.markPaid(id, paymentMethod, transactionReference);
    }
}
