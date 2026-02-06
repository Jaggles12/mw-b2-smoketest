import express from "express";
import pg from "pg";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

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

/* --- Health --- */
app.get("/health", (_, res) => {
  res.json({ ok: true });
});

/* --- Backblaze smoke test --- */
app.get("/b2-test", async (_, res) => {
  try {
    const key = `smoketest/${new Date().toISOString()}-hello.txt`;

    await s3.send(
      new PutObjectCommand({
        Bucket: B2_BUCKET,
        Key: key,
        Body: `hello from railway @ ${new Date().toISOString()}\n`,
        ContentType: "text/plain"
      })
    );

    res.json({
      ok: true,
      bucket: B2_BUCKET,
      key
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err?.message ?? String(err)
    });
  }
});

/* --- Postgres smoke test --- */
app.get("/db-test", async (_, res) => {
  try {
    const { rows } = await poo

