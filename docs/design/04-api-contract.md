# REST 与 WebSocket 接口

## 1. 通用约定

- Base URL：`/api/v1`。
- JSON 字段使用 camelCase，数据库字段使用 snake_case。
- 鉴权：`Authorization: Bearer <accessToken>`。
- 关键写操作要求 `Idempotency-Key`。
- 乐观锁资源要求请求体携带 `version` 或 `If-Match`。
- 每个响应携带 `requestId`，便于日志关联。

成功响应：

```json
{
  "data": {},
  "requestId": "01K..."
}
```

错误响应：

```json
{
  "error": {
    "code": "EVENT_VERSION_CONFLICT",
    "message": "球局状态已变化，请刷新后重试",
    "details": {}
  },
  "requestId": "01K..."
}
```

## 2. 认证和用户

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/wechat/login` | 使用 `wx.login` code 登录，返回业务 Token |
| POST | `/auth/refresh` | 轮换 Access Token |
| POST | `/auth/logout` | 使 Refresh Token 失效 |
| GET | `/users/me` | 当前用户资料 |
| PATCH | `/users/me` | 更新昵称、头像、性别、水平 |

微信登录 code 只能使用一次且不得写日志。客户端不直接持有 openid。

## 3. 球局

| 方法 | 路径 | 权限/说明 |
|---|---|---|
| POST | `/events` | 登录用户创建球局 |
| GET | `/events` | 查询我发起/参加/历史球局 |
| GET | `/events/:eventId` | 球局详情及当前用户能力集 |
| PATCH | `/events/:eventId` | 组织者编辑；需要版本号 |
| POST | `/events/:eventId/open-registration` | 打开报名 |
| POST | `/events/:eventId/close-registration` | 截止报名 |
| POST | `/events/:eventId/cancel` | 取消球局，填写原因 |
| POST | `/events/:eventId/finish` | 校验无未处理比赛后结束 |

详情响应返回 `capabilities`，例如：

```json
{
  "capabilities": {
    "canRegister": true,
    "canCancelRegistration": false,
    "canManageParticipants": false,
    "canGenerateSchedule": false,
    "canSubmitScore": false
  }
}
```

客户端可用它控制按钮展示，但服务端仍须逐项鉴权。

## 4. 报名和名单

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/events/:eventId/registrations` | 本人报名；幂等 |
| DELETE | `/events/:eventId/registrations/me` | 本人取消；幂等 |
| POST | `/events/:eventId/participants` | 组织者代报名 |
| GET | `/events/:eventId/participants` | 正式、候补、历史名单 |
| PATCH | `/events/:eventId/participants/:participantId` | 修改球局内资料/出勤状态 |
| POST | `/events/:eventId/participants/:participantId/promote` | 手工转正 |
| POST | `/events/:eventId/participants/:participantId/remove` | 组织者移除 |
| POST | `/events/:eventId/participants/reorder` | 调整展示/抽签顺序 |

报名响应明确返回：

```json
{
  "registrationStatus": "WAITLISTED",
  "queuePosition": 2,
  "eventVersion": 12
}
```

