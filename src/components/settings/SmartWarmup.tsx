import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Check } from 'lucide-react';
import { ScheduledWarmupConfig } from '../../types/config';
import { MODEL_CONFIG } from '../../config/modelConfig';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { cn } from '../../utils/cn';

interface SmartWarmupProps {
    config: ScheduledWarmupConfig;
    onChange: (config: ScheduledWarmupConfig) => void;
}

const SmartWarmup: React.FC<SmartWarmupProps> = ({ config, onChange }) => {
    const { t } = useTranslation();

    const uniqueLabels = new Set<string>();
    const warmupModelsOptions = Object.entries(MODEL_CONFIG)
        .filter(([id, modelConf]) => {
            if (id.includes('thinking')) return false;
            const label = modelConf.shortLabel || modelConf.label;
            if (uniqueLabels.has(label)) return false;
            uniqueLabels.add(label);
            return true;
        })
        .map(([id, modelConf]) => ({
            id,
            label: modelConf.shortLabel || modelConf.label
        }));

    const handleEnabledChange = (enabled: boolean) => {
        let newConfig = { ...config, enabled };
        // 如果开启预热且勾选列表为空，则默认勾选所有核心模型
        if (enabled && (!config.monitored_models || config.monitored_models.length === 0)) {
            newConfig.monitored_models = warmupModelsOptions.map(o => o.id);
        }
        onChange(newConfig);
    };

    const toggleModel = (model: string) => {
        const currentModels = config.monitored_models || [];
        let newModels: string[];

        if (currentModels.includes(model)) {
            // 必须勾选其中一个，不能全取消
            if (currentModels.length <= 1) return;
            newModels = currentModels.filter(m => m !== model);
        } else {
            newModels = [...currentModels, model];
        }

        onChange({ ...config, monitored_models: newModels });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
                        config.enabled
                            ? "bg-amber-500 text-white"
                            : "bg-amber-500/10 text-amber-500"
                    )}>
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <div className="font-bold text-foreground">
                            {t('settings.warmup.title', '7天周配额智能预热')}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {t('settings.warmup.desc', '在各账号的 7 天周配额到达重置时间后自动唤醒 1 次，启动当周计时器，零多余消耗。')}
                        </p>
                    </div>
                </div>
                <Switch
                    aria-label={t('settings.warmup.title')}
                    checked={config.enabled}
                    onCheckedChange={handleEnabledChange}
                />
            </div>

            {config.enabled && (
                <div className="mt-4 pt-4 border-t border-border animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-3">
                        <div>
                            <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-2">
                                {t('settings.warmup.monitored_models_label', '预热模型范围')}
                            </Label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {warmupModelsOptions.map((model) => {
                                    const isSelected = config.monitored_models?.includes(model.id);
                                    return (
                                        <div
                                            key={model.id}
                                            onClick={() => toggleModel(model.id)}
                                            className={cn(
                                                "flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all duration-200 select-none",
                                                isSelected
                                                    ? "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300"
                                                    : "bg-card border-border text-muted-foreground hover:border-border/80"
                                            )}
                                        >
                                            <span className="text-[11px] font-medium truncate pr-2">
                                                {model.label}
                                            </span>
                                            <div className={cn(
                                                "w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300 shrink-0",
                                                isSelected ? "bg-amber-500 text-white scale-100" : "bg-muted text-transparent scale-75 opacity-0"
                                            )}>
                                                <Check size={10} strokeWidth={3} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                                {t('settings.warmup.monitored_models_desc', '勾选需要预热的模型。在周配额到达重置时间后将自动唤醒 1 次启动新周期。')}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SmartWarmup;
