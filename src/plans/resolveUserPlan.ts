// src/plans/resolveUserPlan.ts

import { PLANS } from "./config.js";
import { PlanConfig, PlanId } from "./types.js";

export function resolveUserPlan(req: any): PlanConfig {
  const headerPlan = req.headers["x-mala-plan"] as PlanId | undefined;

  if (headerPlan && PLANS[headerPlan]) {
    return PLANS[headerPlan];
  }

  return PLANS.FREE;
}
