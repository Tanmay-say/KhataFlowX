import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { coreRouter } from "./routes/core.js";
import { chatRouter } from "./routes/chat.js";
import { voiceRouter } from "./routes/voice.js";

const app = express();

app.use(cors({ origin: env.CORS_ORIGINS }));
app.use(express.json());
app.use(authRouter);
app.use(coreRouter);
app.use(chatRouter);
app.use(voiceRouter);
app.use(healthRouter);

export default app;
