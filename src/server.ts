import Fastify from "fastify";
import dotenv from "dotenv";
import cors from "@fastify/cors";
import prisma from "./prisma.js";
import { generateAccessToken } from "./utils/token.js";

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

  // 🔐 ISSUE ACCESS TOKEN
  const token = generateAccessToken(user.id);

  return {
    id: user.id,
    status: user.status,
    token
  };
});

/**
 * Start server
 */
app.listen({ port: PORT, host: "0.0.0.0" })
  .then(() => {
    console.log(`🚀 Mala backend running on port ${PORT}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
