import pg from "pg";
const { Pool } = pg;

import express from "express";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const {
  B2_KEY_ID,
  B2_APP_KEY,
  B2_BUCKET,
  B2_ENDPOINT,
  B2_REGION,
  PORT = 3000,
} = process.env;

// fail fast if anything is missing
for (const k of ["B2_KEY_ID","B2_APP_KEY","B2_BUCKET","B2_ENDPOINT","B2_REGION"]) {
  if (!process.env[k]) throw new Error(`Missing env var: ${k}`);
}
for (const k of ["B2_KEY_ID","B2_APP_KEY","B2_BUCKET","B2_ENDPOINT","B2_REGION","DATABASE_URL"]) {
  if (!process.env[k]) throw new Error(`Missing env var: ${k}`);
}

const s3 = new S3Client({
  region: B2_REGION,
  endpoint: B2_ENDPOINT,
  credentials: {
    accessKeyId: B2_KEY_ID,
    secretAccessKey: B2_APP_KEY,
  },
  forcePathStyle: true, // important for S3-compatible providers
});

const app = express();

app.get("/health", (_, res) => res.json({ ok: true }));

app.get("/b2-test", async (_, res) => {
  const key = `smoketest/${new Date().toISOString()}-hello.txt`;
  const body = `hello from railway @ ${new Date().toISOString()}\n`;

  try {
    await s3.send(new PutObjectCommand({
      Bucket: B2_BUCKET,
      Key: key,
      Body: body,
      ContentType: "text/plain",
    }));
    res.json({ ok: true, bucket: B2_BUCKET, key });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err?.message ?? String(err),
    });
  }
});

app.get("/db-test", async (_, res) => {
  try {
    const q = `
      insert into runs (type, project, status, params, b2_prefix)
      values ($1, $2, $3, $4::jsonb, $5)
      returning id, type, project, status, created_at
    `;
    const values = [
      "image",
      "juniper-hollow",
      "queued",
      JSON.stringify({ note: "railway db smoketest" }),
      "images/coloring-books/juniper-hollow/runs/db-smoketest"
    ];

    const { rows } = await pool.query(q, values);
    res.json({ ok: true, run: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, message: err?.message ?? String(err) });
  }
});

app.get("/db-init", async (_, res) => {
  try {
    const sql = `
      create extension if not exists pgcrypto;

      create table if not exists runs (
        id uuid primary key default gen_random_uuid(),
        type text not null check (type in ('text','image')),
        project text not null,
        status text not null default 'queued'
          check (status in ('queued','running','succeeded','failed')),
        params jsonb not null default '{}'::jsonb,
        b2_prefix text,
        result jsonb not null default '{}'::jsonb,
        error text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists runs_project_idx on runs(project);
      create index if not exists runs_type_idx on runs(type);
      create index if not exists runs_status_idx on runs(status);
    `;

    await pool.query(sql);
    res.json({ ok: true, message: "runs table created" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => console.log(`listening on ${PORT}`));
