import "dotenv/config";
import { startServer } from "./server";
import { sessionManager } from "./session/sessionManager";

const AUTO_START_SESSION = process.env.BOT_LOGIC_AUTO_START !== "false";

async function bootstrap(): Promise<void> {
  await startServer();

  if (AUTO_START_SESSION) {
    const session = sessionManager.createSession({
      name: "Default CLI session",
    });
    console.log("🤖 Default bot session started", session.id);
  }
}

bootstrap().catch((error) => {
  console.error("Fatal Bot Error:", error);
  process.exit(1);
});
