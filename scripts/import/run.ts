/**
 * Importer command line.
 *
 *   npx tsx scripts/import/run.ts fetch --out data/import/bundle.json.gz [--cache .import-cache]
 *   npx tsx scripts/import/run.ts load --in data/import/bundle.json.gz      (needs DATABASE_URL)
 *
 * Runs in GitHub Actions (.github/workflows/import.yml): weekly, or on demand.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { gunzipSync, gzipSync } from "node:zlib";
import postgres from "postgres";
import { logger } from "@/lib/log/logger";
import { DEFAULT_LIMITS, fetchBundle } from "./fetch";
import { Http } from "./http";
import { loadBundle } from "./load";
import { BundleSchema } from "./model";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: "string" },
    in: { type: "string" },
    cache: { type: "string" },
    people: { type: "string" },
    events: { type: "string" },
  },
});

async function readBundle(file: string) {
  const raw = await readFile(file);
  const text = file.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  return BundleSchema.parse(JSON.parse(text));
}

async function main() {
  const command = positionals[0];
  if (command === "fetch") {
    if (!values.out) throw new Error("fetch needs --out <file>");
    const http = new Http({ cacheDir: values.cache ?? null, concurrency: 4 });
    const bundle = await fetchBundle(http, {
      ...DEFAULT_LIMITS,
      ...(values.people ? { people: Number(values.people) } : {}),
      ...(values.events ? { events: Number(values.events) } : {}),
    });
    const text = JSON.stringify(bundle);
    await mkdir(path.dirname(values.out), { recursive: true });
    await writeFile(values.out, values.out.endsWith(".gz") ? gzipSync(text) : text);
    logger.info({ kind: "import", file: values.out, bytes: text.length }, "bundle written");
  } else if (command === "load") {
    if (!values.in) throw new Error("load needs --in <file>");
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const bundle = await readBundle(values.in);
    const sql = postgres(url, {
      prepare: false,
      max: 1,
      onnotice: () => {},
      connection: { application_name: "history-timeline-import" },
    });
    try {
      const result = await loadBundle(sql, bundle);
      logger.info({ kind: "import", ...result }, "bundle loaded");
    } finally {
      await sql.end();
    }
  } else {
    throw new Error("Usage: run.ts fetch --out <file> | load --in <file>");
  }
}

main().catch((err: Error) => {
  logger.error({ kind: "import", err: { name: err?.name, message: err?.message, stack: err?.stack } }, "import failed");
  process.exitCode = 1;
});
