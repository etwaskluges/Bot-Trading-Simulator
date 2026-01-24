import "dotenv/config";
import { startServer } from "./server";

async function bootstrap(): Promise<void> {
  await startServer();
}

bootstrap().catch((error) => {
  console.error("Fatal Bot Error:", error);
  process.exit(1);
});
