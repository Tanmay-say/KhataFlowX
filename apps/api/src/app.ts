import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";

const app = express();

app.use(cors({ origin: env.CORS_ORIGINS }));
app.use(express.json());
app.use(healthRouter);

export default app;
