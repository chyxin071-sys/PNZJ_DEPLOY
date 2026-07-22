# ERP系统优化清单

> 整理日期：2026-06-28

---

## 一、客户管理模块

### 1.1 新增客户表单 - 移动端选择器优化
- **问题描述**：新增客户时，评级、类型、来源在移动端是下拉菜单形式，体验不佳
- **优化方案**：移动端改用底部抽屉（BottomDrawer）形式展示选项
- **涉及文件**：
  - [Leads.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/Leads.tsx) - 新建客户弹窗
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx) - 编辑客户信息
- **参考实现**：项目已有 `BottomDrawer` 组件和 `Select` 组件（移动端已用底部抽屉），可复用现有模式

### 1.2 客户状态变更 - 签单人默认值
- **问题描述**：客户状态更新为已签单时，签单人没有默认值
- **优化方案**：签单人默认填充为当前登录用户，同时允许用户修改选择
- **涉及文件**：
  - [Leads.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/Leads.tsx#L680-L728) - `handleStatusChange` / `confirmSign` 函数
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L568-L642) - `handleStatusChange` / `confirmSign` 函数
- **当前状态**：Leads.tsx 中已设置 `setSigner(myName)`，但 LeadDetail.tsx 中 `signForm` 初始化为空

---

## 二、跟进记录模块

### 2.1 新增跟进 - 移除跟进类型
- **问题描述**：新增跟进时有跟进类型（method）字段，但用户不需要
- **优化方案**：移除跟进类型选择，保存时可默认值或留空
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L252) - `INIT_FOLLOW` 常量
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L532-L542) - `handleAddFollow` 函数
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L1779-L1788) - 新增跟进表单UI
- **注意**：跟进记录列表中仍显示类型标签（系统记录等），仅新增时不选择

### 2.2 跟进记录 - 移动端左滑操作
- **问题描述**：电脑版有 hover 显示编辑/删除按钮，但移动端没有左滑操作
- **优化方案**：移动端实现类似 iOS 的左滑手势，露出编辑和删除按钮
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L1792-L1819) - 跟进记录列表渲染
- **参考实现**：主材清单已有左滑实现（`handleMaterialTouchStart` / `handleMaterialTouchEnd`）

---

## 三、设计进度模块

### 3.1 节点管理弹窗 - 移动端布局优化
- **问题描述**：
  - 当前工作流节点名称无法完全显示
  - 添加自定义节点的「直接添加」按钮出框
  - 底部「完成」按钮换行
- **优化方案**：
  - 节点名称增加省略或换行处理
  - 「直接添加」按钮移到输入框下方（垂直布局）
  - 底部按钮区域重新调整，防止换行
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L2840-L2987) - `showDesignSetup` 节点管理弹窗

### 3.2 节点管理 - 关闭提示逻辑修正
- **问题描述**：点击「完成」按钮时弹出确认提示，但节点设置是实时保存的
- **优化方案**：
  - 点击「完成」直接关闭，不弹提示
  - 仅异常退出（点击遮罩/关闭按钮）时才提示保存
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L755-L762) - `handleCloseDesignSetup` 函数

### 3.3 编辑计划时间 - 移动端日期选择器
- **问题描述**：编辑计划时间时，日期选择是弹窗形式，移动端体验不佳
- **优化方案**：移动端改用底部抽屉形式的日期选择器
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L1963-L1981) - 展开的日期编辑面板
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L188-L250) - `CustomDatePicker` 组件
- **注意**：`CustomDatePicker` 目前只有桌面端弹窗，移动端需补充底部抽屉实现

### 3.4 开始节点 - 计划时间校验
- **问题描述**：未设置计划时间时也能点击「开始」，用户可能忘记设置
- **优化方案**：点击「开始」时校验是否已设置计划开始/结束时间，未设置则提示用户
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L1985-L1991) - 「开始」按钮点击事件

### 3.5 节点操作按钮 - 简化与位置调整
- **问题描述**：「编辑时间」和「删除节点」按钮文字较长，移动端布局拥挤
- **优化方案**：
  - 简化为「编辑」和「删除」图标按钮
  - 移到节点卡片右上角
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L1910-L1932) - 节点操作按钮区域

