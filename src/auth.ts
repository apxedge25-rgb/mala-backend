import { FastifyRequest, FastifyReply } from "fastify";
import prisma from "./prisma.js";
import { verifyAccessToken } from "./token.js";

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;

  if (!authHeader) {
    return reply.status(401).send({ error: "Authorization header missing" });
  }

  const token = authHeader.replace("Bearer ", "");

  if (!token) {
    return reply.status(401).send({ error: "Token missing" });
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return reply.status(401).send({ error: "Invalid or expired token" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId }
  });

  if (!user) {
    return reply.status(401).send({ error: "User not found" });
  }

  if (user.status !== "ACTIVE") {
    return reply.status(403).send({ error: "User is banned" });
  }

  // 🔐 Attach user to request
  (request as any).user = user;
}
