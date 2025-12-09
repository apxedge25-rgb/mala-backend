// routes/talk.js
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');
const { OpenAIApi, Configuration } = require('openai');

const openai = new OpenAIApi(new Configuration({
  apiKey: process.env.OPENAI_API_KEY
}));

/**
 * helper: optional TTS generator (ElevenLabs example)
 * returns { ttsUrl } or null
 * You can replace with OpenAI TTS or keep as null to use client-side TTS.
 */
async function generateTTS(text, language = 'en') {
  if (!process.env.ELEVENLABS_KEY) return null;

  // ElevenLabs REST API example (replace voice_id with desired voice)
  try {
    const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // default
    const resp = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      { text },
      {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer',
        timeout: 120000
      }
    );

    // upload to your S3 / Supabase storage here.
    // For MVP we will return base64 in memory (NOT recommended for production)
    const base64 = Buffer.from(resp.data, 'binary').toString('base64');
    // Option A: upload base64 to storage and return URL
    // Option B (temporary): return data URL (smaller apps only)
    return { ttsDataUrl: `data:audio/mpeg;base64,${base64}` };
  } catch (err) {
    console.error('TTS error', err?.response?.data || err.message);
    return null;
  }
}

/**
 * POST /talk
 * body: { text: string, language?: 'en'|'hi'|'te', wantTTS?: boolean }
 */
router.post('/', async (req, res) => {
  try {
    const { text, language = null, wantTTS = false } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'text required' });
    }

    // Resolve language priority: request -> user setting -> default 'en'
    let lang = language;
    if (!lang && req.user?.id) {
      const us = await prisma.userSetting.findUnique({ where: { userId: req.user.id }});
      if (us) lang = us.language;
    }
    lang = lang || 'en';

    // Build system & user prompt
    const systemPrompt = `You are Mala.ai, an assistant for students. Always reply in ${lang === 'te' ? 'Telugu' : (lang === 'hi' ? 'Hindi' : 'English')}. Keep answers short, simple, and friendly. When asked to explain a concept, provide: 1) 1-2 line summary, 2) 3 short bullets of key points, 3) 1 example or quick question.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text }
    ];

    // Call OpenAI (chat completion)
    const completion = await openai.createChatCompletion({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini', // choose your model
      messages,
      max_tokens: 700,
      temperature: 0.2
    });

    const answerText = completion.data.choices?.[0]?.message?.content?.trim();
    // token usage (if available)
    const usage = completion.data.usage || null;

    // Save to DB history (non-blocking but ensure saved for MVP)
    let saved = false;
    try {
      await prisma.history.create({
        data: {
          userId: req.user?.id || null,
          question: text,
          answer: answerText || '',
          language: lang,
          source: 'voice'
        }
      });
      saved = true;
    } catch (dbErr) {
      console.error('History save failed', dbErr.message);
      // don't fail the whole request; just log
    }

    // Optionally generate TTS (may be slow)
    let tts = null;
    if (wantTTS) {
      tts = await generateTTS(answerText || '', lang);
    }

    // return
    const payload = {
      answerText,
      tts: tts || null,
      saved,
      usage
    };

    return res.json(payload);
  } catch (err) {
    console.error('/talk error', err.message || err);
    return res.status(500).json({ error: 'server error', details: err.message });
  }
});

module.exports = router;
