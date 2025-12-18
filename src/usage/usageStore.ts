// src/usage/usageStore.ts

type ConversationUsage = {
  startTime: number; // timestamp in ms
  secondsUsed: number;
};

type DailyUsage = {
  date: string;
  conversationsUsed: number;
  currentConversation?: ConversationUsage;
};

const usageMap = new Map<string, DailyUsage>();

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Get today's usage for a user (resets daily)
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
 * Check if daily conversation limit is reached
 */
export function hasReachedDailyLimit(
  userId: string,
  maxConversations: number
): boolean {
  const usage = getDailyUsage(userId);
  return usage.conversationsUsed >= maxConversations;
}

/**
 * Start a new conversation timer
 */
export function startConversation(userId: string): void {
  const usage = getDailyUsage(userId);

  usage.currentConversation = {
    startTime: Date.now(),
    secondsUsed: 0
  };

  usageMap.set(userId, usage);
}

/**
 * Get remaining seconds for the current conversation
 */
export function getRemainingSeconds(
  userId: string,
  maxSeconds: number
): number {
  const usage = getDailyUsage(userId);
  const convo = usage.currentConversation;

  if (!convo) return maxSeconds;

  const elapsed =
    convo.secondsUsed +
    Math.floor((Date.now() - convo.startTime) / 1000);

  return Math.max(0, maxSeconds - elapsed);
}

/**
 * End conversation and increment daily count
 */
export function endConversation(userId: string): void {
  const usage = getDailyUsage(userId);

  usage.conversationsUsed += 1;
  delete usage.currentConversation;

  usageMap.set(userId, usage);
}
