
import app from "./app.js";
import { env } from "./config/env.js";
import {
  prisma,
  disconnectPrisma,
} from "./config/prisma.js";

const PORT = env.PORT;

async function startServer() {
  try {
    // Connect to Supabase PostgreSQL
    await prisma.$connect();

    console.log("Database connected successfully!");

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Graceful shutdown
    async function shutdown(signal) {
      console.log(`${signal} received. Shutting down...`);

      server.close(async () => {
        await disconnectPrisma();
        console.log("Database disconnected.");
        process.exit(0);
      });
    }

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

  } catch (error) {
    console.error("Server startup failed:", error);
    await disconnectPrisma();
    process.exit(1);
  }
}

startServer();