## 5. 赛程

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/events/:eventId/schedules/generate` | 生成预览版本 |
| GET | `/events/:eventId/schedules/:versionId` | 获取赛程和公平度指标 |
| POST | `/events/:eventId/schedules/:versionId/regenerate` | 使用新种子重生成 |
| PATCH | `/events/:eventId/schedules/:versionId/matches/:matchId` | 调整未激活赛程中的球员/场地 |
| POST | `/events/:eventId/schedules/:versionId/activate` | 激活赛程并开赛 |
| POST | `/events/:eventId/schedules/reflow-preview` | 根据人员变化生成重排预览 |
| POST | `/events/:eventId/schedules/:versionId/confirm-reflow` | 确认新版本 |

生成请求示例：

```json
{
  "courtLabels": ["1号场", "2号场"],
  "targetMatchesPerPlayer": 8,
  "scoreTo": 21,
  "finishRule": "DEUCE_WITH_CAP",
  "scoreCap": 30,
  "constraints": {
    "avoidRepeatPartner": true,
    "avoidRepeatOpponent": true,
    "avoidConsecutivePlay": true,
    "genderPolicy": "PREFER_MIXED",
    "forbidMensVsWomens": false
  },
  "seed": "optional-client-visible-seed"
}
```

重排确认必须携带 `baseActiveVersionId` 和事件版本；任一不匹配返回 `409 SCHEDULE_STALE_PREVIEW`。

## 6. 比赛和裁判

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/events/:eventId/matches` | 按状态、轮次、本人过滤 |
| GET | `/matches/:matchId` | 比赛详情和可执行动作 |
| POST | `/matches/:matchId/start` | 组织者或获授权角色开赛 |
| POST | `/matches/:matchId/referee/claim` | 空闲参赛者认领裁判 |
| PUT | `/matches/:matchId/referee` | 组织者分配/更换裁判 |
| DELETE | `/matches/:matchId/referee/me` | 裁判取消认领 |
| POST | `/matches/:matchId/walkover` | 组织者记录弃权 |

## 7. 比分

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/matches/:matchId/score-submissions` | 提交待确认比分；幂等 |
| POST | `/matches/:matchId/score-submissions/:id/confirm` | 对方球员或组织者确认 |
| POST | `/matches/:matchId/score-submissions/:id/reject` | 驳回并填写原因 |
| PATCH | `/matches/:matchId/confirmed-score` | 组织者修改已确认比分 |
| GET | `/matches/:matchId/score-history` | 比分提交和修改历史 |

比分提交示例：

```json
{
  "teamAScore": 21,
  "teamBScore": 15,
  "scoreVersion": 0
}
```

修改确认比分必须包含：

```json
{
  "teamAScore": 20,
  "teamBScore": 22,
  "reason": "原比分双方录反",
  "scoreVersion": 1
}
```

## 8. 排名和复盘

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/events/:eventId/rankings` | 当前排名和排名版本 |
| GET | `/events/:eventId/participants/:participantId/stats` | 个人比赛与搭档统计 |
| GET | `/events/:eventId/review` | 赛后汇总、公平度和全部赛果 |

排名响应包含 `rankingVersion` 和 `basedOnScoreVersion`，客户端可判断比分变化后的排名是否已刷新。

## 9. WebSocket

连接：`wss://<domain>/ws?eventId=<id>`，握手阶段携带短期访问 Token。服务端鉴权后加入球局房间。

消息统一格式：

```json
{
  "event": "match.scoreConfirmed",
  "eventId": "...",
  "sequence": 1024,
  "occurredAt": "2026-07-31T13:00:00Z",
  "payload": {}
}
```

首版服务端事件：

- `event.updated`
- `registration.changed`
- `participant.changed`
- `schedule.previewCreated`
- `schedule.activated`
- `match.started`
- `match.scorePending`
- `match.scoreConfirmed`
- `match.refereeChanged`
- `ranking.updated`
- `event.finished`

客户端保存最后一个 `sequence`；重连时提交 `lastSequence`。事件缺失或已过保留期时，服务端要求客户端重新拉取快照。

## 10. 标准错误码

- `AUTH_REQUIRED`, `TOKEN_EXPIRED`
- `PROFILE_INCOMPLETE`
- `EVENT_NOT_FOUND`, `EVENT_STATE_INVALID`
- `EVENT_VERSION_CONFLICT`
- `REGISTRATION_CLOSED`, `REGISTRATION_DUPLICATED`
- `EVENT_FULL`, `WAITLIST_FULL`
- `CANCELLATION_DEADLINE_PASSED`
- `SCHEDULE_CONSTRAINT_UNSATISFIED`
- `SCHEDULE_STALE_PREVIEW`
- `MATCH_STATE_INVALID`
- `SCORE_INVALID`, `SCORE_VERSION_CONFLICT`
- `FORBIDDEN`, `RATE_LIMITED`

