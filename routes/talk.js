// routes/talk.js
import express from "express";
import OpenAI from "openai";
import prisma from "../prismaClient.js"; // adjust path if needed

const router = express.Router();

// OpenAI client
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  console.warn("WARNING: OPENAI_API_KEY not set in environment!");
}

/**
 * Helper: call ChatGPT
 * Keeps same model behavior as server.js
 */
async function callChatGPT(systemPrompt, userPrompt, max_tokens = 800) {
  if (!openai) throw new Error("OpenAI key missing");

  const resp = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens,
    temperature: 0.2
  });

  return resp.choices?.[0]?.message?.content ?? "";
}

/**
 * POST /
 * Body: { text: string, language?: 'en'|'hi'|'te' }
 * Response: { answerText, saved }
 */
router.post("/", async (req, res) => {
  try {
    const { text, language = "en" } = req.body;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "text is required" });
    }

    // map language label for prompt clarity
    const langLabel =
      language === "hi" ? "Hindi" : language === "te" ? "Telugu" : "English";

    const systemPrompt = `You are Mala.ai. Reply simply and clearly in ${langLabel}. Provide a 1-2 line summary, 2-3 short bullet points, and one quick example when appropriate. Keep language friendly and concise for a student.`;

    // Use the raw text user sent as the user prompt
    const answer = await callChatGPT(systemPrompt, text, 700);

    // build transcript entry (keeps format consistent with schema)
    const transcript = [
      { who: "user", type: "question", text: text, ts: new Date().toISOString() },
      { who: "mala", type: "answer", text: answer, ts: new Date().toISOString() }
    ];

    let saved = false;
    try {
      await prisma.history.create({
        data: {
          // title: first 60 chars of question
          title: text.slice(0, 60),
          screenText: text,
          explanation: answer,
          transcript
        }
      });
      saved = true;
    } catch (dbErr) {
      console.error("history save failed:", dbErr?.message || dbErr);
      // do not fail the request on DB error; just log it
    }

    return res.json({ answerText: answer, saved });
  } catch (err) {
    console.error("POST /api/v1/talk error:", err?.message || err);
    return res.status(500).json({ error: "internal_error", details: String(err?.message || err) });
  }
});

export default router;
