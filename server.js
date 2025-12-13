// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import OpenAI from "openai";
import prisma from "./prismaClient.js";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// OpenAI client
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  console.warn("WARNING: OPENAI_API_KEY not set in environment!");
}

// ✅ FIXED: NEW OpenAI Responses API
async function callChatGPT(systemPrompt, userPrompt, max_tokens = 800) {
  if (!openai) throw new Error("OpenAI key missing");

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userPrompt
      }
    ],
    max_output_tokens: max_tokens
  });

  return response.output_text;
}

// ---------------- HEALTH ----------------
app.get("/api/v1/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), openai: !!openai });
});

app.get("/", (req, res) => {
  res.send("Mala backend is running. Use /api/v1/health to check status.");
});

// ---------------- EXPLAIN SCREEN ----------------
app.post("/api/v1/explain-screen", async (req, res) => {
  try {
    const { screenText, language = "en", title } = req.body;
    if (!screenText || typeof screenText !== "string") {
      return res.status(400).json({ error: "screenText (string) is required" });
    }

    const langLabel =
      language === "hi" ? "Hindi" : language === "te" ? "Telugu" : "English";

    const systemPrompt = `You are Mala, a friendly tutor. Explain the content simply in ${langLabel}. Use <SEG> to split explanation into parts.`;

    const userPrompt = `Screen text:
"""${screenText.slice(0, 6000)}"""
Explain this to a beginner in ${langLabel}.
Break into segments using <SEG>.
Add one-line summary starting with "SUMMARY:".`;

    const fullText = await callChatGPT(systemPrompt, userPrompt, 900);

    const rawSegments = fullText
      .split("<SEG>")
      .map(s => s.trim())
      .filter(Boolean);

    let summary = "";
    const summaryIndex = fullText.indexOf("SUMMARY:");
    if (summaryIndex !== -1) {
      summary = fullText.substring(summaryIndex + 8).trim().split("\n")[0];
    }

    const transcript = [
      { who: "system", type: "segments", segments: rawSegments },
      {
        who: "mala",
        type: "explanation_full",
        text: fullText,
        ts: new Date().toISOString()
      }
    ];

    const history = await prisma.history.create({
      data: {
        title: title ?? screenText.slice(0, 60) + "...",
        screenText,
        explanation: fullText,
        transcript
      }
    });

    return res.json({
      historyId: history.id,
      explanation: rawSegments.join("\n\n"),
      summary,
      resumeToken: { segmentIndex: 0 }
    });
  } catch (err) {
    console.error("explain-screen error:", err);
    return res.status(500).json({ error: "internal_error", details: String(err.message) });
  }
});

// ---------------- FOLLOW-UP ----------------
app.post("/api/v1/follow-up", async (req, res) => {
  try {
    const { historyId, userQuestion, resumeToken = { segmentIndex: 0 }, language = "en" } = req.body;

    if (!historyId || !userQuestion) {
      return res.status(400).json({ error: "historyId and userQuestion required" });
    }

    const history = await prisma.history.findUnique({ where: { id: historyId } });
    if (!history) return res.status(404).json({ error: "history not found" });

    const transcript = history.transcript || [];
    const segmentsEntry = transcript.find(t => t.type === "segments");
    const segments = segmentsEntry?.segments || [];

    const segIndex = Number.isInteger(resumeToken.segmentIndex) ? resumeToken.segmentIndex : 0;
    const contextSegments = segments.slice(Math.max(0, segIndex - 2), segIndex).join("\n");

    const langLabel =
      language === "hi" ? "Hindi" : language === "te" ? "Telugu" : "English";

    const systemPrompt = `You are Mala. Answer briefly in ${langLabel}. At the end output {"resumeIndex": number}`;

    const userPrompt = `Context:
"""${contextSegments}"""

Full screen text:
"""${history.screenText}"""

User asks: "${userQuestion}"`;

    const reply = await callChatGPT(systemPrompt, userPrompt, 350);

    await prisma.history.update({
      where: { id: historyId },
      data: { transcript: [...transcript, { who: "mala", type: "followup", text: reply }] }
    });

    return res.json({ answer: reply, resumeToken: { segmentIndex: segIndex + 1 } });
  } catch (err) {
    console.error("follow-up error:", err);
    return res.status(500).json({ error: "internal_error", details: String(err.message) });
  }
});

// ---------------- TALK ----------------
app.post("/api/v1/talk", async (req, res) => {
  try {
    const { text, language = "en" } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });

    const langLabel =
      language === "hi" ? "Hindi" : language === "te" ? "Telugu" : "English";

    const systemPrompt = `You are Mala.ai. Speak simply in ${langLabel}.`;

    const answer = await callChatGPT(systemPrompt, text, 700);

    await prisma.history.create({
      data: {
        title: text.slice(0, 60),
        screenText: text,
        explanation: answer,
        transcript: [{ who: "mala", text: answer }]
      }
    });

    return res.json({ answerText: answer, saved: true });
  } catch (err) {
    console.error("talk error:", err);
    return res.status(500).json({ error: "internal_error", details: String(err.message) });
  }
});

// ---------------- START ----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mala backend MVP running on port ${PORT}`);
});
