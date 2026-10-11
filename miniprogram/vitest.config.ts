import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 构建后 JS 与 TS 并存；测试必须统一加载源码，避免 CJS require 与 Vite
  // 分别创建两份离线内存仓库，导致测试看见的数据与页面使用的数据不一致。
  resolve: { extensions: ['.ts', '.tsx', '.mts', '.mjs', '.js', '.cjs', '.json'] },
  test: { include: ['miniprogram/**/*.test.ts', 'miniprogram/**/*.spec.ts'] },
});
