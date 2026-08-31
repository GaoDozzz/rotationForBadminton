# rotationForBadminton（转转接龙）

微信原生小程序 + Node.js/NestJS 后端的羽毛球自由转组局工具，支持单打、双打和严格混双、组织者录入/微信报名、自动轮转、计分与积分排名。

## 项目结构

- `miniprogram/`：微信原生小程序
- `server/`：NestJS API 服务
- `packages/contracts/`：前后端共享契约
- `packages/game-core/`：轮转、计分与排名算法
- `infrastructure/`：PostgreSQL、Redis 初始化与管理脚本
- `docs/design/`：产品、架构、接口及安全设计

## 本地启动

1. 安装 Node.js、pnpm、Docker Desktop 和微信开发者工具。
2. 复制 `infrastructure/.env.example` 为 `infrastructure/.env.local`，生成并填写本地密码。
3. 根据 `.env.example` 配置后端环境变量。应用连接使用 `zzjl_app`，迁移使用 `zzjl_migrator`，不要使用数据库管理员账号运行应用。
4. 运行 `docker compose up -d`，再运行 `.\scripts\start-backend.ps1`。
5. 复制 `miniprogram/project.config.json.example` 为 `miniprogram/project.config.json`，填入自己的微信小程序 AppID，然后在微信开发者工具中导入 `miniprogram` 目录。

默认本地端口：API `3000`、PostgreSQL `55432`、Redis `6379`。真机调试时需将 `miniprogram/miniprogram/config/environment.ts` 的 API 地址改为电脑当前局域网 IPv4，并确保手机和电脑位于同一局域网。

## 离线模式

首页检测到后台不可用时会显示“进入离线模式”。离线模式支持组织者录入、单打/双打/混双排阵、计分、排名、人员调整、重排以及文字/图片分享；微信自主报名和球局入口链接分享不可用。

离线球局、离线新建草稿及离线草稿修改只保存在当前小程序内存中。选择“退出离线并重新连接”会先清空这些临时数据，再重新进入首页并尝试连接服务器；设备中原有的持久草稿不会被覆盖或删除。

## 隐私与安全

以下内容不会纳入 Git：真实 `.env`、数据库和 Redis 连接信息、Redis ACL、微信 AppID 配置、开发者工具私有配置以及第三方参考截图。仓库中的所有账号密码均为占位符，使用前必须替换。

## 验证

```powershell
pnpm test
pnpm build
```
