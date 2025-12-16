import Fastify from "fastify";
import dotenv from "dotenv";
import prisma from "./prisma.js";

dotenv.config();

const app = Fastify({
  logger: true
});

const PORT = Number(process.env.PORT) || 3000;

/**
 * Health check
 */
app.get("/health", async () => {
  return { status: "ok" };
});

/**
 * User init (create user if not exists)
 * Device-based identity
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

  return {
    id: user.id,
    status: user.status
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
