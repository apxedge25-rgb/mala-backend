// src/routes/talk.ts

import OpenAI from "openai";
import {
  hasReachedDailyLimit,
  startConversation,
  hasTimeExpired,
  endConversation
} from "../usage/usageStore.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function talkHandler(request: any, reply: any) {
  try {
    // 1️⃣ Auth user (already injected by middleware)
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const userId = user.id;

    // 2️⃣ Get resolved plan (from server.ts)
    const plan = request.plan;
    if (!plan) {
      return reply.status(500).send({ error: "plan_not_resolved" });
    }

    // 3️⃣ Validate input FIRST (do not burn time)
    const { message } = request.body as { message?: string };

    if (!message || typeof message !== "string") {
      return reply.status(400).send({ error: "message is required" });
    }

    // 4️⃣ Check daily conversation limit
    if (hasReachedDailyLimit(userId, plan.convosPerDay)) {
      return reply.send({
        text: "That’s all for today. We’ll continue tomorrow."
      });
    }

    // 5️⃣ Start conversation (single-turn for now)
    startConversation(userId);

    // 6️⃣ Enforce time limit BEFORE OpenAI
    if (hasTimeExpired(userId, plan.maxSecondsPerConvo)) {
      endConversation(userId);
      return reply.send({
        text: "We’re out of time for this conversation."
      });
    }

    // 7️⃣ Call OpenAI (TEXT ONLY)
    const completion = await openai.responses.create({
      model: "gpt-4o-mini",
      input: message,
      max_output_tokens: 300
    });

    const text =
      completion.output_text ||
      "Sorry, I couldn’t understand that.";

    // 8️⃣ End conversation (Phase 10 will change this)
    endConversation(userId);

    // 9️⃣ Return response
    return reply.send({
      text,
      meta: {
        plan: plan.id,
        maxSeconds: plan.maxSecondsPerConvo
      }
    });
  } catch (err) {
    console.error("talk error:", err);
    return reply.status(500).send({
      error: "Something went wrong"
    });
  }
}
