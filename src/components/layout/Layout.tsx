import { Outlet } from 'react-router-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import Sidebar from './Sidebar';
import BackgroundTaskRunner from '../common/BackgroundTaskRunner';
import ToastContainer from '../common/ToastContainer';
import { useViewStore } from '../../stores/useViewStore';
import MiniView from './MiniView';
import { useEffect } from 'react';
import { isTauri } from '../../utils/env';
import { ensureFullViewState } from '../../utils/windowManager';

function Layout() {
    const { isMiniView } = useViewStore();

    // Ensure correct window state when in Full View (not Mini View)
    useEffect(() => {
        if (!isMiniView && isTauri()) {
            ensureFullViewState();
        }
    }, [isMiniView]);

    if (isMiniView) {
        return (
            <>
                <BackgroundTaskRunner />
                <ToastContainer />
                <MiniView />
            </>
        );
    }

    return (
        <div className="h-screen w-screen flex flex-row bg-background text-foreground overflow-hidden">
            {/* 全局窗口拖拽区域 */}
            <div
                className="fixed left-20 right-0 top-0 z-40 h-8 cursor-default select-none"
                aria-hidden="true"
                onMouseDown={(event) => {
                    if (event.button === 0) {
                        void getCurrentWindow().startDragging();
                    }
                }}
            />
            <BackgroundTaskRunner />
            <ToastContainer />
            <Sidebar />
            <main className="flex-1 h-full overflow-hidden flex flex-col relative bg-muted/20">
                <Outlet />
            </main>
        </div>
    );
}

export default Layout;
