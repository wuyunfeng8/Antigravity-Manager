import { AlertTriangle, CheckCircle, XCircle, Info, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '../ui/dialog';
import { Button } from '../ui/button';

export type ModalType = 'confirm' | 'success' | 'error' | 'info';

interface ModalDialogProps {
    isOpen: boolean;
    title: string;
    message?: string;
    children?: React.ReactNode;
    type?: ModalType;
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    isLoading?: boolean;
}

export default function ModalDialog({
    isOpen,
    title,
    message,
    children,
    type = 'confirm',
    onConfirm,
    onCancel,
    confirmText,
    cancelText,
    isDestructive = false,
    isLoading = false
}: ModalDialogProps) {
    const { t } = useTranslation();
    const finalConfirmText = confirmText || t('common.confirm');
    const finalCancelText = cancelText || t('common.cancel');

    const getIcon = () => {
        switch (type) {
            case 'success':
                return <CheckCircle className="w-8 h-8 text-emerald-500" />;
            case 'error':
                return <XCircle className="w-8 h-8 text-destructive" />;
            case 'info':
                return <Info className="w-8 h-8 text-blue-500" />;
            case 'confirm':
            default:
                return isDestructive ? (
                    <AlertTriangle className="w-8 h-8 text-destructive" />
                ) : (
                    <AlertTriangle className="w-8 h-8 text-blue-500" />
                );
        }
    };

    const getIconBg = () => {
        switch (type) {
            case 'success':
                return 'bg-emerald-500/10';
            case 'error':
                return 'bg-destructive/10';
            case 'info':
                return 'bg-blue-500/10';
            case 'confirm':
            default:
                return isDestructive ? 'bg-destructive/10' : 'bg-blue-500/10';
        }
    };

    const showCancel = type === 'confirm' && Boolean(onCancel);

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                if (!open && onCancel && !isLoading) {
                    onCancel();
                }
            }}
        >
            <DialogContent className="sm:max-w-md">
                <div data-tauri-drag-region className="fixed top-0 left-0 right-0 h-8 z-[110]" />
                <div className="flex flex-col items-center text-center">
                    <div
                        className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 shadow-sm ${getIconBg()}`}
                    >
                        {getIcon()}
                    </div>

                    <DialogHeader className="text-center sm:text-center space-y-2">
                        <DialogTitle className="text-xl font-bold">{title}</DialogTitle>
                        {message && !children && (
                            <DialogDescription className="text-sm text-muted-foreground leading-relaxed px-2">
                                {message}
                            </DialogDescription>
                        )}
                    </DialogHeader>

                    {children && <div className="w-full text-left my-4 px-1">{children}</div>}

                    <DialogFooter className="flex-row justify-center gap-3 w-full mt-6 sm:justify-center">
                        {showCancel && (
                            <Button
                                variant="outline"
                                disabled={isLoading}
                                className="flex-1"
                                onClick={onCancel}
                            >
                                {finalCancelText}
                            </Button>
                        )}
                        <Button
                            variant={isDestructive ? 'destructive' : 'default'}
                            disabled={isLoading}
                            className="flex-1"
                            onClick={onConfirm}
                        >
                            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {finalConfirmText}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}
