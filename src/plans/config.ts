// src/plans/config.ts

import { PlanConfig } from "./types.js";

export const PLANS: Record<string, PlanConfig> = {
  FREE: {
    id: "FREE",
    price: 0,
    convosPerDay: 40,
    maxSecondsPerConvo: 30,
    priority: 1,
    screenExplain: false,
    interruptionLimit: 5,
  },

  PLAN_399: {
    id: "PLAN_399",
    price: 399,
    convosPerDay: 90,
    maxSecondsPerConvo: 75,
    priority: 2,
    screenExplain: false,
    interruptionLimit: 8,
  },

  PLAN_599: {
    id: "PLAN_599",
    price: 599,
    convosPerDay: 120,
    maxSecondsPerConvo: 150,
    priority: 3,
    screenExplain: false,
    interruptionLimit: 10,
  },

  PLAN_699: {
    id: "PLAN_699",
    price: 699,
    convosPerDay: 120,
    maxSecondsPerConvo: 150,
    priority: 4,
    screenExplain: true,
    interruptionLimit: 999,
  },
};
