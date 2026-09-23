import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gauge, Settings, Sun, Moon } from 'lucide-react';
import { useConfigStore } from '../../stores/useConfigStore';
import { isLinux } from '../../utils/env';
import LogoIcon from '../../../src-tauri/icons/icon.png';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '../ui/tooltip';
import { Button } from '../ui/button';

export function Sidebar() {
    const { t } = useTranslation();
    const location = useLocation();
    const { config, saveConfig } = useConfigStore();

    const isCurrentActive = (path: string) => {
        if (path === '/') {
            return location.pathname === '/' || location.pathname === '/accounts';
        }
        return location.pathname.startsWith(path);
    };

    const toggleTheme = async (event: React.MouseEvent<HTMLButtonElement>) => {
        if (!config) return;
        const newTheme = config.theme === 'light' ? 'dark' : 'light';

        if ('startViewTransition' in document && !isLinux()) {
            const x = event.clientX;
            const y = event.clientY;
            const endRadius = Math.hypot(
                Math.max(x, window.innerWidth - x),
                Math.max(y, window.innerHeight - y)
            );

            // @ts-ignore
            const transition = document.startViewTransition(async () => {
                saveConfig({
                    ...config,
                    theme: newTheme,
                    language: config.language
                }, true);
            });

            transition.ready.then(() => {
                const isDarkMode = newTheme === 'dark';
                const clipPath = isDarkMode
                    ? [`circle(${endRadius}px at ${x}px ${y}px)`, `circle(0px at ${x}px ${y}px)`]
                    : [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`];

                document.documentElement.animate(
                    { clipPath },
                    {
                        duration: 400,
                        easing: 'ease-in-out',
                        fill: 'forwards',
                        pseudoElement: isDarkMode ? '::view-transition-old(root)' : '::view-transition-new(root)'
                    }
                );
            });
        } else {
            await saveConfig({
                ...config,
                theme: newTheme,
                language: config.language
            }, true);
        }
    };

    return (
        <TooltipProvider delayDuration={200}>
            <aside className="w-20 shrink-0 h-full border-r border-slate-800 bg-slate-950 text-white flex flex-col items-center py-4 justify-between z-30 select-none">

                {/* 顶部区域：macOS 交通灯留白 + 品牌 Logo + 主导航 */}
                <div className="flex flex-col items-center gap-5 w-full pt-6 sm:pt-7">
                    {/* Logo */}
                    <Link
                        to="/"
                        className="w-10 h-10 rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all p-1"
                        title={t('common.app_name', 'AMT')}
                    >
                        <img
                            src={LogoIcon}
                            alt="Antigravity Logo"
                            className="w-8 h-8 object-contain cursor-pointer"
                            draggable="false"
                        />
                    </Link>

                    {/* 垂直导航菜单 */}
                    <nav className="flex flex-col items-center gap-2.5 w-full px-2 mt-1">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button asChild size="icon" variant="ghost" className={isCurrentActive('/') ? 'h-11 w-11 rounded-xl bg-white/10 text-emerald-300 hover:bg-white/15 hover:text-emerald-200' : 'h-11 w-11 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white'}>
                                    <Link to="/">
                                        <Gauge className="w-5 h-5" />
                                    </Link>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                                {t('nav.accounts', '接力工作台')}
                            </TooltipContent>
                        </Tooltip>
                    </nav>
                </div>

                {/* 底部功能区：主题切换 + 系统设置 */}
                <div className="flex flex-col items-center gap-2.5 w-full px-2 pb-2">
                    {/* 主题切换 */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={toggleTheme}
                                className="h-11 w-11 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white active:scale-95"
                                title={config?.theme === 'dark' ? t('nav.theme_to_light') : t('nav.theme_to_dark')}
                            >
                                {config?.theme === 'dark' ? (
                                    <Sun className="w-4 h-4 text-amber-400" />
                                ) : (
                                    <Moon className="w-4 h-4 text-slate-600" />
                                )}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                            {config?.theme === 'dark' ? t('nav.theme_to_light', '浅色模式') : t('nav.theme_to_dark', '深色模式')}
                        </TooltipContent>
                    </Tooltip>

                    {/* 系统设置 */}
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button asChild size="icon" variant="ghost" className={isCurrentActive('/settings') ? 'h-11 w-11 rounded-xl bg-white/10 text-emerald-300 hover:bg-white/15 hover:text-emerald-200' : 'h-11 w-11 rounded-xl text-slate-400 hover:bg-white/10 hover:text-white'}>
                                <Link to="/settings">
                                    <Settings className="w-5 h-5" />
                                </Link>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                            {t('nav.settings', '系统设置')}
                        </TooltipContent>
                    </Tooltip>
                </div>

            </aside>
        </TooltipProvider>
    );
}

export default Sidebar;
