# 敏感字段加密方案

> 阶段：P2 数据库设计 / T2.20
> 用途：定义全平台敏感字段的加密算法、密钥管理、检索方案、脱敏展示规范
> 依据：PRD §4.3.1 数据安全 / DESIGN*P2*数据库设计.md §九 / CONSENSUS §2.5
> 适用：本文档为方案文档，**不含具体 Node 代码**；编码实现归 P3 阶段

---

## 一、加密目标与合规底线

### 1.1 业务目标

- 用户手机号、身份证、银行卡、姓名等 PII 信息**密文落库**
- 即使 DB 泄漏，攻击者无法直接还原敏感字段
- 同时支持**等值检索**（如手机号查重、登录）和**脱敏展示**（前端列表）

### 1.2 合规依据

- 《个人信息保护法》（PIPL）第 51 条 —— 个人信息保密措施
- 《网络安全法》第 21 条 —— 数据加密存储
- 《信息安全技术 个人信息安全规范》（GB/T 35273-2020）
- PCI-DSS 3.4 —— 主账号加密存储

---

## 二、整体方案：三列模式

每个敏感字段在表中拆为 **3 列**：

| 列              | 类型             | 用途                                           | 示例        |
| --------------- | ---------------- | ---------------------------------------------- | ----------- |
| `<field>_enc`   | `VARBINARY(255)` | AES-256-GCM 密文（IV+CipherText+AuthTag 串接） | `0x9d8a...` |
| `<field>_hash`  | `CHAR(64)`       | HMAC-SHA256 hex（确定性，用于等值索引）        | `e3b0c4...` |
| `<field>_tail4` | `VARCHAR(8)`     | 末 4 位明文（脱敏展示）                        | `0000`      |

部分字段（如 `real_name`、`legal_id_card`、`account_holder`）不需要等值检索，仅 `_enc` + （可选）`_tail` 两列。

---

## 三、算法选型

### 3.1 加密：AES-256-GCM

| 参数       | 值                        | 说明                               |
| ---------- | ------------------------- | ---------------------------------- | ---------- | --- | ---------- | ------------------ |
| 算法       | AES                       | 工业标准对称加密                   |
| 密钥长度   | 256 bit                   | 抗量子攻击预备                     |
| 模式       | GCM (Galois/Counter Mode) | 同时提供机密性 + 完整性（AEAD）    |
| IV / Nonce | 12 字节随机（推荐）       | 每次加密**重新随机生成**，禁止重用 |
| AuthTag    | 16 字节                   | GCM 标准                           |
| 输出格式   | `IV (12B)                 |                                    | CipherText |     | Tag (16B)` | 串接后存 VARBINARY |

**为什么不用 ECB/CBC？**

- ECB：相同明文密文相同，可被字典攻击
- CBC：无完整性保护，需配合 HMAC（GCM 一步搞定）

**为什么不用 RSA 等非对称？**

- 性能差 1000+ 倍
- 同等安全级别密钥更长
- 业务无非对称需求（不需要密钥分发）

### 3.2 检索：HMAC-SHA256

| 参数 | 值                                                                        |
| ---- | ------------------------------------------------------------------------- |
| 算法 | HMAC-SHA256                                                               |
| 密钥 | 与加密 key 同源派生（HKDF）但**不同子 key**，存放在环境变量 `HMAC_KEY_V1` |
| 输出 | 64 hex 字符                                                               |

**为什么不用 SHA256(salt+plain)？**

- 缺乏 HMAC 的随机预言机模型保证
- HMAC 抗长度扩展攻击

**关键性质（必须坚持）**：

- ✅ 同一明文恒得同一 hash → 可建唯一索引、做等值查询
- ❌ 不可做模糊查询（如手机号前 3 位）

### 3.3 脱敏（tail4）

| 字段     | 明文示例            | tail4  |
| -------- | ------------------- | ------ |
| 手机号   | 13800001234         | `1234` |
| 身份证号 | 110101199001011234  | `1234` |
| 银行卡号 | 6228480402564890018 | `0018` |

