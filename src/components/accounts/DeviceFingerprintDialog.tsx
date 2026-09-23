import { useEffect, useState } from 'react';
import { Wand2, RotateCcw, FolderOpen, Trash2 } from 'lucide-react';
import { Account, DeviceProfile, DeviceProfileVersion } from '../../types/account';
import * as accountService from '../../services/accountService';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../ui/dialog';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';

interface DeviceFingerprintDialogProps {
    account: Account | null;
    onClose: () => void;
}

export default function DeviceFingerprintDialog({ account, onClose }: DeviceFingerprintDialogProps) {
    const { t } = useTranslation();
    const [deviceProfiles, setDeviceProfiles] = useState<{ current_storage?: DeviceProfile; history?: DeviceProfileVersion[]; baseline?: DeviceProfile } | null>(null);
    const [loadingDevice, setLoadingDevice] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [confirmProfile, setConfirmProfile] = useState<DeviceProfile | null>(null);
    const [confirmType, setConfirmType] = useState<'generate' | 'restoreOriginal' | null>(null);

    const fetchDevice = async (target?: Account | null) => {
        if (!target) {
            setDeviceProfiles(null);
            return;
        }
        setLoadingDevice(true);
        try {
            const res = await accountService.getDeviceProfiles(target.id);
            setDeviceProfiles(res);
        } catch (e: any) {
            const errorMsg = typeof e === 'string' ? e : e.message || '';
            const translated = errorMsg === 'storage_json_not_found'
                ? t('accounts.device_fingerprint_dialog.storage_json_not_found')
                : (typeof e === 'string' ? e : t('accounts.device_fingerprint_dialog.failed_to_load_device_info'));
            setActionMessage(translated);
        } finally {
            setLoadingDevice(false);
        }
    };

    useEffect(() => {
        fetchDevice(account);
    }, [account]);

    const handleGeneratePreview = async () => {
        setActionLoading('preview');
        try {
            const profile = await accountService.previewGenerateProfile();
            setConfirmProfile(profile);
            setConfirmType('generate');
        } catch (e: any) {
            setActionMessage(typeof e === 'string' ? e : t('accounts.device_fingerprint_dialog.generation_failed'));
        } finally {
            setActionLoading(null);
        }
    };

    const handleConfirmGenerate = async () => {
        if (!account || !confirmProfile) return;
        setActionLoading('generate');
        try {
            await accountService.bindDeviceProfileWithProfile(account.id, confirmProfile);
            setActionMessage(t('accounts.device_fingerprint_dialog.generated_and_bound'));
            setConfirmProfile(null);
            setConfirmType(null);
            await fetchDevice(account);
        } catch (e: any) {
            setActionMessage(typeof e === 'string' ? e : t('accounts.device_fingerprint_dialog.binding_failed'));
        } finally {
            setActionLoading(null);
        }
    };

    const handleRestoreOriginalConfirm = () => {
        if (!deviceProfiles?.baseline) {
            setActionMessage(t('accounts.device_fingerprint_dialog.original_fingerprint_not_found'));
            return;
        }
        setConfirmProfile(deviceProfiles.baseline);
        setConfirmType('restoreOriginal');
    };

    const handleRestoreOriginal = async () => {
        if (!account) return;
        setActionLoading('restore');
        try {
            const msg = await accountService.restoreOriginalDevice();
            setActionMessage(msg || t('accounts.device_fingerprint_dialog.restored'));
            setConfirmProfile(null);
            setConfirmType(null);
            await fetchDevice(account);
        } catch (e: any) {
            setActionMessage(typeof e === 'string' ? e : t('accounts.device_fingerprint_dialog.restoration_failed'));
        } finally {
            setActionLoading(null);
        }
    };

    const handleRestoreVersion = async (versionId: string) => {
        if (!account) return;
        setActionLoading(`restore-${versionId}`);
        try {
            await accountService.restoreDeviceVersion(account.id, versionId);
            setActionMessage(t('accounts.device_fingerprint_dialog.restored'));
            await fetchDevice(account);
        } catch (e: any) {
            setActionMessage(typeof e === 'string' ? e : t('accounts.device_fingerprint_dialog.restoration_failed'));
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeleteVersion = async (versionId: string, isCurrent?: boolean) => {
        if (!account || isCurrent) return;
        setActionLoading(`delete-${versionId}`);
        try {
            await accountService.deleteDeviceVersion(account.id, versionId);
            setActionMessage(t('accounts.device_fingerprint_dialog.deleted'));
            await fetchDevice(account);
        } catch (e: any) {
            setActionMessage(typeof e === 'string' ? e : t('accounts.device_fingerprint_dialog.deletion_failed'));
        } finally {
            setActionLoading(null);
        }
    };

    const handleOpenFolder = async () => {
        setActionLoading('open-folder');
        try {
            await accountService.openDeviceFolder();
            setActionMessage(t('accounts.device_fingerprint_dialog.directory_opened'));
        } catch (e: any) {
            setActionMessage(typeof e === 'string' ? e : t('accounts.device_fingerprint_dialog.directory_open_failed'));
        } finally {
            setActionLoading(null);
        }
    };

    const renderProfile = (profile?: DeviceProfile) => {
        if (!profile) return <span className="text-xs text-muted-foreground">{t('common.empty') || '空'}</span>;
        return (
            <div className="grid grid-cols-1 gap-1.5 text-xs font-mono text-muted-foreground">
                <div><span className="font-semibold text-foreground">machineId:</span> {profile.machine_id}</div>
                <div><span className="font-semibold text-foreground">macMachineId:</span> {profile.mac_machine_id}</div>
                <div><span className="font-semibold text-foreground">devDeviceId:</span> {profile.dev_device_id}</div>
                <div><span className="font-semibold text-foreground">sqmId:</span> {profile.sqm_id}</div>
            </div>
        );
    };

    if (!account) return null;

    return (
        <>
            <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
                <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
                    <DialogHeader className="px-6 py-4 border-b bg-muted/30 flex flex-row items-center justify-between">
                        <div className="flex items-center gap-3">
                            <DialogTitle className="text-base font-bold">{t('accounts.device_fingerprint_dialog.title')}</DialogTitle>
                            <Badge variant="secondary" className="font-mono text-xs">
                                {account.email}
                            </Badge>
                        </div>
                    </DialogHeader>

                    <div className="p-6 space-y-4 overflow-y-auto flex-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="text-sm font-semibold">{t('accounts.device_fingerprint_dialog.operations')}</div>
                            <div className="flex gap-2 flex-wrap">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={loadingDevice || actionLoading === 'preview'}
                                    onClick={handleGeneratePreview}
                                >
                                    <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                                    {t('accounts.device_fingerprint_dialog.generate_and_bind')}
                                </Button>
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    disabled={loadingDevice || actionLoading === 'restore'}
                                    onClick={handleRestoreOriginalConfirm}
                                >
                                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                    {t('accounts.device_fingerprint_dialog.restore_original')}
                                </Button>
                                <Button variant="outline" size="sm" disabled={actionLoading === 'open-folder'} onClick={handleOpenFolder}>
                                    <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                                    {t('accounts.device_fingerprint_dialog.open_storage_directory')}
                                </Button>
                            </div>
                        </div>

                        {actionMessage && (
                            <div className="text-xs text-primary bg-primary/10 px-3 py-2 rounded-md font-medium">
                                {actionMessage}
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Card>
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-xs font-semibold">{t('accounts.device_fingerprint_dialog.current_storage')}</CardTitle>
                                        <Badge variant="outline" className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40">
                                            {t('accounts.device_fingerprint_dialog.effective')}
                                        </Badge>
                                    </div>
                                    <CardDescription className="text-[10px]">
                                        {t('accounts.device_fingerprint_dialog.current_storage_desc')}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    {loadingDevice ? (
                                        <div className="text-xs text-muted-foreground">{t('accounts.device_fingerprint_dialog.loading')}</div>
                                    ) : renderProfile(deviceProfiles?.current_storage)}
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-xs font-semibold">{t('accounts.device_fingerprint_dialog.account_binding')}</CardTitle>
                                        <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40">
                                            {t('accounts.device_fingerprint_dialog.pending_application')}
                                        </Badge>
                                    </div>
                                    <CardDescription className="text-[10px]">
                                        {t('accounts.device_fingerprint_dialog.account_binding_desc')}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 pt-2">
                                    {loadingDevice ? (
                                        <div className="text-xs text-muted-foreground">{t('accounts.device_fingerprint_dialog.loading')}</div>
                                    ) : renderProfile(deviceProfiles?.history?.find(h => h.is_current)?.profile)}
                                </CardContent>
                            </Card>
                        </div>

                        <Card>
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-xs font-semibold">{t('accounts.device_fingerprint_dialog.historical_fingerprints')}</CardTitle>
                            </CardHeader>
                            <CardContent className="p-4 pt-2">
                                {loadingDevice ? (
                                    <div className="text-xs text-muted-foreground">{t('accounts.device_fingerprint_dialog.loading')}</div>
                                ) : (
                                    <div className="space-y-2">
                                        {deviceProfiles?.history && deviceProfiles.history.map(v => (
                                            <HistoryRow
                                                id={v.id}
                                                key={v.id}
                                                label={v.label || v.id}
                                                createdAt={v.created_at}
                                                profile={v.profile}
                                                isCurrent={v.is_current}
                                                onRestore={() => handleRestoreVersion(v.id)}
                                                onDelete={() => handleDeleteVersion(v.id, v.is_current)}
                                                loadingKey={actionLoading}
                                            />
                                        ))}
                                        {(!deviceProfiles?.history || deviceProfiles.history.length === 0) && !deviceProfiles?.baseline && (
                                            <div className="text-xs text-muted-foreground">{t('accounts.device_fingerprint_dialog.no_history')}</div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </DialogContent>
            </Dialog>

            {confirmProfile && confirmType && (
                <ConfirmDialog
                    profile={confirmProfile}
                    type={confirmType}
                    onCancel={() => {
                        if (actionLoading) return;
                        setConfirmProfile(null);
                        setConfirmType(null);
                    }}
                    onConfirm={confirmType === 'generate' ? handleConfirmGenerate : handleRestoreOriginal}
                    loading={!!actionLoading}
                />
            )}
        </>
    );
}

interface HistoryRowProps {
    id?: string;
    label: string;
    createdAt: number;
    profile: DeviceProfile;
    onRestore: () => void;
    onDelete?: () => void;
    isCurrent?: boolean;
    loadingKey?: string | null;
}

function HistoryRow({ id, label, createdAt, profile, onRestore, onDelete, isCurrent, loadingKey }: HistoryRowProps) {
    const { t } = useTranslation();
    const key = id || label;
    return (
        <div className="flex items-start justify-between p-3 rounded-lg border bg-muted/20 hover:border-primary/40 transition-colors">
            <div className="text-[11px] text-muted-foreground flex-1">
                <div className="font-semibold text-foreground flex items-center gap-2">
                    {label}
                    {isCurrent && <Badge variant="default" className="text-[9px] h-4 px-1.5">{t('accounts.device_fingerprint_dialog.current')}</Badge>}
                </div>
                {createdAt > 0 && <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(createdAt * 1000).toLocaleString()}</div>}
                <div className="mt-1.5 text-[10px] font-mono space-y-0.5">
                    <div>machineId: {profile.machine_id}</div>
                    <div>macMachineId: {profile.mac_machine_id}</div>
                    <div>devDeviceId: {profile.dev_device_id}</div>
                    <div>sqmId: {profile.sqm_id}</div>
                </div>
            </div>
            <div className="flex gap-2 ml-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={loadingKey === `restore-${key}` || isCurrent}
                    onClick={onRestore}
                >
                    {t('accounts.device_fingerprint_dialog.restore')}
                </Button>
                {!isCurrent && onDelete && (
                    <Button
                        variant="destructive"
                        size="icon"
                        className="h-7 w-7"
                        disabled={loadingKey === `delete-${key}`}
                        onClick={onDelete}
                        title={t('accounts.device_fingerprint_dialog.delete_version')}
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                )}
            </div>
        </div>
    );
}

function ConfirmDialog({ profile, type, onConfirm, onCancel, loading }: { profile: DeviceProfile; type: 'generate' | 'restoreOriginal'; onConfirm: () => void; onCancel: () => void; loading?: boolean }) {
    const { t } = useTranslation();
    const title = type === 'generate' ? t('accounts.device_fingerprint_dialog.confirm_generate_title') : t('accounts.device_fingerprint_dialog.confirm_restore_title');
    const desc =
        type === 'generate'
            ? t('accounts.device_fingerprint_dialog.confirm_generate_desc')
            : t('accounts.device_fingerprint_dialog.confirm_restore_desc');

    return (
        <Dialog open={true} onOpenChange={(open) => { if (!open && !loading) onCancel(); }}>
            <DialogContent className="max-w-md text-center">
                <DialogHeader className="text-center sm:text-center">
                    <DialogTitle className="text-lg font-bold">{title}</DialogTitle>
                    <DialogDescription className="text-sm">{desc}</DialogDescription>
                </DialogHeader>

                <div className="text-xs font-mono text-muted-foreground bg-muted p-3 rounded-lg text-left space-y-1 my-2">
                    <div><span className="font-semibold text-foreground">machineId:</span> {profile.machine_id}</div>
                    <div><span className="font-semibold text-foreground">macMachineId:</span> {profile.mac_machine_id}</div>
                    <div><span className="font-semibold text-foreground">devDeviceId:</span> {profile.dev_device_id}</div>
                    <div><span className="font-semibold text-foreground">sqmId:</span> {profile.sqm_id}</div>
                </div>

                <DialogFooter className="flex gap-2 sm:justify-center">
                    <Button variant="outline" onClick={onCancel} disabled={loading}>
                        {t('accounts.device_fingerprint_dialog.cancel')}
                    </Button>
                    <Button onClick={onConfirm} disabled={loading}>
                        {loading ? t('accounts.device_fingerprint_dialog.processing') : t('accounts.device_fingerprint_dialog.confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
