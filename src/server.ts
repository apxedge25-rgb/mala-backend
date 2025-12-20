import Fastify from "fastify";
import dotenv from "dotenv";
import cors from "@fastify/cors";

import prisma from "./prisma.js";
import { generateAccessToken } from "./token.js";
import { authMiddleware } from "./auth.js";
import { verifyGoogleToken } from "./google.js";

// Phase imports
import { resolveUserPlan } from "./plans/resolveUserPlan.js";
import { getOrCreateUserSettings } from "./settings/settingsService.js";
import { talkHandler } from "./routes/talk.js";

dotenv.config();

const app = Fastify({
  logger: true
});

// CORS
await app.register(cors, {
  origin: true
});

const PORT = Number(process.env.PORT) || 3000;

/**
 * --------------------
 * PUBLIC ROUTES
 * --------------------
 */

app.get("/health", async () => {
  return { status: "ok" };
});

app.post("/api/v1/user/init", async (request, reply) => {
  const { deviceId } = request.body as { deviceId?: string };

  if (!deviceId) {
    return reply.status(400).send({ error: "deviceId is required" });
  }

  let user = await prisma.user.findUnique({
    where: { deviceId }
  });

  if (!user) {
    user = await prisma.user.create({
      data: { deviceId }
    });
  }

  const token = generateAccessToken(user.id);

  return {
    id: user.id,
    status: user.status,
    token
  };
});

app.post("/api/v1/auth/google", async (request, reply) => {
  const { idToken, deviceId } = request.body as {
    idToken?: string;
    deviceId?: string;
  };

  if (!idToken || !deviceId) {
    return reply.status(400).send({
      error: "idToken and deviceId are required"
    });
  }

  const googleUser = await verifyGoogleToken(idToken);

  const user = await prisma.user.findUnique({
    where: { deviceId }
  });

  if (!user) {
    return reply.status(404).send({
      error: "User not found for device"
    });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      googleId: googleUser.googleId,
      email: googleUser.email
    }
  });

  const token = generateAccessToken(user.id);

  return {
    id: user.id,
    status: user.status,
    token
  };
});

/**
 * --------------------
 * PROTECTED ROUTES
 * --------------------
 */
app.register(async function (protectedRoutes) {
  // 1️⃣ AUTH
  protectedRoutes.addHook("preHandler", authMiddleware);

  // 2️⃣ PLAN RESOLUTION (Phase 4A)
  protectedRoutes.addHook("preHandler", async (request) => {
    (request as any).plan = resolveUserPlan(request);
  });

  // 3️⃣ SETTINGS ATTACH (Phase 3 HARDENED)
  protectedRoutes.addHook("preHandler", async (request) => {
    const user = (request as any).user;
    const settings = await getOrCreateUserSettings(user.id);
    (request as any).settings = settings;
  });

  protectedRoutes.get("/api/v1/me", async (request) => {
    const user = (request as any).user;
    const plan = (request as any).plan;
    const settings = (request as any).settings;

    return {
      id: user.id,
      status: user.status,
      plan,
      settings
    };
  });

  /**
   * --------------------
   * PHASE 3 — SETTINGS
   * --------------------
   */

  protectedRoutes.get("/api/v1/settings", async (request) => {
    const settings = (request as any).settings;

    return {
      language: settings.language,
      overlayEnabled: settings.overlayEnabled,
      micConsent: settings.micConsent,
      screenConsent: settings.screenConsent
    };
  });

  protectedRoutes.post("/api/v1/settings", async (request, reply) => {
    const userId = (request as any).user.id;
    const { language, overlayEnabled, micConsent, screenConsent } =
      request.body as any;

    const updateData: any = {};

    if (language) {
      if (!["en", "hi", "te"].includes(language)) {
        return reply.status(400).send({ error: "invalid_language" });
      }
      updateData.language = language;
    }

    if (typeof overlayEnabled === "boolean") {
      updateData.overlayEnabled = overlayEnabled;
    }

    if (typeof micConsent === "boolean") {
      updateData.micConsent = micConsent;
    }

    if (typeof screenConsent === "boolean") {
      updateData.screenConsent = screenConsent;
    }

    const settings = await prisma.userSetting.update({
      where: { userId },
      data: updateData
    });

    return {
      success: true,
      settings
    };
  });

  /**
   * --------------------
   * PHASE 9 / 10A — TALK
   * --------------------
   */
  protectedRoutes.post("/api/v1/talk", async (request, reply) => {
    const settings = (request as any).settings;

    // 🔒 CONSENT ENFORCEMENT (Phase 3 FINAL)
    if (!settings.micConsent) {
      return reply.status(403).send({
        error: "mic_consent_required"
      });
    }

    return talkHandler(request, reply);
  });
});

/**
 * --------------------
 * START SERVER
 * --------------------
 */
app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => {
    console.log(`🚀 Mala backend running on port ${PORT}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
