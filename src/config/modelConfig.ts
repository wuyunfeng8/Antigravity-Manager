import { BrainCircuit, Image, Sparkles, Zap } from "lucide-react";

export interface ModelConfig {
  label: string;
  shortLabel: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

/**
 * AMT deliberately exposes one representative selector per real quota family.
 * Model variants that share a bucket are noise in the account-management UI.
 */
export const MODEL_CONFIG: Record<string, ModelConfig> = {
  "gemini-3-pro-high": {
    label: "Gemini Pro",
    shortLabel: "Gemini Pro",
    Icon: Sparkles,
  },
  "gemini-3-flash": {
    label: "Gemini Flash",
    shortLabel: "Gemini Flash",
    Icon: Zap,
  },
  "gemini-3.1-flash-image": {
    label: "Gemini Image",
    shortLabel: "Gemini Image",
    Icon: Image,
  },
  claude: {
    label: "Claude",
    shortLabel: "Claude",
    Icon: BrainCircuit,
  },
};

export { getModelDisplayName, findQuotaModel, type ModelCategory } from "../utils/modelCategory";
