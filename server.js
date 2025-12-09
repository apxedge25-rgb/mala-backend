import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import OpenAI from "openai";
import prisma from "./prismaClient.js";

const app = express();
app.use(cors());
app.use(bodyParser.json());

// OpenAI client (lazy)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  console.warn("WARNING: OPENAI_API_KEY not set in environment!");
}

// helper to call ChatGPT
async function callChatGPT(systemPrompt, userPrompt, max_tokens = 800) {
  if (!openai) throw new Error("OpenAI key missing");
  const resp = await openai.chat.completions.create({
    model: "gpt-4o-mini", // replace with the model you have access to if needed
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens,
    temperature: 0.2
  });
  return resp.choices?.[0]?.message?.content ?? "";
}

// health
app.get("/api/v1/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), openai: !!openai });
});

// root friendly
app.get("/", (req, res) => {
  res.send("Mala backend is running. Use /api/v1/health to check status.");
});

// explain-screen: create history + return resumeToken
app.post("/api/v1/explain-screen", async (req, res) => {
  try {
    const { screenText, language = "en", title } = req.body;
    if (!screenText || typeof screenText !== "string") {
      return res.status(400).json({ error: "screenText (string) is required" });
    }
    const langLabel = language === "hi" ? "Hindi" : "English";

    const systemPrompt = `You are Mala, an assistant that explains on-screen content simply and clearly for a beginner. Use the user's chosen language. Keep answers short and avoid inventing facts. Output should include an explanation divided into segments separated by the token <SEG> and a one-line summary starting with "SUMMARY:".`;

    const userPrompt = `ScreenText:
"""${screenText.slice(0, 6000)}"""

Language: ${langLabel}

Instruction: Explain the above to a beginner in ${langLabel}. Break the explanation into small segments separated by "<SEG>" so the client can read them one by one. After segments, provide a one-line summary prefixed with "SUMMARY:".`;

    const fullText = await callChatGPT(systemPrompt, userPrompt, 900);

    // split into segments
    const rawSegments = fullText.split("<SEG>").map(s => s.trim()).filter(Boolean);

    // find summary
    let summary = "";
    const summaryIndex = fullText.indexOf("SUMMARY:");
    if (summaryIndex !== -1) {
      summary = fullText.substring(summaryIndex + 8).trim().split("\n")[0].trim();
    } else if (rawSegments.length > 0) {
      summary = rawSegments[0].slice(0, 200);
    }

    // transcript structure
    const transcript = [
      { who: "system", type: "segments", segments: rawSegments },
      { who: "mala", type: "explanation_full", text: fullText, ts: new Date().toISOString() }
    ];

    // save to DB
    const history = await prisma.history.create({
      data: {
        title: title ?? (screenText.slice(0, 60) + "..."),
        screenText,
        explanation: fullText,
        transcript
      }
    });

    const resumeToken = { segmentIndex: 0 };

    return res.json({
      historyId: history.id,
      explanation: rawSegments.join("\n\n"),
      summary,
      resumeToken
    });
  } catch (err) {
    console.error("explain-screen error:", err);
    return res.status(500).json({ error: "internal_error", details: String(err?.message || err) });
  }
});

// follow-up endpoint
app.post("/api/v1/follow-up", async (req, res) => {
  try {
    const { historyId, userQuestion, resumeToken = { segmentIndex: 0 }, language = "en" } = req.body;
    if (!historyId || !userQuestion) return res.status(400).json({ error: "historyId and userQuestion required" });

    const history = await prisma.history.findUnique({ where: { id: historyId } });
    if (!history) return res.status(404).json({ error: "history not found" });

    const transcript = history.transcript || [];
    const segmentsEntry = transcript.find(t => t.type === "segments");
    const segments = segmentsEntry?.segments || [];

    const segIndex = (resumeToken.segmentIndex && Number.isInteger(resumeToken.segmentIndex)) ? resumeToken.segmentIndex : 0;
    const startContext = Math.max(0, segIndex - 2);
    const contextSegments = segments.slice(startContext, segIndex).join("\n");

    const systemPrompt = `You are Mala, an assistant answering a short follow-up question. Answer concisely in the user's chosen language. At the end, output a JSON object on its own line with the key "resumeIndex" which indicates the index of the next segment the client should resume from (an integer). Example: {"resumeIndex": 4}`;

    const userPrompt = `Context (last segments):
"""${contextSegments}"""

Full screen text:
"""${history.screenText}"""

User question: "${userQuestion}"
Language: ${language}

Instruction: Answer briefly and clearly. Then output the JSON resume object on its own line.`;

    const reply = await callChatGPT(systemPrompt, userPrompt, 300);

    // parse resume index
    const jsonMatch = reply.match(/\{[^}]*"resumeIndex"[^}]*\}/);
    let resumeIndex = segIndex;
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed.resumeIndex === "number") resumeIndex = parsed.resumeIndex;
      } catch (e) {
        console.warn("failed to parse resumeIndex json", e);
      }
    }

    const newTranscript = Array.isArray(transcript) ? transcript.slice() : [];
    newTranscript.push({ who: "user", type: "question", text: userQuestion, ts: new Date().toISOString() });
    newTranscript.push({ who: "mala", type: "followup_answer", text: reply, ts: new Date().toISOString() });

    await prisma.history.update({
      where: { id: historyId },
      data: { transcript: newTranscript, updatedAt: new Date() }
    });

    return res.json({ answer: reply, resumeToken: { segmentIndex: resumeIndex } });
  } catch (err) {
    console.error("follow-up error:", err);
    return res.status(500).json({ error: "internal_error", details: String(err?.message || err) });
  }
});

// get history by id
app.get("/api/v1/history/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const history = await prisma.history.findUnique({ where: { id } });
    if (!history) return res.status(404).json({ error: "history not found" });
    return res.json(history);
  } catch (err) {
    console.error("get history error:", err);
    return res.status(500).json({ error: "internal_error", details: String(err?.message || err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mala backend (Step1 + history) running on port ${PORT}`);
});