### 3.6 添加入口合并
- **问题描述**：底部有「添加节点」和「节点管理」两个按钮，功能重复
- **优化方案**：仅保留一个入口（建议保留「节点管理」，功能更全面）
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L2040-L2050) - 底部操作按钮

---

## 四、文件上传下载模块

### 4.1 文件下载功能修复
- **问题描述**：上传的文件点击下载没有反应
- **可能原因**：
  - `downloadFile` 函数调用参数问题（第1144行传空文件名）
  - 云存储跨域或权限问题
  - `cloudDownloadFile` 实现中 fetch 失败后降级方案未生效
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L1116-L1123) - `downloadFile` 函数
  - [cloudStorage.ts](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/utils/cloudStorage.ts#L71-L111) - `downloadFile` 实现
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L1142-L1157) - `previewFile` 中非图片类型调用下载时文件名传空

---

## 五、主材清单模块

### 5.1 主材清单分享 - 移除已签单限制
- **问题描述**：分享主材清单时要求必须已签单且建立工地，限制太死
- **优化方案**：移除已签单/建工地限制，有主材数据即可分享
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L1193-L1204) - `openShareCategoryModal` 函数
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L1214-L1249) - `handleShareMaterials` 函数

### 5.2 主材区域自定义 - 修复无反应问题
- **问题描述**：点击区域选择「自定义...」时没有反应
- **可能原因**：
  - `SearchableSelect` 组件移动端选择 `__custom__` 值时状态切换问题
  - 自定义输入框显示逻辑判断有误
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L3081-L3110) - 区域选择与自定义输入
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L93-L186) - `SearchableSelect` 组件

---

## 六、合同管理模块

### 6.1 新建合同 - 已签单状态校验
- **问题描述**：新建合同时没有校验客户是否已签单
- **优化方案**：新建合同前检查客户状态，非已签单状态时提醒用户
- **涉及文件**：
  - [ContractDrawer.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/components/ContractDrawer.tsx) - 新建合同抽屉
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx) - 客户详情页新建合同入口
  - [ProjectBizDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/ProjectBizDetail.tsx) - 工地详情页新建合同入口

### 6.2 合同入口显示逻辑
- **问题描述**：已建合同的客户，客户详情页、工地详情页仍显示「新建合同」而非「合同详情」
- **优化方案**：
  - 已有合同时，按钮改为「合同详情」，点击跳转合同详情页
  - 其他功能模块的「需要新建合同」提示也需同步调整
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx) - 客户详情页
  - [ProjectBizDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/ProjectBizDetail.tsx) - 工地详情页

### 6.3 合同详情页 - 响应式重构
- **问题描述**：
  - 移动端布局混乱
  - 同等级字体大小不统一
  - 移动端不需要导出功能
- **优化方案**：
  - 重新设计移动端布局，确保各区块清晰可读
  - 统一同级标题字体大小
  - 移动端隐藏导出按钮，仅保留编辑功能
- **涉及文件**：
  - [ContractDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/ContractDetail.tsx)

### 6.4 合同编辑 - 客户信息不可编辑
- **问题描述**：合同编辑时可以修改客户信息（姓名、电话、地址）
- **优化方案**：
  - 合同编辑时客户信息字段设为只读
  - 提示用户到客户详情页更新客户信息
  - 客户信息更新后，合同、工地等关联数据自动同步
