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
  // NOTE: ADMIN_MIGRATE_TOKEN is intentionally NOT required.
  // You can add it in Railway when you're ready to run the migration.
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
  ADMIN_MIGRATE_TOKEN,
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

/* --- Root (so you don't see "Cannot GET /") --- */
app.get("/", (_, res) => res.send("ok"));

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

app.get("/artifact-test", async (_, res) => {
  try {
    // 1) create a run (or reuse an existing run id if you want)
    const run = await pool.query(
      `
      insert into runs (type, project, status, params, b2_prefix)
      values ($1, $2, $3, $4::jsonb, $5)
      returning id
      `,
      [
        "image",
        "juniper-hollow",
        "queued",
        JSON.stringify({ note: "artifact smoketest" }),
        "images/coloring-books/juniper-hollow/runs/artifact-smoketest"
      ]
    );

    const runId = run.rows[0].id;

    // 2) insert an artifact that "belongs" to that run
    const artifact = await pool.query(
      `
      insert into artifacts (run_id, kind, path, metadata)
      values ($1, $2, $3, $4::jsonb)
      returning id, run_id, kind, path, created_at
      `,
      [
        runId,
        "image",
        "images/coloring-books/juniper-hollow/runs/artifact-smoketest/page-01.png",
        JSON.stringify({ note: "placeholder row, no file uploaded yet" })
      ]
    );

    res.json({ ok: true, runId, artifact: artifact.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message ?? String(err) });
  }
});

/* --- One-time migration route (REMOVE after success) --- */
app.get("/__admin/migrate-artifacts", async (req, res) => {
  try {
    // If you haven't set ADMIN_MIGRATE_TOKEN in Railway yet, this route should not run.
    if (!ADMIN_MIGRATE_TOKEN) {
      return res.status(500).send("ADMIN_MIGRATE_TOKEN is not set");
    }

    if (req.query.token !== ADMIN_MIGRATE_TOKEN) {
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
    res.status(500).send(err?.message ?? String(err));
  }
});

/* =========================
   Start server
   ========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`openclaw listening on port ${PORT}`);
});
