export type ModelCategory = "gemini-pro" | "gemini-flash" | "claude";

function belongsTo(name: string, category: ModelCategory): boolean {
  const normalized = name.trim().toLowerCase();
  if (category === "claude") {
    return /claude|opus|sonnet|haiku/.test(normalized);
  }
  if (!normalized.startsWith("gemini-") || normalized.includes("image")) {
    return false;
  }
  return category === "gemini-flash" ? normalized.includes("flash") : normalized.includes("pro");
}

const PREFERRED_MODELS: Record<ModelCategory, string[]> = {
  "gemini-pro": ["gemini-pro-agent", "gemini-3.1-pro-high", "gemini-3.1-pro", "gemini-2.5-pro"],
  "gemini-flash": ["gemini-3-flash-agent", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3-flash"],
  claude: ["claude-opus-4-6-thinking", "claude-sonnet-4-6", "claude-opus-4-6"],
};

export function findQuotaModel<T extends { name: string }>(models: T[] | undefined, category: ModelCategory): T | undefined {
  if (!models?.length) return undefined;
  for (const preferred of PREFERRED_MODELS[category]) {
    const match = models.find((model) => model.name.toLowerCase() === preferred);
    if (match) return match;
  }
  return models.find((model) => belongsTo(model.name, category));
}

export function getModelDisplayName(model: { name: string; display_name?: string } | null | undefined, fallback = ""): string {
  if (!model) return fallback;
  if (model.display_name) return model.display_name;
  const name = model.name.toLowerCase();
  if (/claude|opus|sonnet|haiku/.test(name)) return "Claude";
  if (name.includes("flash")) return "Gemini Flash";
  if (name.includes("pro")) return "Gemini Pro";
  return model.name || fallback;
}
