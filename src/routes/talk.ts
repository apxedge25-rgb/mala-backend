// src/routes/talk.ts

import OpenAI from "openai";
import { resolveUserPlan } from "../plans/resolveUserPlan.js";
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
    // 1️⃣ Get user
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: "unauthorized" });
    }

    const userId = user.id;

    // 2️⃣ Resolve plan
    const plan = resolveUserPlan(request);

    // 3️⃣ Check daily conversation limit
    if (hasReachedDailyLimit(userId, plan.convosPerDay)) {
      return reply.send({
        text: "That’s all for today. We’ll continue tomorrow."
      });
    }

    // 4️⃣ Start or resume conversation
    startConversation(userId);

    // 5️⃣ Check time limit BEFORE OpenAI
    if (hasTimeExpired(userId, plan.maxSecondsPerConvo)) {
      endConversation(userId);
      return reply.send({
        text: "We’re out of time for this conversation."
      });
    }

    const { message } = request.body as { message?: string };

    if (!message || typeof message !== "string") {
      return reply.status(400).send({ error: "message is required" });
    }

    // 6️⃣ Call OpenAI (TEXT ONLY)
    const completion = await openai.responses.create({
      model: "gpt-4o-mini",
      input: message,
      max_output_tokens: 300
    });

    const text =
      completion.output_text ||
      "Sorry, I couldn’t understand that.";

    // 7️⃣ End conversation
    endConversation(userId);

    // 8️⃣ Return response
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
