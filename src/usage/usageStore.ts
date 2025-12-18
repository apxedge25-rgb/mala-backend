// src/usage/usageStore.ts

type DailyUsage = {
  date: string;
  conversationsUsed: number;
};

// In-memory store (logic-final, storage-temporary)
const usageMap = new Map<string, DailyUsage>();

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Get today's usage for a user.
 * Automatically resets when date changes.
 */
export function getDailyUsage(userId: string): DailyUsage {
  const currentDate = today();
  const existing = usageMap.get(userId);

  if (!existing || existing.date !== currentDate) {
    const fresh: DailyUsage = {
      date: currentDate,
      conversationsUsed: 0
    };
    usageMap.set(userId, fresh);
    return fresh;
  }

  return existing;
}

/**
 * Check if user has reached daily conversation limit
 */
export function hasReachedDailyLimit(
  userId: string,
  maxConversations: number
): boolean {
  const usage = getDailyUsage(userId);
  return usage.conversationsUsed >= maxConversations;
}

/**
 * Increment conversation count for today
 * Call this ONLY after limit check passes
 */
export function incrementConversation(userId: string): void {
  const usage = getDailyUsage(userId);
  usage.conversationsUsed += 1;
  usageMap.set(userId, usage);
}
