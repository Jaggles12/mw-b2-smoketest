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
    const { rows } = await pool.query(
      `
      insert into runs (type, project, status, params, b2_prefix)
      values ($1, $2, $3, $4::jsonb, $5)
      returning id, type, project, status, created_at
      `,
      [
        "image",
        "juniper-hollow",
        "queued",
        JSON.stringify({ note: "railway db smoketest" }),
        "images/coloring-books/juniper-hollow/runs/db-smoketest"
      ]
    );

    res.json({
      ok: true,
      run: rows[0]
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err?.message ?? String(err)
    });
  }
});

app.get("/__admin/migrate-artifacts", async (req, res) => {
  try {
    // simple protection: require a token in the URL
    if (req.query.token !== process.env.ADMIN_MIGRATE_TOKEN) {
      return res.status(401).send("Unauthorized");
    }

    await pool.query(`
      create extension if not exists pgcrypto;

      create table if not exists artifacts (
        id uuid primary key default gen_random_uuid(),
        run_id uuid not null references runs(id) on delete cascade,
        kind text not null check (kind in ('image','text','model','other')),
        path text not null,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );

      create index if not exists artifacts_run_idx on artifacts(run_id);
      create index if not exists artifacts_kind_idx on artifacts(kind);
    `);

    res.send("ok");
  } catch (err) {
    console.error(err);
    res.status(500).send(String(err));
  }
});

/* =========================
   Start server
   ========================= */

app.listen(PORT, () => {
  console.log(`openclaw listening on port ${PORT}`);
});


