# 组织者录入报名模式

版本：v1.2  
状态：纳入首版

## 规则

- 球局创建时选择 `WECHAT_SELF_SERVICE` 或 `ORGANIZER_MANAGED`。
- 微信自主报名沿用个人登录、正式区和候补区流程。
- 组织者录入模式由组织者自由填写球局内编号、昵称、性别和可选水平。
- 编号在同一球局内大小写不敏感唯一，允许数字、字母和中文等可见字符，长度 1～20。
- 昵称长度 1～20；性别仍按已确认规则必填；水平选填。
- 组织者录入的人员可以没有微信 `userId`。
- 系统为每人生成不可变 `participantId`；编号和昵称是可修改展示资料，不能作为比赛关联主键。
- 两种来源的参赛者进入对阵后使用完全相同的 `participantId`、比分和排名逻辑。
- 首版同一球局只选择一种报名模式，避免名额和编号的所有权冲突。

## 数据变化

- `events.registration_mode`: `WECHAT_SELF_SERVICE/ORGANIZER_MANAGED`。
- `event_participants.source`: `WECHAT_SELF_SERVICE/ORGANIZER_ENTRY`。
- `event_participants.participant_number`: 球局内可读编号。
- 组织者模式下 `event_participants.user_id` 允许为空。
- 唯一索引：`event_id + lower(participant_number)`，仅对未删除参赛者生效。

## 权限

- 组织者录入模式下只有组织者可以新增、修改、删除和排序人员。
- 普通微信用户只能查看组织者允许公开的名单，不能自行占位。
- 生成赛程后修改编号或昵称不影响对阵；删除/退出人员仍走重排预览。

