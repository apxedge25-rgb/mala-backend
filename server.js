import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(bodyParser.json());

if (!process.env.OPENAI_API_KEY) {
  console.error("WARNING: OPENAI_API_KEY not set in environment!");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Health
app.get("/api/v1/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Main endpoint
app.post("/api/v1/explain-screen", async (req, res) => {
  try {
    const { screenText, language } = req.body;
    if (!screenText || typeof screenText !== "string") {
      return res.status(400).json({ error: "screenText (string) is required" });
    }
    const lang = language === "hi" ? "Hindi" : "English";

    const systemPrompt = `You are Mala, an assistant that explains on-screen content simply and clearly for a beginner. Use the user's chosen language. Keep answers short, stepwise if applicable, and avoid inventing facts. Output should include a short plain explanation and a one-sentence summary.`;

    const userPrompt = `ScreenText:
"""${screenText.slice(0, 6000)}"""
Language: ${lang}

Instruction: Explain the above to a beginner in ${lang}. Keep it simple and clear. Provide a short explanation and then a one-sentence summary prefixed with "SUMMARY:".`;

    // Call OpenAI Chat (replace model name if required by your account)
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 600,
      temperature: 0.2
    });

    const text = response.choices?.[0]?.message?.content || "";
    const summaryIndex = text.indexOf("SUMMARY:");
    let explanation = text;
    let summary = "";
    if (summaryIndex !== -1) {
      explanation = text.substring(0, summaryIndex).trim();
      summary = text.substring(summaryIndex).replace(/^SUMMARY:\s*/i, "").trim();
    }

    return res.json({ explanation, summary });
  } catch (err) {
    console.error("explain-screen error:", err);
    return res.status(500).json({ error: "internal_error", details: String(err?.message || err) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mala backend (Step1) running on port ${PORT}`);
});
