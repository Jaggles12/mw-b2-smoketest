import express from "express";
import pg from "pg";
import { S3Client } from "@aws-sdk/client-s3";

const { Pool } = pg;

/* =========================
   Environment validation
   ========================= */

const REQUIRED_ENV = [
  "DATABASE_URL",
  "B2_KEY_ID",
  "B2_APP_KEY",
  "B2_BUCKET",
  "B2_ENDPOINT",
  "B2_REGION"
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const {
  DATABASE_URL,
  B2_KEY_ID,
  B2_APP_KEY,
  B2_BUCKET,
  B2_ENDPOINT,
  B2_REGION,
  PORT = 3000
} = process.env;

/* =========================
   Clients
   ========================= */

const pool = new Pool({
  connectionString: DATABASE_URL
});

const s3 = new S3Client({
  region: B2_REGION,
  endpoint: B2_ENDPOINT,
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APP_KEY
  },
  forcePathStyle: true
});

/* =========================
   App
   ========================= */

const app = express();
app.use(express.json());

app.get("/", (_, res) => res.send("ok"));

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

/* =========================
   Start server
   ========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`openclaw listening on port ${PORT}`);
});
