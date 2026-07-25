# 品诺筑家整装管理后台

用于维护品诺筑家微信小程序及官网的案例、客户、品牌资料、
水印配置、筛选标签和互动数据。

## 本地运行

```bash
npm install
npm run dev -- -p 4173
```

打开：

`http://localhost:4173/studio-admin`

本机地址默认连接 CloudBase 真实数据。需要查看纯演示数据时，在地址后增加
`?preview=1`。非本地域名不会启用演示登录，必须通过 CloudBase 云函数验证。

官网、小程序与管理后台的公开案例、公司资料统一通过
`pnzjAdminApi/getPublicContent` 读取。云函数未部署或网络不可用时，官网和小程序
才会回退到内置占位内容。

## 构建与检查

```bash
npm run build
npm test
```

生产构建输出到 `dist/`。

## 云开发

- 环境：`cloud1-8grodf5s3006f004`
- 云函数：`pnzjAdminApi`
- 云函数源码：`../cloudfunctions/pnzjAdminApi`
- 案例、配置等集合使用 `pnzj_` 前缀
- 客户咨询直接写入 ERP 现有 `leads`，并在 `followUps` 生成来源记录
- 后台客户页读取同一份 ERP 客户数据，不再创建独立线索库
- 客户编号复用 ERP 格式，并通过 `system_configs` 事务计数防止重复

完整配置步骤见 [CLOUDBASE_SETUP.md](./CLOUDBASE_SETUP.md)。

## 正式地址

计划部署为：

- 官网及案例浏览：`https://pinnuozhujia.cn/`
- ERP：`https://pinnuozhujia.cn/erp`
- 管理后台：`https://pinnuozhujia.cn/studio-admin`

部署前需要先在云开发控制台完成环境共享、集合创建、云函数部署、Web 匿名认证和安全域名配置。
