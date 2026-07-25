# CloudBase 数据库集合说明

> 云开发环境 ID: `cloud1-8grodf5s3006f004`
> 认证方式: 匿名登录
> 安全规则: 所有用户可读写

---

## 集合清单

| 集合名称 | 说明 | 对应模块 |
|---------|------|---------|
| `erp_contracts` | 合同数据（家装/工装） | 合同管理 |
| `erp_receipts` | 收款记录 | 收款管理 |
| `erp_expenses` | 项目支出 | 支出管理 |
| `erp_reimbursements` | 员工报销 | 报销管理 |
| `erp_generalIncomes` | 总店收入（设计费、管理费等） | 总店财务管理 |
| `erp_generalExpenses` | 总店支出（房租、工资等） | 总店财务管理 |
| `erp_quotations` | 项目报价 | 报价管理 |
| `erp_users` | 系统用户 | 用户管理 |
| `erp_notifications` | 系统通知 | 通知中心 |

---

## 详细说明

### `erp_contracts` — 合同

存储所有装修合同，包含家装和工装两类（通过 `bizType` 字段区分）。

| 关键字段 | 说明 |
|---------|------|
| `contractNo` | 合同编号 |
| `bizType` | 业务类型: `家装` 或 `工装` |
| `houseAddress` | 房屋地址 / 项目地点 |
| `customerName` | 客户姓名 / 公司名称 |
| `customerPhone` | 客户电话 |
| `contractAmount` | 合同金额 |
| `paymentStages` | 付款阶段（数组） |
| `status` | 状态: `进行中` / `已完工` / `已结算` |
| `signDate` | 签订日期 |
| `expectedEndDate` | 预计完工日期 |
| `projectManager` | 项目经理 |

### `erp_receipts` — 收款

与合同关联的收款记录，支持按阶段收款。

| 关键字段 | 说明 |
|---------|------|
| `contractId` | 关联合同 ID |
| `amount` | 收款金额 |
| `paymentMethod` | 收款方式: `银行转账` / `微信支付` / `支付宝` / `现金` |
| `receiptDate` | 收款日期 |
| `stage` | 付款阶段: `一期款` / `二期款` / `三期款` / `尾款` |

### `erp_expenses` — 支出

项目相关的支出记录。

| 关键字段 | 说明 |
|---------|------|
| `contractId` | 关联合同 ID |
| `category` | 支出类别: `材料费` / `人工费` / `外包费` / `管理费` / `其他` |
| `amount` | 支出金额 |
| `supplier` | 供应商 |
| `expenseDate` | 支出日期 |
| `status` | 状态: `已付` / `待付` |

### `erp_reimbursements` — 报销

员工费用报销记录。

| 关键字段 | 说明 |
|---------|------|
| `applicant` | 申请人 |
| `department` | 部门 |
| `type` | 报销类型: `交通费` / `差旅费` / `采购费` / `业务招待费` / `其他` |
| `amount` | 报销金额 |
| `status` | 状态: `待审核` / `已审核` / `已打款` / `已驳回` |
| `reviewer` | 审核人 |
| `reviewComment` | 审核意见 |
| `paymentVoucher` | 打款凭证 |

### `erp_generalIncomes` — 总店收入

非项目相关的公司层面收入（设计费、管理费等）。

| 关键字段 | 说明 |
|---------|------|
| `category` | 收入类别: `设计费` / `管理费` / `咨询费` / `其他收入` |
| `amount` | 收入金额 |
| `source` | 收入来源 |
| `incomeDate` | 收入日期 |

### `erp_generalExpenses` — 总店支出

公司运营层面的支出（房租、工资、水电等）。

| 关键字段 | 说明 |
|---------|------|
| `category` | 支出类别: `房租` / `工资` / `水电` / `办公用品` / `推广` / `其他` |
| `amount` | 支出金额 |
| `expenseDate` | 支出日期 |

### `erp_quotations` — 报价

项目的多版本报价记录。

| 关键字段 | 说明 |
|---------|------|
| `contractId` | 关联合同 ID |
| `version` | 版本号: `初版` / `修订版V2` / `最终版` |
| `amount` | 报价金额 |
| `content` | 报价内容描述 |
| `status` | 状态: `草稿` / `已确认` / `已作废` |

### `erp_users` — 用户

系统用户账户，用于登录认证。

| 关键字段 | 说明 |
|---------|------|
| `username` | 用户名 |
| `password` | 密码（当前为明文存储，后续应升级为加密） |
| `role` | 角色: `管理员` / `财务` / `普通用户` |
| `name` | 显示名称 |

### `erp_notifications` — 通知

系统通知消息（报销审批提醒等）。

| 关键字段 | 说明 |
|---------|------|
| `userId` | 接收用户 ID |
| `type` | 通知类型 |
| `title` | 通知标题 |
| `content` | 通知内容 |
| `read` | 是否已读 |
| `createdAt` | 创建时间 |

---

## 命名规则

- 所有数据表加 `erp_` 前缀，与小程序数据表区分（小程序数据不使用此前缀）
- 同一云开发环境，不同集合名，数据互不影响