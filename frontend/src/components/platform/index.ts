/**
 * Platform component library — barrel export.
 * Import everything from here to avoid deep relative paths.
 *
 * Example:
 *   import { KpiCard, MrrHeroCard, ChartTooltip } from "@/components/platform";
 */

export { ChartTooltip }           from "./ChartTooltip";
export { KpiCard }                from "./KpiCard";
export { LiveClock }              from "./LiveClock";
export { MrrHeroCard }            from "./MrrHeroCard";
export { PlansDistribution }      from "./PlansDistribution";
export { SectionLabel }           from "./SectionLabel";
export { StatusDot }              from "./StatusDot";
export { TopTenantsLeaderboard }  from "./TopTenantsLeaderboard";

export type { KpiCardProps }  from "./KpiCard";
export { PLAN_META, DEFAULT_PLAN_META } from "./planMeta";
export type { PlanMeta } from "./planMeta";