注意：身份证号有时业务方要求"前 6 + 后 4"格式（地区码 + 末 4），可在视图层渲染时按 `id_card_tail4` 即可（地区码可由业务表带）。

---

## 四、密钥管理

### 4.1 密钥层级

```
KEK (Key Encryption Key)
  └─ 来源：KMS (生产) / 环境变量 ENC_KEY_V1 (开发)
       └─ 通过 HKDF 派生：
            ├─ DEK_AES_V1：用于 AES-256-GCM 加解密
            └─ DEK_HMAC_V1：用于 HMAC-SHA256 计算
```

### 4.2 存储位置

| 环境     | KEK 存放                                   | 说明                         |
| -------- | ------------------------------------------ | ---------------------------- |
| dev/test | `.env` 文件 `ENC_KEY_V1=...`（base64 32B） | 不入 git，由 .gitignore 兜底 |
| 预发     | K8s Secret                                 | RBAC 严格                    |
| 生产     | 阿里云 KMS / AWS KMS / HashiCorp Vault     | 应用启动时拉取 + 缓存        |

### 4.3 密钥轮换

- 表新增 `enc_key_ver TINYINT UNSIGNED DEFAULT 1` 标识本行用哪版 key
- 轮换流程：
  1. 生成新 key `ENC_KEY_V2`
  2. 应用同时持有 V1 + V2，**写入用 V2**，读时按 `enc_key_ver` 选 key
  3. 后台 Job 渐进式重加密旧数据：`SELECT WHERE enc_key_ver=1`，解密 → 用 V2 加密 → 写回，并更新 `enc_key_ver=2`
  4. 全量完成后下线 V1（保留备份）
- 强制轮换周期：**12 个月**
- 触发轮换：泄漏事件 / 离职关键人员 / 合规审计要求

### 4.4 IV 唯一性

- IV 必须**每次加密随机**（用 crypto.randomBytes(12)）
- IV 与密钥配合时同 IV 重用 = 灾难（可恢复明文流）
- IV 跟随密文存（前 12 字节），不需要单独列

---

## 五、字段清单（按 DESIGN §九 + 实际表落地核对）

| 表                | 明文字段        | \_enc 列            | \_hash 列            | \_tail4 列            | 等值检索? |
| ----------------- | --------------- | ------------------- | -------------------- | --------------------- | --------- |
| `user`            | mobile          | mobile_enc          | mobile_hash          | mobile_tail4          | ✅        |
| `user`            | id_card         | id_card_enc         | id_card_hash         | —                     | ✅        |
| `user`            | real_name       | real_name_enc       | —                    | —                     | ❌        |
| `user_address`    | receiver_mobile | receiver_mobile_enc | receiver_mobile_hash | receiver_mobile_tail4 | ✅        |
| `merchant`        | mobile          | mobile_enc          | mobile_hash          | mobile_tail4          | ✅        |
| `merchant`        | legal_id_card   | legal_id_card_enc   | legal_id_card_hash   | —                     | ✅        |
| `merchant_staff`  | mobile          | mobile_enc          | mobile_hash          | mobile_tail4          | ✅        |
| `rider`           | name            | name_enc            | —                    | name_tail（姓）       | ❌        |
| `rider`           | mobile          | mobile_enc          | mobile_hash          | mobile_tail4          | ✅        |
| `rider`           | id_card         | id_card_enc         | id_card_hash         | —                     | ✅        |
| `rider`           | bank_card       | bank_card_enc       | —                    | bank_card_tail4       | ❌        |
| `admin`           | mobile          | mobile_enc          | mobile_hash          | mobile_tail4          | ✅        |
| `withdraw_record` | bank_card_no    | bank_card_no_enc    | —                    | bank_card_tail4       | ❌        |
| `withdraw_record` | account_holder  | account_holder_enc  | —                    | —                     | ❌        |
| `invoice`         | mobile          | mobile_enc          | —                    | mobile_tail4          | ❌        |

> 全部表已通过 01_account.sql / 03_shop_product.sql / 05_finance.sql 落地。

---

## 六、检索逻辑（业务层伪代码）

