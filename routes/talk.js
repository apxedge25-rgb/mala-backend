// routes/talk.js
import express from "express";
import OpenAI from "openai";
import prisma from "../prismaClient.js";

const router = express.Router();

// OpenAI client
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  console.warn("WARNING: OPENAI_API_KEY not set in environment!");
}

// ✅ Correct OpenAI call (NEW Responses API)
async function callChatGPT(systemPrompt, userPrompt, max_tokens = 800) {
  if (!openai) throw new Error("OpenAI key missing");

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_output_tokens: max_tokens
  });

  return response.output_text;
}

/**
 * POST /
 * Body: { text: string }
 * Language is read from DB (UserSetting)
 */
router.post("/", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "text is required" });
    }

    // 🔹 Get saved language (no auth → single default user)
    const setting = await prisma.userSetting.findUnique({
      where: { userId: "default" }
    });

    const language = setting?.language || "en";

    const langLabel =
      language === "hi"
        ? "Hindi"
        : language === "te"
        ? "Telugu"
        : "English";

    const systemPrompt = `You are Mala.ai. Reply simply and clearly in ${langLabel}. Explain like teaching a beginner.`;

    const answer = await callChatGPT(systemPrompt, text, 700);

    // Save history
    let saved = false;
    try {
      await prisma.history.create({
        data: {
          title: text.slice(0, 60),
          screenText: text,
          explanation: answer,
          transcript: [
            { who: "user", text },
            { who: "mala", text: answer }
          ]
        }
      });
      saved = true;
    } catch (dbErr) {
      console.error("history save failed:", dbErr?.message || dbErr);
    }

    return res.json({ answerText: answer, saved });
  } catch (err) {
    console.error("POST /api/v1/talk error:", err?.message || err);
    return res.status(500).json({
      error: "internal_error",
      details: String(err?.message || err)
    });
  }
});

export default router;
