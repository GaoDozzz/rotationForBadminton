export type RuntimeMode = 'ONLINE' | 'OFFLINE';

let runtimeMode: RuntimeMode = 'ONLINE';

/**
 * 运行模式只保存在当前 JavaScript 进程中，不写入 wx Storage。
 * 因此小程序真正重新启动时一定会先尝试在线连接，不会被上一次离线选择“锁住”。
 */
export function getRuntimeMode(): RuntimeMode { return runtimeMode; }
export function isOfflineMode(): boolean { return runtimeMode === 'OFFLINE'; }
export function enterOfflineMode(): void { runtimeMode = 'OFFLINE'; }
export function leaveOfflineMode(): void { runtimeMode = 'ONLINE'; }
