import Fastify from "fastify";
import dotenv from "dotenv";
import cors from "@fastify/cors";

import prisma from "../prisma";
import { generateAccessToken } from "../utils/token";
import { authMiddleware } from "../middleware/auth";
import { verifyGoogleToken } from "../utils/google";

dotenv.config();

const app = Fastify({
  logger: true
});

// ✅ ENABLE CORS
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
  protectedRoutes.addHook("preHandler", authMiddleware);

  protectedRoutes.get("/api/v1/me", async (request) => {
    const user = (request as any).user;

    return {
      id: user.id,
      status: user.status
    };
  });

  /**
   * --------------------
   * PHASE 3 — SETTINGS
   * --------------------
   */

  protectedRoutes.get("/api/v1/settings", async (request) => {
    const userId = (request as any).user.id;

    let settings = await prisma.userSetting.findUnique({
      where: { userId }
    });

    if (!settings) {
      settings = await prisma.userSetting.create({
        data: { userId }
      });
    }

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

    const settings = await prisma.userSetting.upsert({
      where: { userId },
      update: updateData,
      create: { userId, ...updateData }
    });

    return {
      success: true,
      settings: {
        language: settings.language,
        overlayEnabled: settings.overlayEnabled,
        micConsent: settings.micConsent,
        screenConsent: settings.screenConsent
      }
    };
  });
});

/**
 * --------------------
 * START SERVER
 * --------------------
 */
app.listen({ port: PORT, host: "0.0.0.0" })
  .then(() => {
    console.log(`🚀 Mala backend running on port ${PORT}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
