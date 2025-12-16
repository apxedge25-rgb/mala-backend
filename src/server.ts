import Fastify from "fastify";
import dotenv from "dotenv";

dotenv.config();

const app = Fastify({
  logger: true
});

const PORT = Number(process.env.PORT) || 3000;

app.get("/health", async () => {
  return { status: "ok" };
});

app.listen({ port: PORT, host: "0.0.0.0" })
  .then(() => {
    console.log(`🚀 Mala backend running on port ${PORT}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
