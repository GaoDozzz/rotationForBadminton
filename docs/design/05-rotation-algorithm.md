# 自由转算法规格

## 1. 目标与边界

算法以“人”为单位生成双打赛程，不固定搭档。首版处理 4 人及以上、一个或多个并行场地、任意目标场次数。算法只生成和评估赛程，不读写数据库。

输入、输出均为不可变对象；相同算法版本、输入和随机种子必须产生完全相同的结果。

## 2. 输入

```ts
interface RotationInput {
  algorithmVersion: string;
  seed: string;
  participants: Array<{
    id: string;
    gender: 'MALE' | 'FEMALE';
    level?: number;
    alreadyPlayed?: number;
    active: boolean;
  }>;
  courts: Array<{ id: string; label: string }>;
  targetMatchesPerPlayer: number;
  lockedMatches?: LockedMatch[];
  constraints: {
    avoidRepeatPartner: boolean;
    avoidRepeatOpponent: boolean;
    avoidConsecutivePlay: boolean;
    genderPolicy: 'ANY' | 'PREFER_MIXED' | 'REQUIRE_MIXED';
    forbidMensVsWomens: boolean;
  };
}
```

`lockedMatches` 用于临时退出后的重排，包含已完成和正在进行比赛。这些比赛只参与历史统计，不可修改。

## 3. 场次数分配

设有效人数为 `N`、目标场次数为 `G`：

1. 理想总出场槽位为 `N × G`。
2. 每场需要 4 个槽位，因此比赛数 `M = round(N × G / 4)`。
3. 实际总槽位为 `4 × M`。
4. 将槽位平均分配给所有人，每个人的目标场次数只能是 `floor(4M/N)` 或 `ceil(4M/N)`。
5. 若无法人人恰好打 `G` 场，预览必须明确显示哪些人多一场或少一场，并允许组织者重新抽取这组人员。

示例：10 人、每人目标 8 场，`10×8/4=20` 场，可以精确满足。9 人、每人目标 8 场，理想为 18 场，也可以精确满足；但总槽位 72 平均后每人仍为 8 场。

## 4. 硬约束

任何有效结果都必须满足：

- 每场恰好 4 名不同参赛者。
- 每队恰好 2 人。
- 同一轮同一参赛者最多参加一场。
- 同一轮同一场地最多安排一场。
- 每人的总场次数符合分配目标。
- 非活动、已退出人员不能进入新比赛。
- `REQUIRE_MIXED` 时每队必须一男一女；人员结构无法满足则返回不可满足原因。
- `forbidMensVsWomens` 时不得出现男双对女双。
- 已锁定比赛的球员、场地、顺序和结果不得改变。

硬约束无解时不得偷偷降级，应返回结构化错误和可选建议，例如减少场地、放宽混双要求或调整目标场次。

## 5. 软目标与代价

算法最小化总代价。首版权重作为服务端配置，不开放给普通用户：

| 目标 | 建议权重 | 说明 |
|---|---:|---|
| 场次数偏差 | 10000 | 原则上已由硬约束消除 |
| 同一搭档重复 | 1000 × 超额次数² | 首要公平指标 |
| 同一对手重复 | 150 × 超额次数² | 次于搭档重复 |
| 连续上场 | 80 × 连续长度² | 避免长期霸场 |
| 连续休息 | 70 × 连续长度² | 避免长期等待 |
| 场次时间离散 | 40 | 每人的比赛尽量均匀分布 |
| 混双偏好未满足 | 30 | 仅 `PREFER_MIXED` 生效 |
| 水平差 | 20 | 有水平数据时平衡双方 |

重复搭档和对手按组合计数，不能只统计单个球员总次数。

## 6. 求解策略

首版采用“确定性随机贪心 + 局部搜索”，兼顾速度、可解释性和实现风险：

1. 使用种子初始化可复现伪随机数生成器。
2. 先计算每人的目标场次数和每轮容量。
3. 优先选择剩余目标最多、等待最久的球员组成每轮候选池。
4. 枚举或采样合法的四人组合和分队方式，选择增量代价最低者。
5. 完成初始赛程后，通过交换同轮/跨轮球员、交换搭档、移动比赛进行局部改进。
6. 连续若干轮无改进或达到时间预算时停止。
7. 使用不同派生种子生成多个候选，返回硬约束合法且代价最低的结果。

建议时间预算：常规 4～32 人小于 1 秒，极端配置最多 3 秒。超过预算返回当前最佳合法结果和 `optimizationStoppedByTimeout=true`。

## 7. 轮次构造

- 每轮最多安排 `courtCount` 场。
- 若可上场人数不足 `4 × courtCount`，允许部分场地空闲。
- 轮次数不是简单的 `ceil(M/courtCount)` 唯一目标；为了减少连续上场，可在合理范围内增加轮次并让部分轮次少开场地。
- 前端必须区分“第几轮”和“全局第几场”。

## 8. 公平度指标

每次生成返回：

```ts
interface ScheduleMetrics {
  totalMatches: number;
  totalRounds: number;
  minMatchesPerPlayer: number;
  maxMatchesPerPlayer: number;
  repeatedPartnerPairs: number;
  maxPartnerRepeat: number;
  repeatedOpponentPairs: number;
  maxConsecutivePlay: number;
  maxConsecutiveRest: number;
  mixedTeamRatio?: number;
  levelImbalanceScore?: number;
  totalPenalty: number;
  warnings: string[];
}
```

预览界面至少展示场次数范围、重复搭档、最长连打、最长连休和警告。

## 9. 人工调整

组织者可以在赛程激活前交换两名参赛者。每次调整后算法模块执行：

- 硬约束校验。
- 公平度重新计算。
- 明确显示指标变好或变差。

若违反硬约束，前端不允许保存并展示具体原因。

## 10. 临时退出重排

重排输入分三部分：

- 冻结区：已完成和进行中的比赛。
- 可替换区：尚未开始的比赛。
- 人员变化：退出、暂停、恢复或新增人员。

步骤：

1. 从冻结区统计每人已打场次、搭档、对手和最近上场轮次。
2. 移除退出/暂停人员，重新计算其他人的剩余目标。
3. 只生成未来比赛，并把历史统计带入代价函数。
4. 比较新旧未来赛程，输出受影响人员和比赛。
5. 组织者确认后创建新赛程版本，旧版本标为 `SUPERSEDED`。

重排不得为了追求公平而修改已完成积分。

## 11. 算法测试不变量

对大量随机人数、场地数和目标场次进行属性测试：

- 每场四人且无重复人。
- 同轮一人不重复上场。
- 每人场次数符合目标分配。
- 禁止组合从不出现。
- 相同输入和种子结果一致。
- 重排后所有冻结比赛完全一致。
- 任意正常比分下全体积分总和为零。

