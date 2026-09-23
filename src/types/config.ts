export interface UpstreamProxyConfig {
    enabled: boolean;
    url: string;
}

export interface ScheduledWarmupConfig {
    enabled: boolean;
    monitored_models: string[];
}

export interface AppConfig {
    language: 'zh' | 'en';
    theme: string;
    auto_refresh: boolean;
    refresh_interval: number;
    auto_sync: boolean;
    sync_interval: number;
    default_export_path?: string;
    antigravity_executable?: string; // 手动指定的反重力程序路径
    antigravity_ide_executable?: string; // 旧配置：用于保护独立 IDE 进程，不作为切换目标
    antigravity_args?: string[]; // Antigravity 启动参数
    auto_launch?: boolean; // 开机自动启动
    auto_check_update?: boolean; // 自动检查更新
    update_check_interval?: number; // 更新检查间隔（小时）
    scheduled_warmup: ScheduledWarmupConfig;
    network_proxy: UpstreamProxyConfig;
}