```
# 写入（NestJS Service 伪代码，P3 实现）
def saveMobile(plainMobile):
    enc = aesGcmEncrypt(plainMobile, dek_aes_v2)        # IV+CT+Tag
    hash = hmacSha256(plainMobile, dek_hmac_v2)         # 64 hex
    tail4 = plainMobile[-4:]
    INSERT INTO user (mobile_enc, mobile_hash, mobile_tail4, enc_key_ver)
                VALUES (enc, hash, tail4, 2)

# 检索（用户登录场景）
def findByMobile(plainMobile):
    hash = hmacSha256(plainMobile, dek_hmac_v2)
    row = SELECT * FROM user WHERE mobile_hash = hash
    if row exists:
        plain = aesGcmDecrypt(row.mobile_enc, dek_aes_by_ver(row.enc_key_ver))
        # 二次校验 plain == plainMobile，防 hash 冲突（理论冲突极小）
```

---

## 七、脱敏展示规范

| 字段               | 后端返回                                        | 前端展示              | 备注                                     |
| ------------------ | ----------------------------------------------- | --------------------- | ---------------------------------------- |
| 手机号             | `mobile_tail4` 或 `mobile_masked='138****1234'` | `138****1234`         | 列表场景默认仅 tail4；详情按权限可见全号 |
| 身份证号           | `id_card_masked='110***********1234'`           | 同                    | 6 + 8\* + 4                              |
| 银行卡             | `bank_card_tail4`                               | `**** **** **** 0018` | 仅末 4                                   |
| 真实姓名           | `name_masked='张*'`                             | `张*`                 | 保留姓                                   |
| 邮箱（不加密）     | 业务层 mask                                     | `xx****@gmail.com`    | 仅前 2 字符 + `*`                        |
| 详细地址（不加密） | 业务层 mask                                     | `北京市朝阳区****`    | 行政区 + `*`                             |

**返回原则**：

1. 列表接口 **永不返回 \_enc / \_hash 列**
2. 详情接口仅返回 mask 后字段；如需明文必须经"二次身份校验"接口
3. 后端日志打印前用 `@SensitiveLog()` 装饰器自动 mask（P3 实现）

---

## 八、数据导出（CSV/Excel）合规

- 导出**禁止**包含 \_enc / \_hash 列
- 导出 mobile 默认 mask；如需明文走"批量解密+审批"专用接口
- 审批角色：finance + risk_control 双签
- 审计：每次导出写 `operation_log`，含 `module='export'` `action='full_data'`

---

## 九、事故响应

| 事件             | 响应                                             |
| ---------------- | ------------------------------------------------ |
| 密钥泄漏         | 立即触发密钥轮换流程；同时通报安全团队           |
| 数据泄漏（疑似） | 评估 \_enc 是否可被解密；如 KMS 安全则降级"低危" |
| 合规审计         | 提供本文档 + 加密日志 + 密钥审计 trail           |

---

## 十、本期 T2.20 完成证据

- [x] 算法选型（AES-256-GCM + HMAC-SHA256）
- [x] IV 生成（12 字节随机）
- [x] Key 存储（环境变量 → KMS）
- [x] enc_key_ver 轮换策略
- [x] HMAC 检索逻辑
- [x] tail4 脱敏规则
- [x] 脱敏展示规范
- [x] 全量字段清单（覆盖 DESIGN §九）

---

## 附 A. P3 实现 TODO 清单

P3 阶段需在 `后端/src/common/crypto/` 落地：

- [ ] `crypto.service.ts` —— `encrypt(plain): Buffer` / `decrypt(buf): string` / `hmac(plain): string`
- [ ] `crypto.config.ts` —— 从 ConfigService 读 KEK + HKDF 派生 DEK，缓存
- [ ] `sensitive.decorator.ts` —— `@SensitiveLog()` / `@MaskMobile()` / `@MaskIdCard()`
- [ ] `key-rotation.job.ts` —— 渐进式重加密 Job
- [ ] 单元测试覆盖：加解密、HMAC 一致性、IV 唯一、key 版本切换
