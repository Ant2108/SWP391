package com.example.storage_api;

import com.example.storage_api.entity.Role;
import com.example.storage_api.entity.Status;
import com.example.storage_api.entity.Users;
import com.example.storage_api.reponsitory.FacilityRepository;
import com.example.storage_api.reponsitory.UsersRepository;
import com.example.storage_api.security.JwtService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Facility / UnitType / StorageUnit / PriceRule API trên H2, đi qua cả security filter chain. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("test")
@Transactional
class StorageModuleIntegrationTest {

    @Autowired private WebApplicationContext context;
    @Autowired private FilterChainProxy filterChainProxy;
    @Autowired private UsersRepository usersRepository;
    @Autowired private FacilityRepository facilityRepository;
    @Autowired private JwtService jwtService;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private ObjectMapper objectMapper;

    private MockMvc mockMvc;
    private String fm;   // FACILITY_MANAGER
    private String bm;   // BUSINESS_MANAGER
    private String cust; // CUSTOMER
    private String staff; // FACILITY_STAFF
    private Users fmUser;

    @BeforeEach
    void setup() {
        mockMvc = MockMvcBuilders.webAppContextSetup(context).addFilters(filterChainProxy).build();
        fm = token("fm@test.com", Role.FACILITY_MANAGER);
        bm = token("bm@test.com", Role.BUSINESS_MANAGER);
        cust = token("c@test.com", Role.CUSTOMER);
        staff = token("staff@test.com", Role.FACILITY_STAFF);
        fmUser = usersRepository.findByEmail("fm@test.com").orElseThrow();
    }

    /** Gán Facility Manager cho cơ sở này (như phân công cơ sở) rồi trả token của họ. */
    private String asFm(long facilityId) {
        fmUser.setFacility(facilityRepository.getReferenceById(facilityId));
        usersRepository.save(fmUser);
        return fm;
    }

    /** Facility Manager chưa được phân công cơ sở nào. */
    private String asUnassignedFm() {
        fmUser.setFacility(null);
        usersRepository.save(fmUser);
        return fm;
    }

    private String token(String email, Role role) {
        Users u = new Users();
        u.setFullname(email);
        u.setEmail(email);
        u.setPassword(passwordEncoder.encode("x"));
        u.setRole(role);
        u.setStatus(Status.ACTIVE);
        usersRepository.save(u);
        UserDetails d = org.springframework.security.core.userdetails.User.builder()
                .username(email).password("x").roles(role.name()).build();
        return "Bearer " + jwtService.generateToken(d);
    }

