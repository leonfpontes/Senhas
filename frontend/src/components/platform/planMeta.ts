export interface PlanMeta {
  label: string;
  color: string;
  glow:  string;
}

export const PLAN_META: Record<string, PlanMeta> = {
  free:    { label: "Free",    color: "#64748B", glow: "rgba(100,116,139,0.3)" },
  basic:   { label: "Basic",   color: "#06B6D4", glow: "rgba(6,182,212,0.3)"   },
  pro:     { label: "Pro",     color: "#6366F1", glow: "rgba(99,102,241,0.3)"  },
  premium: { label: "Premium", color: "#F59E0B", glow: "rgba(245,158,11,0.3)"  },
};

export const DEFAULT_PLAN_META: PlanMeta = {
  label: "Desconhecido",
  color: "#64748B",
  glow:  "rgba(100,116,139,0.3)",
};
