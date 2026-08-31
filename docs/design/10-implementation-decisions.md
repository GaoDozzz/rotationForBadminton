# 实现期决策记录

## ADR-001：小程序资源更新接口使用 PUT

日期：2026-07-31  
状态：已采用

微信小程序 `wx.request` 的当前方法类型不包含 PATCH。为避免客户端使用未受支持的方法，面向小程序的资源整体更新接口统一使用 PUT，动作型接口使用 POST。

本决策覆盖 v1.0 接口设计文档中 PATCH 的写法。后续实现球局、参赛者和已确认比分更新接口时，分别使用：

- `PUT /api/v1/events/:eventId`
- `PUT /api/v1/events/:eventId/participants/:participantId`
- `PUT /api/v1/matches/:matchId/confirmed-score`

服务端仍通过资源版本号或 `If-Match` 实现乐观锁，不因方法变化而降低并发保护。

