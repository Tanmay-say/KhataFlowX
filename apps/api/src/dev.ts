import app from "./app.js";
import { env } from "./config/env.js";
import { startTelegram } from "./services/telegram.js";

app.listen(env.PORT, () => {
  console.log(`API listening on ${env.API_URL}`);
  if (env.TELEGRAM_MODE === "polling") void startTelegram().catch(() => console.error("Telegram polling could not start"));
});