- **涉及文件**：
  - [ContractDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/ContractDetail.tsx#L66-L89) - 编辑表单初始化
  - [ContractDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/ContractDetail.tsx#L124-L145) - 保存编辑

### 6.5 客户信息同步
- **问题描述**：客户信息更新后，合同、工地等关联数据需要同步更新
- **当前状态**：
  - LeadDetail 中已有部分同步逻辑（`saveEdit` 函数）
  - Leads.tsx 中也有同步逻辑（`handleUpdate` 函数）
- **待确认**：是否所有关联模块都已正确同步
- **涉及文件**：
  - [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx#L590-L622) - `saveEdit` 同步逻辑
  - [Leads.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/Leads.tsx#L573-L618) - `handleUpdate` 同步逻辑

### 6.6 付款阶段 - 增加收款按钮
- **问题描述**：付款阶段列表后面没有快捷收款入口
- **优化方案**：每个付款阶段后面增加「收款」按钮，点击直接新增该阶段的收款记录
- **涉及文件**：
  - [ContractDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/ContractDetail.tsx) - 付款阶段展示区域

---

## 七、财务管理模块

### 7.1 按钮样式统一
- **问题描述**：新增报价、新增收款、新增支出按钮样式不统一
- **优化方案**：统一使用黑底白字按钮样式
- **涉及文件**：
  - [ContractDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/ContractDetail.tsx)
  - [Receivable.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/Receivable.tsx)
  - [Expense.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/Expense.tsx)
  - [Income.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/Income.tsx)

### 7.2 标题字体大小统一
- **问题描述**：报价记录、收款记录、支出记录这几个同级标题字体大小不一致
- **优化方案**：统一为相同字体大小
- **涉及文件**：
  - [ContractDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/ContractDetail.tsx)

### 7.3 收款状态显示修复
- **问题描述**：合同金额为0时，收款进度显示为「已收齐」，但实际并没有收款
- **原因分析**：`progress = receivedAmount / contractAmount`，当合同金额为0时，进度为 Infinity 或 NaN，判断 `p >= 1` 可能误判
- **优化方案**：合同金额为0时，状态显示为「未设置」或「待设置」，不显示已收齐
- **涉及文件**：
  - [Receivable.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/Receivable.tsx#L93-L117) - 状态渲染逻辑
  - [ContractDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/ContractDetail.tsx) - 合同详情收款进度

### 7.4 报销提交 - 返回路径优化
- **问题描述**：提交报销记录后返回到费用报销列表页，而不是返回到来源页面
- **优化方案**：记录打开时的来源页面，提交后返回来源页面
- **涉及文件**：
  - [Reimbursement.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/Reimbursement.tsx)
- **当前状态**：已通过 `location.state` 的 `from` 字段记录来源，但提交后可能未正确使用

---

## 八、优化范围分类

> 根据「仅移动端改UI」vs「移动端和电脑端同步改」进行分类

### A. 仅移动端改 UI（电脑端保持不变）

| 编号 | 问题 | 说明 |
|------|------|------|
| 1.1 | 新增客户表单 - 评级/类型/来源选择器 | 电脑端下拉菜单正常，仅移动端改底部抽屉 |
| 2.2 | 跟进记录 - 左滑编辑/删除 | 电脑端已有 hover 显示按钮，仅移动端缺手势 |
| 3.1 | 节点管理弹窗 - 布局优化 | 电脑端布局正常，仅移动端节点名显示不全、按钮出框、完成按钮换行 |
| 3.3 | 编辑计划时间 - 日期选择器 | 电脑端弹窗正常，仅移动端改底部抽屉 |
| 3.5 | 节点操作按钮位置调整 | 电脑端保留文字按钮，仅移动端移到右上角简化为图标 |
| 6.3 | 合同详情页 - 响应式布局重构 | 电脑端布局正常，仅移动端混乱需重构 |
| 6.3 | 合同详情页 - 移动端隐藏导出功能 | 电脑端保留导出按钮，仅移动端不显示 |

**共 7 项**

### B. 移动端和电脑端同步改逻辑

| 编号 | 问题 | 说明 |
|------|------|------|
| 1.2 | 签单人默认当前用户 | 两端签单弹窗都需默认填充当前登录用户 |
| 2.1 | 新增跟进移除跟进类型 | 用户明确说「移动端和电脑都不要」，是业务逻辑改动 |
| 3.2 | 节点管理关闭提示逻辑 | 点击完成直接关闭（不弹提示），两端逻辑一致 |
| 3.4 | 开始节点校验计划时间 | 未设置计划时间提示用户，两端都需校验 |
| 3.6 | 添加节点/节点管理入口合并 | 功能重复，两端都只保留一个入口 |
| 4.1 | 文件下载功能修复 | 核心功能 bug，两端下载逻辑都要修复 |
| 5.1 | 主材清单分享移除已签单限制 | 业务逻辑改动，两端分享条件同步调整 |
| 5.2 | 主材区域自定义无反应 | 功能 bug，两端自定义逻辑都要修复 |
| 6.1 | 新建合同校验已签单状态 | 业务逻辑，两端新建前都要校验提醒 |
| 6.2 | 合同入口显示逻辑 | 已建合同后显示「合同详情」，两端按钮逻辑一致 |
| 6.4 | 合同编辑客户信息只读 | 两端编辑时客户字段都设为只读 |
| 6.5 | 客户信息同步机制 | 数据同步逻辑，两端都需确保正确同步 |
| 7.1 | 按钮样式统一（黑底白字） | 新增报价/收款/支出按钮，两端 UI 样式都要统一 |
| 7.2 | 标题字体大小统一 | 报价/收款/支出记录标题，两端字体都统一 |
| 7.3 | 收款状态显示修复 | 合同金额为0时的状态判断，两端逻辑修复 |
| 7.4 | 报销提交返回路径优化 | 提交后返回来源页，两端导航逻辑一致 |

**共 15 项**

### C. 移动端和电脑端同步改 UI

| 编号 | 问题 | 说明 |
|------|------|------|
| 6.6 | 付款阶段增加收款按钮 | 每个付款阶段后加收款入口，两端 UI 都要加 |

**共 1 项**

### 分类统计

| 分类 | 数量 | 特点 |
|------|------|------|
| 仅移动端改 UI | 7 | 电脑端已正常，只需适配移动端交互 |
| 同步改逻辑 | 15 | 业务规则或功能 bug，两端逻辑需统一 |
| 同步改 UI | 1 | 新增 UI 元素，两端都要添加 |

---

## 九、优化优先级建议

### 高优先级（影响核心功能或用户体验）
1. 文件下载功能修复
2. 主材区域自定义无反应问题
3. 收款状态显示修复（金额为0时误显示已收齐）
4. 设计进度 - 开始节点计划时间校验
5. 合同详情页响应式重构

### 中优先级（体验优化）
6. 跟进记录移动端左滑操作
7. 新增跟进移除跟进类型
8. 节点管理弹窗移动端布局优化
9. 付款阶段增加收款按钮
10. 新增客户表单移动端底部抽屉

### 低优先级（细节优化）
11. 按钮样式统一（黑底白字）
12. 标题字体大小统一
13. 节点操作按钮简化与位置调整
14. 添加入口合并
15. 关闭提示逻辑修正
16. 编辑计划时间移动端底部抽屉
17. 主材清单分享移除已签单限制
18. 新建合同已签单状态校验
19. 合同入口显示逻辑优化
20. 合同编辑客户信息只读
21. 签单人默认当前用户
22. 报销提交返回路径优化
23. 移动端移除导出功能

---

## 十、涉及主要文件清单

| 文件 | 功能模块 |
|------|----------|
| [Leads.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/Leads.tsx) | 客户列表、新建/编辑客户 |
| [LeadDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/LeadDetail.tsx) | 客户详情、跟进、设计进度、主材、文件 |
| [ContractDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/ContractDetail.tsx) | 合同详情、收款、支出、报价 |
| [ContractDrawer.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/components/ContractDrawer.tsx) | 新建合同抽屉 |
| [Receivable.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/Receivable.tsx) | 应收账款列表 |
| [Reimbursement.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/Reimbursement.tsx) | 报销管理 |
| [cloudStorage.ts](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/utils/cloudStorage.ts) | 云存储上传下载 |
| [BottomDrawer.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/components/BottomDrawer.tsx) | 底部抽屉组件 |
| [Select.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/components/Select.tsx) | 选择器组件 |
| [ProjectBizDetail.tsx](file:///e:/XIN%20Lab/PNZJ/CM1.0-main-local-avatar-preview/ERP/src/pages/ProjectBizDetail.tsx) | 工地详情 |
