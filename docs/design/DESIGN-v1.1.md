# 「转转接龙」设计基线 v1.1

v1.1 在 v1.0 的基础上正式加入单打功能。首版支持自由转单打与自由转双打，具体球局只能选择其中一种形式。

## 阅读顺序

1. [产品需求与业务规则](./01-product-requirements.md)
2. [页面、交互与状态机](./02-pages-and-flows.md)
3. [系统架构与数据设计](./03-architecture-and-data.md)
4. [REST 与 WebSocket 接口](./04-api-contract.md)
5. [自由转算法规格](./05-rotation-algorithm.md)
6. [权限、安全与异常处理](./06-security-and-reliability.md)
7. [测试、验收与开发拆分](./07-test-and-delivery.md)
8. [品牌与界面视觉规范](./08-visual-design.md)
9. [单打功能模块（v1.1 增量规范）](./09-singles-module.md)

## 版本解释

- v1.0 文档描述了双打完整闭环。
- v1.1 单打模块将每场人数、组队规则和算法公式泛化。
- v1.0 与单打模块冲突时，以单打模块为准。
- 报名、计分、排名、裁判、审计、重排和安全规则由两种比赛形式共享。