    private ResultActions send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder b,
                               String auth, Object body) throws Exception {
        b.header("Authorization", auth);
        if (body != null) {
            b.contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body));
        }
        return mockMvc.perform(b);
    }

    private JsonNode json(ResultActions r) throws Exception {
        return objectMapper.readTree(r.andReturn().getResponse().getContentAsString());
    }

    private long facility(String name) throws Exception {
        return json(send(post("/api/facilities"), bm, Map.of("name", name, "address", "1 Main St"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("ACTIVE"))).get("id").asLong();
    }

    private int unitType(long facilityId, String name) throws Exception {
        return json(send(post("/api/unit-types"), asFm(facilityId), Map.of("facilityId", facilityId, "typeName", name))
                .andExpect(status().isCreated())).get("id").asInt();
    }

    private Map<String, Object> rule(Object facilityId, Object unitTypeId, String type, String calc,
                                     Object amount, Object pct, String from, String to) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("facilityId", facilityId);
        m.put("unitTypeId", unitTypeId);
        m.put("priceType", type);
        m.put("calculationType", calc);
        m.put("amount", amount);
        m.put("percentage", pct);
        m.put("effectiveFrom", from);
        m.put("effectiveTo", to);
        return m;
    }

    private final String past = LocalDate.now().minusDays(10).toString();
    private final String future = LocalDate.now().plusDays(10).toString();

    @Test
    @DisplayName("Facility: create / get / update / disable (soft) / 404 / validation / roles")
    void facilityFlow() throws Exception {
        long id = facility("F1");

        send(get("/api/facilities/" + id), cust, null).andExpect(status().isOk());
        send(get("/api/facilities"), cust, null).andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("F1"));

        send(put("/api/facilities/" + id), asFm(id), Map.of("name", "F1x", "address", "2 St", "phone", "0900"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("F1x"));

        // Chỉ Business Manager được vô hiệu hóa cơ sở; Facility Manager thì 403.
        send(patch("/api/facilities/" + id + "/disable"), fm, null).andExpect(status().isForbidden());
        send(patch("/api/facilities/" + id + "/disable"), bm, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("INACTIVE"));
        // Soft disable: row vẫn còn.
        send(get("/api/facilities/" + id), cust, null).andExpect(jsonPath("$.status").value("INACTIVE"));

        send(get("/api/facilities/99999"), fm, null).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404)).andExpect(jsonPath("$.timestamp").exists());
        send(post("/api/facilities"), bm, Map.of("name", "", "address", "x")).andExpect(status().isBadRequest());
        send(post("/api/facilities"), fm, Map.of("name", "a", "address", "b")).andExpect(status().isForbidden());
        send(post("/api/facilities"), cust, Map.of("name", "a", "address", "b")).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("UnitType: create, duplicate 409, unknown facility 404, disable, list, roles")
    void unitTypeFlow() throws Exception {
        long f = facility("F1");
        long f2 = facility("F2");
        int t = unitType(f, "Small");

        send(post("/api/unit-types"), asFm(f), Map.of("facilityId", f, "typeName", "small")).andExpect(status().isConflict());
        // Cùng tên ở Facility khác thì hợp lệ.
        unitType(f2, "Small");
        asFm(f);
        send(post("/api/unit-types"), fm, Map.of("facilityId", 99999, "typeName", "X")).andExpect(status().isNotFound());
        send(post("/api/unit-types"), bm, Map.of("facilityId", f, "typeName", "Y")).andExpect(status().isForbidden());

        send(put("/api/unit-types/" + t), fm, Map.of("facilityId", f, "typeName", "Small2", "width", 1.5))
                .andExpect(status().isOk()).andExpect(jsonPath("$.typeName").value("Small2"));
        // Đổi sang cơ sở khác (kể cả khi FM không được phân công ở đó) bị từ chối.
        send(put("/api/unit-types/" + t), fm, Map.of("facilityId", f2, "typeName", "Small2"))
                .andExpect(status().isForbidden());

        send(patch("/api/unit-types/" + t + "/disable"), fm, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
        send(get("/api/unit-types?facilityId=" + f), cust, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        send(get("/api/unit-types"), cust, null).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("StorageUnit: default AVAILABLE, same-facility rule, duplicate, status change, filters")
    void storageUnitFlow() throws Exception {
        long f1 = facility("F1");
        long f2 = facility("F2");
        int t1 = unitType(f1, "Small");
        int t2 = unitType(f2, "Small");

        asFm(f1);
        long u = json(send(post("/api/storage-units"), fm,
                Map.of("facilityId", f1, "unitTypeId", t1, "unitCode", "A-01", "floor", "1"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value("AVAILABLE"))).get("id").asLong();

        // UnitType của Facility khác => 400.
        send(post("/api/storage-units"), fm, Map.of("facilityId", f1, "unitTypeId", t2, "unitCode", "A-02"))
                .andExpect(status().isBadRequest());
        // Trùng (FacilityId, UnitCode) => 409.
        send(post("/api/storage-units"), fm, Map.of("facilityId", f1, "unitTypeId", t1, "unitCode", "a-01"))
                .andExpect(status().isConflict());
        // Cùng UnitCode ở Facility khác => OK (FM được phân công sang cơ sở đó).
        asFm(f2);
        send(post("/api/storage-units"), fm, Map.of("facilityId", f2, "unitTypeId", t2, "unitCode", "A-01"))
                .andExpect(status().isCreated());

        asFm(f1);
        send(patch("/api/storage-units/" + u + "/status"), fm, Map.of("status", "OCCUPIED"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("OCCUPIED"));
        send(patch("/api/storage-units/" + u + "/status"), fm, Map.of("status", "BOGUS"))
                .andExpect(status().isBadRequest());
        send(patch("/api/storage-units/99999/status"), fm, Map.of("status", "AVAILABLE"))
                .andExpect(status().isNotFound());

        send(get("/api/storage-units"), cust, null).andExpect(jsonPath("$.length()").value(2));
        send(get("/api/storage-units?facilityId=" + f1), cust, null).andExpect(jsonPath("$.length()").value(1));
        send(get("/api/storage-units?unitTypeId=" + t2), cust, null).andExpect(jsonPath("$.length()").value(1));
        send(get("/api/storage-units?status=AVAILABLE"), cust, null).andExpect(jsonPath("$.length()").value(1));
        send(get("/api/storage-units?facilityId=" + f1 + "&unitTypeId=" + t1 + "&status=AVAILABLE"), cust, null)
                .andExpect(jsonPath("$.length()").value(0));
        send(get("/api/storage-units?status=ABC"), cust, null).andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("PriceRule: validation rules")
    void priceRuleValidation() throws Exception {
        long f1 = facility("F1");
        long f2 = facility("F2");
        int t2 = unitType(f2, "Small");

        // EffectiveTo < EffectiveFrom
        send(post("/api/price-rules"), bm, rule(null, null, "RENTAL", "FIXED", 10, null, future, past))
                .andExpect(status().isBadRequest());
        // PERCENTAGE thiếu Percentage
        send(post("/api/price-rules"), bm, rule(null, null, "DISCOUNT", "PERCENTAGE", 10, null, past, null))
                .andExpect(status().isBadRequest());
        // FIXED thiếu Amount
        send(post("/api/price-rules"), bm, rule(null, null, "RENTAL", "FIXED", null, 5, past, null))
                .andExpect(status().isBadRequest());
        // UnitType không thuộc Facility
        send(post("/api/price-rules"), bm, rule(f1, t2, "RENTAL", "FIXED", 10, null, past, null))
                .andExpect(status().isBadRequest());
        // Facility / UnitType / priceType không tồn tại
        send(post("/api/price-rules"), bm, rule(99999, null, "RENTAL", "FIXED", 10, null, past, null))
                .andExpect(status().isNotFound());
        send(post("/api/price-rules"), bm, rule(null, null, "NOPE", "FIXED", 10, null, past, null))
                .andExpect(status().isBadRequest());
        send(post("/api/price-rules"), cust, rule(null, null, "RENTAL", "FIXED", 10, null, past, null))
                .andExpect(status().isForbidden());

        // PERCENTAGE hợp lệ: Amount bị bỏ, Percentage được giữ
        send(post("/api/price-rules"), bm, rule(null, null, "DISCOUNT", "PERCENTAGE", 99, 10, past, null))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.percentage").value(10.0))
                .andExpect(jsonPath("$.amount").doesNotExist())
                .andExpect(jsonPath("$.facilityId").doesNotExist());
    }

    @Test
    @DisplayName("PriceRule: current price matches exact scope, 404 / 409, disable, history")
    void currentAndHistory() throws Exception {
        long f1 = facility("F1");
        int t1 = unitType(f1, "Small");

        // Chưa có rule nào => 404
        send(get("/api/price-rules/current?priceType=RENTAL&facilityId=" + f1 + "&unitTypeId=" + t1), cust, null)
                .andExpect(status().isNotFound());

        // Rule toàn hệ thống không được dùng làm fallback cho scope (f1, t1).
        send(post("/api/price-rules"), bm, rule(null, null, "RENTAL", "PER_MONTH", 100, null, past, null))
                .andExpect(status().isCreated());
        send(get("/api/price-rules/current?priceType=RENTAL&facilityId=" + f1 + "&unitTypeId=" + t1), cust, null)
                .andExpect(status().isNotFound());
        send(get("/api/price-rules/current?priceType=RENTAL"), cust, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.amount").value(100.0));

        // Rule đúng scope (f1, t1)
        int r1 = json(send(post("/api/price-rules"), bm, rule(f1, t1, "RENTAL", "PER_MONTH", 200, null, past, null))
                .andExpect(status().isCreated())).get("id").asInt();
        send(get("/api/price-rules/current?priceType=RENTAL&facilityId=" + f1 + "&unitTypeId=" + t1), cust, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.amount").value(200.0));
        // Scope (f1, null) vẫn không khớp rule (f1, t1)
        send(get("/api/price-rules/current?priceType=RENTAL&facilityId=" + f1), cust, null)
                .andExpect(status().isNotFound());

        // Rule hết hạn và rule chưa tới ngày hiệu lực không tính là current
        send(post("/api/price-rules"), bm, rule(f1, t1, "RENTAL", "PER_MONTH", 50, null,
                LocalDate.now().minusDays(100).toString(), LocalDate.now().minusDays(50).toString()))
                .andExpect(status().isCreated());
        send(post("/api/price-rules"), bm, rule(f1, t1, "RENTAL", "PER_MONTH", 300, null, future, null))
                .andExpect(status().isCreated());
        send(get("/api/price-rules/current?priceType=RENTAL&facilityId=" + f1 + "&unitTypeId=" + t1), cust, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.amount").value(200.0));

        // Hai rule cùng hiệu lực cùng scope => 409
        int r2 = json(send(post("/api/price-rules"), bm, rule(f1, t1, "RENTAL", "FIXED", 250, null, past, null))
                .andExpect(status().isCreated())).get("id").asInt();
        send(get("/api/price-rules/current?priceType=RENTAL&facilityId=" + f1 + "&unitTypeId=" + t1), cust, null)
                .andExpect(status().isConflict());

        // Disable một rule => hết xung đột
        send(patch("/api/price-rules/" + r2 + "/disable"), bm, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
        send(get("/api/price-rules/current?priceType=RENTAL&facilityId=" + f1 + "&unitTypeId=" + t1), cust, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(r1));

        // Các PriceType khác dùng cùng cơ chế
        send(post("/api/price-rules"), bm, rule(f1, t1, "DEPOSIT", "FIXED", 500, null, past, null))
                .andExpect(status().isCreated());
        send(get("/api/price-rules/current?priceType=DEPOSIT&facilityId=" + f1 + "&unitTypeId=" + t1), cust, null)
                .andExpect(status().isOk());
        send(get("/api/price-rules/current?priceType=OVERDUE&facilityId=" + f1 + "&unitTypeId=" + t1), cust, null)
                .andExpect(status().isNotFound());
        send(get("/api/price-rules/current"), cust, null).andExpect(status().isBadRequest());

        // History: đúng scope, gồm rule hết hạn / disabled / tương lai; mới nhất trước
        ResultActions h = send(get("/api/price-rules/history?priceType=RENTAL&facilityId=" + f1 + "&unitTypeId=" + t1),
                cust, null).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(4));
        assertEquals(future, json(h).get(0).get("effectiveFrom").asText());

        // Update + list filter
        send(put("/api/price-rules/" + r1), bm, rule(f1, t1, "RENTAL", "PER_MONTH", 210, null, past, null))
                .andExpect(status().isOk()).andExpect(jsonPath("$.amount").value(210.0));
        send(get("/api/price-rules?priceType=DEPOSIT"), cust, null).andExpect(jsonPath("$.length()").value(1));
        send(put("/api/price-rules/99999"), bm, rule(null, null, "RENTAL", "FIXED", 1, null, past, null))
                .andExpect(status().isNotFound());
    }

    // =====================================================================
    // Phân quyền theo cơ sở: Facility Manager chỉ quản lý cơ sở được phân công
    // =====================================================================

    @Test
    @DisplayName("Authorization: Facility Manager is limited to the assigned facility (unit types, units, facility edit)")
    void facilityManagerScopedToOwnFacility() throws Exception {
        long f1 = facility("F1");
        long f2 = facility("F2");
        int t1 = unitType(f1, "Small");
        int t2 = unitType(f2, "Small");
        long u2 = json(send(post("/api/storage-units"), asFm(f2),
                Map.of("facilityId", f2, "unitTypeId", t2, "unitCode", "B-01")).andExpect(status().isCreated())).get("id").asLong();

        asFm(f1);
        // 1, 2: loại kho
        send(post("/api/unit-types"), fm, Map.of("facilityId", f1, "typeName", "Medium")).andExpect(status().isCreated());
        send(post("/api/unit-types"), fm, Map.of("facilityId", f2, "typeName", "Medium"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value("You do not have access to facility " + f2));
        send(put("/api/unit-types/" + t2), fm, Map.of("facilityId", f2, "typeName", "Hacked")).andExpect(status().isForbidden());
        send(put("/api/unit-types/" + t1), fm, Map.of("facilityId", f2, "typeName", "Small")).andExpect(status().isForbidden());
        send(patch("/api/unit-types/" + t2 + "/disable"), fm, null).andExpect(status().isForbidden());
        // 3, 4: ô kho
        send(post("/api/storage-units"), fm, Map.of("facilityId", f2, "unitTypeId", t2, "unitCode", "B-02")).andExpect(status().isForbidden());
        send(patch("/api/storage-units/" + u2 + "/status"), fm, Map.of("status", "MAINTENANCE")).andExpect(status().isForbidden());
        send(put("/api/storage-units/" + u2), fm, Map.of("facilityId", f2, "unitTypeId", t2, "unitCode", "B-01")).andExpect(status().isForbidden());
        // 5, 6: sửa thông tin cơ sở
        send(put("/api/facilities/" + f1), fm, Map.of("name", "F1 renamed", "address", "x")).andExpect(status().isOk());
        send(put("/api/facilities/" + f2), fm, Map.of("name", "F2 renamed", "address", "x")).andExpect(status().isForbidden());
        // 7: tạo / vô hiệu hóa cơ sở chỉ BM
        send(post("/api/facilities"), fm, Map.of("name", "F3", "address", "x")).andExpect(status().isForbidden());
        send(patch("/api/facilities/" + f1 + "/disable"), fm, null).andExpect(status().isForbidden());

        // Dữ liệu cơ sở 2 không bị đổi
        send(get("/api/unit-types?facilityId=" + f2), cust, null).andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].typeName").value("Small")).andExpect(jsonPath("$[0].active").value(true));
        send(get("/api/storage-units?facilityId=" + f2), cust, null).andExpect(jsonPath("$[0].status").value("AVAILABLE"));
        send(get("/api/facilities/" + f2), cust, null).andExpect(jsonPath("$.name").value("F2"));
    }

    @Test
    @DisplayName("Authorization: Facility Manager without an assigned facility cannot write anywhere; staff cannot write")
    void unassignedFacilityManagerAndStaff() throws Exception {
        long f1 = facility("F1");
        int t1 = unitType(f1, "Small");

        asUnassignedFm();
        send(post("/api/unit-types"), fm, Map.of("facilityId", f1, "typeName", "X")).andExpect(status().isForbidden());
        send(post("/api/storage-units"), fm, Map.of("facilityId", f1, "unitTypeId", t1, "unitCode", "A-1")).andExpect(status().isForbidden());
        send(put("/api/facilities/" + f1), fm, Map.of("name", "n", "address", "a")).andExpect(status().isForbidden());
        send(post("/api/price-rules"), fm, rule(f1, null, "RENTAL", "PER_MONTH", 100, null, past, null)).andExpect(status().isForbidden());

        send(post("/api/unit-types"), staff, Map.of("facilityId", f1, "typeName", "X")).andExpect(status().isForbidden());
        send(post("/api/price-rules"), staff, rule(f1, null, "RENTAL", "PER_MONTH", 100, null, past, null)).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("Authorization: Facility Manager can only manage RENTAL prices of the own facility")
    void facilityManagerPriceRules() throws Exception {
        long f1 = facility("F1");
        long f2 = facility("F2");
        int t1 = unitType(f1, "Small");
        asFm(f1);

        // 8: RENTAL ở cơ sở của mình
        int own = json(send(post("/api/price-rules"), fm, rule(f1, t1, "RENTAL", "PER_MONTH", 100, null, past, null))
                .andExpect(status().isCreated())).get("id").asInt();
        // 9: loại giá khác
        for (String type : new String[]{"DEPOSIT", "RENEWAL", "OVERDUE", "EXTRA_FEE", "DAMAGE_FEE"}) {
            send(post("/api/price-rules"), fm, rule(f1, null, type, "FIXED", 100, null, past, null)).andExpect(status().isForbidden());
        }
        send(post("/api/price-rules"), fm, rule(f1, null, "DISCOUNT", "PERCENTAGE", null, 5, past, null)).andExpect(status().isForbidden());
        // 10: không có cơ sở (giá toàn hệ thống)
        send(post("/api/price-rules"), fm, rule(null, null, "RENTAL", "PER_MONTH", 100, null, past, null)).andExpect(status().isForbidden());
        // cơ sở khác
        send(post("/api/price-rules"), fm, rule(f2, null, "RENTAL", "PER_MONTH", 100, null, past, null)).andExpect(status().isForbidden());

        // update / disable: kiểm tra cả bản ghi hiện có lẫn giá trị mới
        send(put("/api/price-rules/" + own), fm, rule(f1, t1, "RENTAL", "PER_MONTH", 120, null, past, null))
                .andExpect(status().isOk()).andExpect(jsonPath("$.amount").value(120.0));
        send(put("/api/price-rules/" + own), fm, rule(f1, t1, "DEPOSIT", "FIXED", 120, null, past, null)).andExpect(status().isForbidden());
        send(put("/api/price-rules/" + own), fm, rule(f2, null, "RENTAL", "PER_MONTH", 120, null, past, null)).andExpect(status().isForbidden());
        send(put("/api/price-rules/" + own), fm, rule(null, null, "RENTAL", "PER_MONTH", 120, null, past, null)).andExpect(status().isForbidden());

        // Rule do BM tạo: DEPOSIT của cơ sở mình, RENTAL của cơ sở khác, rule toàn hệ thống
        int deposit = json(send(post("/api/price-rules"), bm, rule(f1, null, "DEPOSIT", "FIXED", 500, null, past, null))
                .andExpect(status().isCreated())).get("id").asInt();
        int other = json(send(post("/api/price-rules"), bm, rule(f2, null, "RENTAL", "PER_MONTH", 90, null, past, null))
                .andExpect(status().isCreated())).get("id").asInt();
        int global = json(send(post("/api/price-rules"), bm, rule(null, null, "RENTAL", "PER_MONTH", 80, null, past, null))
                .andExpect(status().isCreated())).get("id").asInt();
        for (int id : new int[]{deposit, other, global}) {
            send(put("/api/price-rules/" + id), fm, rule(f1, null, "RENTAL", "PER_MONTH", 1, null, past, null)).andExpect(status().isForbidden());
            send(patch("/api/price-rules/" + id + "/disable"), fm, null).andExpect(status().isForbidden());
        }
        send(patch("/api/price-rules/" + own + "/disable"), fm, null).andExpect(status().isOk()).andExpect(jsonPath("$.active").value(false));
        send(patch("/api/price-rules/99999/disable"), fm, null).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("Authorization: Business Manager manages every facility and every price type; reads stay open to customers")
    void businessManagerAndReads() throws Exception {
        // 11: BM tạo / sửa / vô hiệu hóa cơ sở, tạo giá DEPOSIT và các loại giá khác
        long f1 = facility("F1");
        send(put("/api/facilities/" + f1), bm, Map.of("name", "F1 by BM", "address", "x")).andExpect(status().isOk());
        int t1 = unitType(f1, "Small");
        int deposit = json(send(post("/api/price-rules"), bm, rule(f1, null, "DEPOSIT", "FIXED", 500, null, past, null))
                .andExpect(status().isCreated())).get("id").asInt();
        send(put("/api/price-rules/" + deposit), bm, rule(f1, null, "DEPOSIT", "FIXED", 600, null, past, null)).andExpect(status().isOk());
        send(post("/api/price-rules"), bm, rule(null, null, "DISCOUNT", "PERCENTAGE", null, 10, past, null)).andExpect(status().isCreated());
        send(post("/api/price-rules"), bm, rule(f1, t1, "RENTAL", "PER_MONTH", 200, null, past, null)).andExpect(status().isCreated());
        send(patch("/api/price-rules/" + deposit + "/disable"), bm, null).andExpect(status().isOk());
        send(patch("/api/facilities/" + f1 + "/disable"), bm, null).andExpect(status().isOk());

        // 12: đọc giá không bị ảnh hưởng (module đặt chỗ / thanh toán gọi getCurrent)
        send(get("/api/price-rules/current?priceType=RENTAL&facilityId=" + f1 + "&unitTypeId=" + t1), cust, null)
                .andExpect(status().isOk()).andExpect(jsonPath("$.amount").value(200.0));
        send(get("/api/price-rules?priceType=RENTAL"), cust, null).andExpect(status().isOk());
        send(get("/api/price-rules/history?priceType=DEPOSIT&facilityId=" + f1), cust, null).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Public prices: guests may GET /api/price-rules and /current only; history and every write stay protected")
    void guestsCanReadPublicPrices() throws Exception {
        long f1 = facility("F1");
        int t1 = unitType(f1, "Small");
        int rent = json(send(post("/api/price-rules"), bm, rule(f1, t1, "RENTAL", "PER_MONTH", 200, null, past, null))
                .andExpect(status().isCreated())).get("id").asInt();
        send(post("/api/price-rules"), bm, rule(f1, t1, "DEPOSIT", "FIXED", 500, null, past, null)).andExpect(status().isCreated());

        // 1: danh sách giá, kể cả lọc theo loại giá
        mockMvc.perform(get("/api/price-rules")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
        mockMvc.perform(get("/api/price-rules?priceType=RENTAL")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        // 2: giá hiện hành
        mockMvc.perform(get("/api/price-rules/current?priceType=RENTAL&facilityId=" + f1 + "&unitTypeId=" + t1))
                .andExpect(status().isOk()).andExpect(jsonPath("$.amount").value(200.0));
        // Không có giá phù hợp vẫn là 404 của nghiệp vụ (không phải 401)
        mockMvc.perform(get("/api/price-rules/current?priceType=OVERDUE&facilityId=" + f1)).andExpect(status().isNotFound());

        // 3: lịch sử giá KHÔNG công khai
        mockMvc.perform(get("/api/price-rules/history?priceType=RENTAL&facilityId=" + f1 + "&unitTypeId=" + t1))
                .andExpect(status().isUnauthorized());
        // 4: ghi dữ liệu vẫn cần đăng nhập
        String body = objectMapper.writeValueAsString(rule(f1, t1, "RENTAL", "PER_MONTH", 1, null, past, null));
        mockMvc.perform(post("/api/price-rules").contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/price-rules/" + rent).contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isUnauthorized());
        mockMvc.perform(patch("/api/price-rules/" + rent + "/disable")).andExpect(status().isUnauthorized());
        // đường dẫn con khác cũng không mở
        mockMvc.perform(get("/api/price-rules/" + rent)).andExpect(status().isUnauthorized());

        // 5: phân quyền cơ sở của Facility Manager vẫn còn nguyên
        asFm(f1);
        send(post("/api/price-rules"), fm, rule(f1, null, "DEPOSIT", "FIXED", 1, null, past, null)).andExpect(status().isForbidden());
        send(post("/api/price-rules"), fm, rule(null, null, "RENTAL", "PER_MONTH", 1, null, past, null)).andExpect(status().isForbidden());
        send(post("/api/price-rules"), fm, rule(f1, null, "RENTAL", "PER_MONTH", 1, null, past, null)).andExpect(status().isCreated());
        // người dùng đã đăng nhập vẫn dùng bình thường
        send(get("/api/price-rules/current?priceType=RENTAL&facilityId=" + f1 + "&unitTypeId=" + t1), cust, null).andExpect(status().isOk());
    }

    @Test
    @DisplayName("Guests can read the storage catalogue but not change it or read other data")
    void unauthenticated() throws Exception {
        // Đọc danh sách kho là công khai (khách chưa đăng nhập vẫn xem được)
        mockMvc.perform(get("/api/facilities")).andExpect(status().isOk());
        mockMvc.perform(get("/api/storage-units")).andExpect(status().isOk());
        // Giá thuê cũng công khai (chỉ GET /api/price-rules và /current)
        mockMvc.perform(get("/api/price-rules")).andExpect(status().isOk());
        // Ghi dữ liệu vẫn cần đăng nhập
        mockMvc.perform(post("/api/facilities").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"x\",\"address\":\"y\"}")).andExpect(status().isUnauthorized());
    }
}
