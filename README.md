# rotationForBadminton（转转接龙）

微信原生小程序 + Node.js/NestJS 后端的羽毛球自由转组局工具，支持单打、双打和严格混双、组织者录入/微信报名、自动轮转、计分与积分排名。

## 本次更新（2026-10-11）

本次版本包含在线/离线完整对阵文字导入、对阵长图与微信好友分享、基于排名页签的排名图、统一 31 分上限，以及重置比分后调整人员的修复。更新内容、兼容性和验证记录见 [更新日志](CHANGELOG.md)。

## 项目结构

- `miniprogram/`：微信原生小程序
- `server/`：NestJS API 服务
- `packages/contracts/`：前后端共享契约
- `packages/game-core/`：轮转、计分与排名算法
- `infrastructure/`：PostgreSQL、Redis 初始化与管理脚本
- `docs/design/`：产品、架构、接口及安全设计

## 本地启动

1. 安装 Node.js、pnpm、Docker Desktop 和微信开发者工具。
   在仓库根目录运行 `pnpm install` 安装项目依赖。
2. 复制 `infrastructure/.env.example` 为 `infrastructure/.env.local`，生成并填写本地密码。
3. 根据 `.env.example` 配置后端环境变量。应用连接使用 `zzjl_app`，迁移使用 `zzjl_migrator`，不要使用数据库管理员账号运行应用。
4. 运行 `docker compose up -d`，再运行 `.\scripts\start-backend.ps1`。
5. 复制 `miniprogram/project.config.json.example` 为 `miniprogram/project.config.json`，填入自己的微信小程序 AppID，然后在微信开发者工具中导入 `miniprogram` 目录。

默认本地端口：API `3000`、PostgreSQL `55432`、Redis `6379`。真机调试时需将 `miniprogram/miniprogram/config/environment.ts` 的 API 地址改为电脑当前局域网 IPv4，并确保手机和电脑位于同一局域网。

本地调试遇到 `request:fail url not in domain list` 时，检查开发者工具本地设置及私有配置是否开启合法域名校验。关闭校验只用于本地开发；正式上线需使用 HTTPS 服务地址并在微信后台配置 request 合法域名。离线导入不请求服务器，也不依赖域名配置。

## 离线模式

首页检测到后台不可用时会显示“进入离线模式”。离线模式支持组织者录入、单打/双打/混双排阵、计分、排名、人员调整、重排以及文字/图片分享；微信自主报名和球局入口链接分享不可用。

离线球局、离线新建草稿及离线草稿修改只保存在当前小程序内存中。选择“退出离线并重新连接”会先清空这些临时数据，再重新进入首页并尝试连接服务器；设备中原有的持久草稿不会被覆盖或删除。

## 分享与文字导入

新增页面后，先运行 `pnpm --filter @zzjl/miniprogram build`，再在微信开发者工具中重新编译和真机调试。该命令会生成页面及全部服务依赖的 JavaScript，并检查 `app.json` 中的页面文件是否齐全；生成的 JS 不纳入 Git。持续编辑 TypeScript 时可运行 `pnpm --filter @zzjl/miniprogram build:watch`。

在球局详情的对阵标签页点击“分享”，选择“复制完整对阵（可导入）”。该文字包含全部参赛人员、比赛设置、原对阵、比分和状态，不受当前页面筛选影响。“复制当前筛选对阵”和图片仅用于展示，不作为完整导入数据。

在首页点击“导入球局”，粘贴完整文字、预览并确认。名称重复时会提示填写新名称，也可取消。导入创建独立的组织者录入球局，保留已退出人员和原比赛记录，积分重新计算；不会复用来源球局的 ID、组织者身份或报名链接。旧版缺少完整人员信息的分享文字不支持导入。

“分享当前对阵图”按当前筛选展示全部场次，优先生成完整长图；实际画布随内容增高，避免固定高度裁切。超长内容完整分页，并依次打开微信原生图片分享菜单，可直接发送好友；取消分页分享可预览所有图片。排名图直接使用“排名”页签的数据及排序，展示名次、昵称、积分、场数、胜负、得失分。

比分滚轮统一提供 0～31 分；11/15/21 分制延长分领先两分获胜、31 分封顶，31 分制仍为先到 31 分获胜。在线、离线及导入导出同步校验。

在线导入使用 PostgreSQL 事务一次保存，离线导入保存在本次内存会话。对阵文字契约维护于 `packages/contracts/src/event-transfer.ts`，小程序运行时镜像为 `miniprogram/miniprogram/shared/event-transfer.ts`，测试检查两者一致。

## 隐私与安全

以下内容不会纳入 Git：真实 `.env`、数据库和 Redis 连接信息、Redis ACL、微信 AppID 配置、开发者工具私有配置以及第三方参考截图。仓库中的所有账号密码均为占位符，使用前必须替换。

## 验证

```powershell
pnpm test
pnpm build
```
