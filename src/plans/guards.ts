// src/plans/guards.ts

import { PlanConfig } from "./types";

export function canUseScreenExplain(plan: PlanConfig): boolean {
  return plan.screenExplain;
}

export function getMaxSeconds(plan: PlanConfig): number {
  return plan.maxSecondsPerConvo;
}

export function getPriority(plan: PlanConfig): number {
  return plan.priority;
}

export function getDailyConvoLimit(plan: PlanConfig): number {
  return plan.convosPerDay;
}

export function getInterruptionLimit(plan: PlanConfig): number {
  return plan.interruptionLimit;
}
