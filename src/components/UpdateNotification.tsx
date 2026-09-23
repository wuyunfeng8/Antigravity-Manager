import React, { useEffect, useState, useRef } from 'react';
import { X, Sparkles, Loader2, CheckCircle, RotateCcw } from 'lucide-react';
import { request as invoke } from '../utils/request';
import { useTranslation } from 'react-i18next';
import { check as tauriCheck } from '@tauri-apps/plugin-updater';
import { relaunch as tauriRelaunch } from '@tauri-apps/plugin-process';
import { showToast } from './common/ToastContainer';
import { Button } from './ui/button';
import { Progress } from './ui/progress';

interface UpdateInfo {
  has_update: boolean;
  latest_version: string;
  current_version: string;
  download_url: string;
  source?: string;
  proxy_url?: string;
}

type UpdateState = 'checking' | 'downloading' | 'ready' | 'error' | 'none' | 'manual';

interface UpdateNotificationProps {
  onClose: () => void;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({ onClose }) => {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [updateState, setUpdateState] = useState<UpdateState>('checking');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const downloadStarted = useRef(false);

  useEffect(() => {
    checkAndDownload();
  }, []);

  const checkAndDownload = async () => {
    try {
      // 1. Check for updates via backend
      const info = await invoke<UpdateInfo>('check_for_updates');
      if (!info.has_update) {
        onClose();
        return;
      }

      setUpdateInfo(info);

      // Check if Linux and not AppImage (e.g. RPM or DEB packages).
      // Tauri updater only supports AppImage on Linux.
      if (navigator.userAgent.toLowerCase().includes('linux')) {
        const isAppImage = await invoke<boolean>('check_appimage_installation');
        if (!isAppImage) {
          setUpdateState('manual');
          setTimeout(() => setIsVisible(true), 100);
          return;
        }
      }

      // 3. Start background download immediately
      if (downloadStarted.current) return;
      downloadStarted.current = true;

      setUpdateState('downloading');
      setTimeout(() => setIsVisible(true), 100);

      const update = await tauriCheck(
        info.proxy_url ? { proxy: info.proxy_url } : undefined
      );
      if (!update) {
        // updater.json not ready yet or no update via native channel
        console.warn('Native updater returned null');
        showToast(t('update_notification.toast.not_ready'), 'info');
        handleClose();
        return;
      }

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0;
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case 'Finished':
            break;
        }
      });

      // 4. Download complete — show restart prompt
      setUpdateState('ready');
      setDownloadProgress(100);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('Auto update failed:', errorMsg);
      setUpdateState('error');
      showToast(`${t('update_notification.toast.failed')}: ${errorMsg}`, 'error');
    }
  };

  const handleRestart = async () => {
    try {
      await tauriRelaunch();
    } catch (error) {
      console.error('Relaunch failed:', error);
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setIsVisible(false);
    setTimeout(onClose, 400);
  };

  if (updateState === 'none') {
    return null;
  }

  return (
    <div
      className={`
        fixed top-6 right-6 z-[100]
        transition-all duration-500 ease-out
        ${isVisible && !isClosing ? 'translate-y-0 opacity-100 scale-100' : '-translate-y-4 opacity-0 scale-95'}
      `}
    >
      <div className="
        relative overflow-hidden
        w-80 p-5
        rounded-2xl
        border border-border
        shadow-2xl
        backdrop-blur-xl
        bg-card/95 text-card-foreground
        group
      ">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl pointer-events-none group-hover:bg-primary/30 transition-colors duration-500" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-primary/10 rounded-full blur-3xl pointer-events-none group-hover:bg-primary/20 transition-colors duration-500" />

        <div className="relative z-10">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary text-primary-foreground shadow-sm">
                {updateState === 'ready' ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </div>
              <div>
                <h3 className="font-bold text-foreground leading-tight">
                  {updateState === 'ready'
                    ? t('update_notification.ready')
                    : t('update_notification.title')}
                </h3>
                {updateInfo && (
                  <p className="text-xs font-medium text-primary">
                    v{updateInfo.latest_version}
                  </p>
                )}
              </div>
            </div>

            {(updateState === 'error' || updateState === 'ready' || updateState === 'manual') && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-6 w-6 rounded-full text-muted-foreground hover:text-foreground"
                aria-label={t('common.close')}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {/* Status message */}
          <div className="mb-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {updateState === 'downloading' && t('update_notification.downloading')}
              {updateState === 'ready' && t('update_notification.restart_prompt')}
              {updateState === 'error' && `${t('update_notification.toast.failed')}`}
              {updateState === 'manual' && (
                navigator.language.startsWith('zh')
                  ? '检测到您当前运行的不是 AppImage 格式，自动更新仅支持 AppImage。请点击下方按钮手动下载更新。'
                  : 'We detected that you are not running the AppImage version. Auto-updates are only supported for AppImage. Please download the update manually.'
              )}
            </p>
          </div>

          {/* Progress bar during download */}
          {updateState === 'downloading' && (
            <div className="mb-4 space-y-1.5">
              <Progress value={downloadProgress} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <p>{downloadProgress}%</p>
                <Loader2 className="w-3 h-3 animate-spin text-primary" />
              </div>
            </div>
          )}

          {/* Restart button when ready */}
          {updateState === 'ready' && (
            <div className="flex gap-2">
              <Button
                onClick={handleRestart}
                variant="default"
                size="sm"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>{t('update_notification.btn_restart')}</span>
              </Button>
              <Button
                onClick={handleClose}
                variant="outline"
                size="sm"
              >
                {t('update_notification.btn_later')}
              </Button>
            </div>
          )}

          {/* Manual download button */}
          {updateState === 'manual' && (
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  if (updateInfo) {
                    try {
                      const { openUrl } = await import('@tauri-apps/plugin-opener');
                      await openUrl(updateInfo.download_url);
                    } catch (e) {
                      window.open(updateInfo.download_url, '_blank', 'noopener,noreferrer');
                    }
                  }
                }}
                variant="default"
                size="sm"
                className="flex-1"
              >
                {navigator.language.startsWith('zh') ? '手动下载' : 'Download Manually'}
              </Button>
              <Button
                onClick={handleClose}
                variant="outline"
                size="sm"
              >
                {t('update_notification.btn_later')}
              </Button>
            </div>
          )}

          {/* Error state — retry button */}
          {updateState === 'error' && (
            <Button
              onClick={() => {
                downloadStarted.current = false;
                setUpdateState('checking');
                setDownloadProgress(0);
                checkAndDownload();
              }}
              variant="default"
              size="sm"
              className="w-full gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t('common.retry')}</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
