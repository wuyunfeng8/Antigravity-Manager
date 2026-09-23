import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';

import Layout from './components/layout/Layout';
import ThemeManager from './components/common/ThemeManager';
import { lazy, Suspense, useEffect, useState, startTransition } from 'react';
import { useConfigStore } from './stores/useConfigStore';
import { useAccountStore } from './stores/useAccountStore';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { isTauri } from './utils/env';
import { request as invoke } from './utils/request';

const Settings = lazy(() => import('./pages/Settings'));
const Accounts = lazy(() => import('./pages/Accounts'));
const DebugConsole = lazy(() => import('./components/debug/DebugConsole'));
const UpdateNotification = lazy(() => import('./components/UpdateNotification').then((module) => ({ default: module.UpdateNotification })));

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Suspense fallback={null}><Accounts /></Suspense>,
      },
      {
        path: 'accounts',
        element: <Navigate to="/" replace />,
      },
      {
        path: 'settings',
        element: <Suspense fallback={null}><Settings /></Suspense>,
      },
    ],
  },
]);

function App() {
  const { config, loadConfig } = useConfigStore();
  const { fetchCurrentAccount, fetchAccounts } = useAccountStore();
  const { i18n } = useTranslation();

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Sync language from config (仅在不同步时通过 startTransition 非阻塞调度)
  useEffect(() => {
    if (config?.language && i18n.language !== config.language) {
      startTransition(() => {
        i18n.changeLanguage(config.language);
      });
      document.documentElement.dir = config.language === 'ar' ? 'rtl' : 'ltr';
    }
  }, [config?.language, i18n]);

  // Listen for tray events
  useEffect(() => {
    if (!isTauri()) return;
    const unlistenPromises: Promise<() => void>[] = [];

    // 监听托盘切换账号事件
    unlistenPromises.push(
      listen('tray://account-switched', () => {
        fetchCurrentAccount();
        fetchAccounts();
      })
    );

    // 监听托盘刷新事件
    unlistenPromises.push(
      listen('tray://refresh-current', () => {
        fetchCurrentAccount();
        fetchAccounts();
      })
    );

    // 监听后端全量刷新事件 (Command / Scheduler)
    unlistenPromises.push(
      listen('accounts://refreshed', () => {
        fetchCurrentAccount();
        fetchAccounts();
      })
    );

    // 监听手动触发自动更新事件
    unlistenPromises.push(
      listen('app://trigger-update', () => {
        setShowUpdateNotification(true);
      })
    );

    // Cleanup
    return () => {
      Promise.all(unlistenPromises).then(unlisteners => {
        unlisteners.forEach(unlisten => unlisten());
      });
    };
  }, [fetchCurrentAccount, fetchAccounts]);

  // Update notification state
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);

  // Check for updates on startup
  useEffect(() => {
    const checkUpdates = async () => {
      try {
        const shouldCheck = await invoke<boolean>('should_check_updates');

        if (shouldCheck) {
          setShowUpdateNotification(true);
          await invoke('update_last_check_time');
        }
      } catch (error) {
        console.error('Failed to check update settings:', error);
      }
    };

    // Delay check to avoid blocking initial render
    const timer = setTimeout(checkUpdates, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <ThemeManager />
      <Suspense fallback={null}><DebugConsole /></Suspense>
      {showUpdateNotification && (
        <Suspense fallback={null}>
          <UpdateNotification onClose={() => setShowUpdateNotification(false)} />
        </Suspense>
      )}
      <RouterProvider router={router} />
    </>
  );
}

export default App;
