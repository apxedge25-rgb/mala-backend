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

// ---------------- OPENAI CALL ----------------
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

// ---------------- HEALTH ----------------
app.get("/api/v1/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), openai: !!openai });
});

app.get("/", (req, res) => {
  res.send("Mala backend is running.");
});

// ---------------- LANGUAGE SETTINGS ----------------

// Save language
app.post("/api/v1/settings/language", async (req, res) => {
  try {
    const { language } = req.body;

    if (!language) {
      return res.status(400).json({ error: "language is required" });
    }

    if (!["en", "hi", "te"].includes(language)) {
      return res.status(400).json({ error: "invalid language" });
    }

    const setting = await prisma.userSetting.upsert({
      where: { userId: "default" },
      update: { language },
      create: { userId: "default", language }
    });

    return res.json({ success: true, language: setting.language });
  } catch (err) {
    console.error("save language error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// Get language
app.get("/api/v1/settings/language", async (req, res) => {
  try {
    const setting = await prisma.userSetting.findUnique({
      where: { userId: "default" }
    });

    return res.json({ language: setting?.language || "en" });
  } catch (err) {
    console.error("get language error:", err);
    return res.status(500).json({ error: "internal_error" });
  }
});

// ---------------- TALK ----------------
app.post("/api/v1/talk", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "text is required" });
    }

    // 🔹 Get saved language
    const setting = await prisma.userSetting.findUnique({
      where: { userId: "default" }
    });

    const language = setting?.language || "en";

    const langLabel =
      language === "hi" ? "Hindi" :
      language === "te" ? "Telugu" :
      "English";

    const systemPrompt = `You are Mala.ai. Speak simply in ${langLabel}.`;

    const answer = await callChatGPT(systemPrompt, text, 700);

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
