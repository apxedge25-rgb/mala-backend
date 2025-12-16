import Fastify from "fastify";
import dotenv from "dotenv";
import cors from "@fastify/cors";
import prisma from "./prisma.js";
import { generateAccessToken } from "./utils/token.js";
import { authMiddleware } from "./middleware/auth.js";
import { verifyGoogleToken } from "./utils/google.js";

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

/**
 * Health check (public)
 */
app.get("/health", async () => {
  return { status: "ok" };
});

/**
 * User init (public)
 * - Create user if not exists
 * - Issue access token
 */
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

/**
 * Google login (public)
 * - Verify Google ID token
 * - Link Google account to existing user
 * - Issue JWT
 */
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

  // 1️⃣ Verify Google token with Google
  const googleUser = await verifyGoogleToken(idToken);

  // 2️⃣ Find existing user by deviceId
  const user = await prisma.user.findUnique({
    where: { deviceId }
  });

  if (!user) {
    return reply.status(404).send({
      error: "User not found for device"
    });
  }

  // 3️⃣ Link Google account (idempotent)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      googleId: googleUser.googleId,
      email: googleUser.email
    }
  });

  // 4️⃣ Issue our JWT
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
  // 🔐 Apply auth middleware to ALL routes here
  protectedRoutes.addHook("preHandler", authMiddleware);

  /**
   * Get current user (who am I)
   */
  protectedRoutes.get("/api/v1/me", async (request) => {
    const user = (request as any).user;

    return {
      id: user.id,
      status: user.status
    };
  });

  // 🔒 Future protected APIs go here
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
