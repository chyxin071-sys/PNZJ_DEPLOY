# 品诺筑家管理后台云开发配置

目标环境：`cloud1-8grodf5s3006f004`

## 环境共享

在 ERP 小程序的云开发控制台中，将环境共享给品诺筑家小程序 AppID：

`wxa11022a25d98180a`

两个小程序必须属于同一微信主体。

## 数据库集合

ERP 源码已确认实际使用 `leads`、`followUps`、`projects`、`quotes`、
`users`、`system_configs` 及各个 `erp_*` 财务集合。
`website_cases`、`website_communities`、`website_designers` 当前没有实际读写，
不作为本项目的数据源。

新建以下集合：

- `pnzj_admins`
- `pnzj_admin_sessions`
- `pnzj_cases`
- `pnzj_site_config`
- `pnzj_watermark_config`
- `pnzj_tags`
- `pnzj_operation_logs`
- `pnzj_analytics_events`

以上新集合统一使用以下安全规则：

```json
{
  "read": false,
  "write": false
}
```

后台和小程序通过云函数读写，客户端不直接操作数据库。已经创建的
`pnzj_analytics_events` 请将临时的 `read/write: true` 改为以上规则，
避免客户端伪造浏览、收藏和分享数据。

图片原文件存入云存储，`pnzj_cases` 只保存图片 `fileID`、顺序和说明，
因此不需要额外创建 `pnzj_case_images`。

客户咨询不创建独立集合，直接写入 ERP 已有的 `leads`，并在 ERP 的 `followUps` 中生成一条“小程序咨询”系统记录。
客户编号沿用 ERP 的 `P + 年份 + 三位序号` 格式。为了避免 ERP、网页后台和
小程序同时新增客户时产生重复编号，年度计数器复用 ERP 已有的
`system_configs` 集合并由云函数事务更新，不创建 `pnzj_sequences`。

ERP 现有集合继续保留当前权限规则；新增接口只通过云函数访问，不需要把
`leads`、`followUps` 或 `system_configs` 对客户端开放。

## 数据归属

- 案例文字、封面、案例图顺序、展示位：`pnzj_cases`
- 风格、户型、空间、小区等标签：`pnzj_tags`
- 公司介绍、地址、营业时间、首页内容：`pnzj_site_config`
- 图片或文字水印配置：`pnzj_watermark_config`
- 管理员账号和登录会话：`pnzj_admins`、`pnzj_admin_sessions`
- 浏览、收藏、分享、咨询事件：`pnzj_analytics_events`
- 小程序客户及状态：ERP `leads`
- 客户咨询记录：ERP `followUps`

## 管理员权限

- 超级管理员：全部功能，包括管理员和系统设置。
- 管理员：案例、客户、统计、通知和标签；只能编辑或删除自己上传的案例。
- 修改管理员账号、重置密码、停用账号或修改本人密码后，相关登录会话会立即失效。
- 新增管理员和“重置密码”操作的临时密码均为 `888888`，登录后可以自行修改，不强制首次修改。

## 云函数

将项目根目录 `cloudfunctions/pnzjAdminApi` 上传并部署到该环境，选择“云端安装依赖”。

如果更换了小程序 AppID，必须重新确认三处一致：

1. `project.config.json` 中的 `appid` 是当前企业小程序 AppID。
2. 云开发环境 `cloud1-8grodf5s3006f004` 已共享给当前小程序。
3. 云托管服务环境变量中的 `WECHAT_APPID`、`WECHAT_APPSECRET` 使用当前小程序对应的值。

共享云环境下，`pnzjAdminApi` 云函数也必须配置以下环境变量（不要写入源码）：

- `WECHAT_APPID=wxa11022a25d98180a`
- `WECHAT_APPSECRET=案例库小程序对应的 AppSecret`

手机号授权 code 由案例库小程序生成，云函数会使用这组凭证调用微信
`getuserphonenumber` 接口；不能使用共享云环境所属小程序的 AppID/Secret 兑换。

否则咨询表单点击“一键获取手机号”后，云函数会在
`openapi.phonenumber.getPhoneNumber` 处返回 `invalid appid`。代码已经支持
手动手机号兜底，但要使用微信手机号快捷授权，上面三项必须一致。

该云函数同时提供公开只读动作 `getPublicContent`，官网和小程序使用它读取已上架案例、
品牌资料、设计师资料和标签。管理后台保存案例后，只有状态为“已上架”的案例会出现在
官网和小程序；设置新的首页大图时仍应确保只有一个案例的 `homeHero` 为 `true`。

## Web 登录

在云开发控制台的身份认证设置中启用匿名登录，用于建立 Web SDK 到云函数的基础连接。管理员账号和密码仍由 `pnzjAdminApi` 独立校验。

把 `https://pinnuozhujia.cn` 加入 Web 安全域名。

## 部署路径

同一域名最终规划为：

- 官网及案例浏览：`https://pinnuozhujia.cn/`
- ERP：`https://pinnuozhujia.cn/erp`
- 管理后台：`https://pinnuozhujia.cn/studio-admin`

当前采用单个微信云托管服务承载以上三个路径：

1. 代码仓库：`chyxin071-sys/PNZJ_WEB`
2. 分支：`main`
3. 云托管目标目录：`admin-web`
4. Dockerfile：`Dockerfile`
5. 端口：`80`

容器启动命令为 `npm run start`，该命令会启动一个统一入口服务：

- `/` 和 `/studio-admin` 转发给 Web 主站和管理后台。
- `/erp` 返回 ERP 入口页。
- `/assets/erp/*` 返回 ERP 的 JS、CSS 和图片静态资源。

`/erp` 不是单独服务，而是由 `admin-web/public/erp` 和
`admin-web/public/assets/erp` 中的 ERP 静态构建产物提供。
如果 ERP 项目有更新，先在 `admin-web` 目录执行：

```bash
npm run sync:erp
```

该命令会从本机 ERP 项目 `E:\XIN Lab\PNZJ\CM1.0-main-local-avatar-preview\ERP`
重新构建并同步到 `public/erp`，之后再提交并推送 GitHub，云托管流水线即可发布新版 ERP。
