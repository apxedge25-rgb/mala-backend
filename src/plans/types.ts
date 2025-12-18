// src/plans/types.ts

export type PlanId = "FREE" | "PLAN_399" | "PLAN_599" | "PLAN_699";

export type PlanConfig = {
  id: PlanId;
  price: number;
  convosPerDay: number;
  maxSecondsPerConvo: number;
  priority: number;
  screenExplain: boolean;
  interruptionLimit: number;
};
