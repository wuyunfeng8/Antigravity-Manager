export type ModelCategory = "gemini" | "claude" | "gpt" | "gemini-pro" | "gemini-flash";

function belongsTo(name: string, category: ModelCategory): boolean {
  const normalized = name.trim().toLowerCase();
  if (category === "claude") {
    return /claude|opus|sonnet|haiku/.test(normalized);
  }
  if (category === "gpt") {
    return /gpt|openai|o1|o3|codex/.test(normalized);
  }
  if (category === "gemini") {
    return (normalized.startsWith("gemini") || normalized.includes("gemini")) && !normalized.includes("image");
  }
  if (!normalized.startsWith("gemini-") || normalized.includes("image")) {
    return false;
  }
  return category === "gemini-flash" ? normalized.includes("flash") : normalized.includes("pro");
}

const PREFERRED_MODELS: Record<ModelCategory, string[]> = {
  gemini: [
    "gemini-pro-agent",
    "gemini-3.1-pro-high",
    "gemini-3.1-pro",
    "gemini-2.5-pro",
    "gemini-3-flash-agent",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
    "gemini-3-flash",
  ],
  claude: ["claude-opus-4-6-thinking", "claude-sonnet-4-6", "claude-opus-4-6"],
  gpt: ["gpt-oss-120b-medium", "gpt-oss-120b", "gpt-oss-20b", "gpt-4o", "gpt-4", "gpt-5"],
  "gemini-pro": ["gemini-pro-agent", "gemini-3.1-pro-high", "gemini-3.1-pro", "gemini-2.5-pro"],
  "gemini-flash": ["gemini-3-flash-agent", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3-flash"],
};

export function findQuotaModel<T extends { name: string }>(models: T[] | undefined, category: ModelCategory): T | undefined {
  if (!models?.length) return undefined;
  for (const preferred of PREFERRED_MODELS[category] || []) {
    const match = models.find((model) => model.name.toLowerCase() === preferred);
    if (match) return match;
  }
  const matched = models.find((model) => belongsTo(model.name, category));
  if (matched) return matched;
  // In Antigravity, Claude and GPT share the same 3P quota bucket
  if (category === "gpt") {
    return findQuotaModel(models, "claude");
  }
  return undefined;
}

export function getModelDisplayName(model: { name: string; display_name?: string } | null | undefined, fallback = ""): string {
  if (!model) return fallback;
  if (model.display_name) return model.display_name;
  const name = model.name.toLowerCase();
  if (/claude|opus|sonnet|haiku/.test(name)) return "Claude";
  if (/gpt|openai|o1|o3/.test(name)) return "GPT";
  if (name.includes("flash")) return "Gemini Flash";
  if (name.includes("pro")) return "Gemini Pro";
  if (name.startsWith("gemini")) return "Gemini";
  return model.name || fallback;
}
