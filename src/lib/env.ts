import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  /**
   * Postgres connection string for the Supabase database. Use the pooled
   * "Transaction" connection string (port 6543) on Vercel, with ?sslmode=require.
   * The app only ever reads, inside read-only transactions running as the `anon` role.
   */
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine((v) => /^postgres(ql)?:\/\//.test(v), "DATABASE_URL must be a postgres:// URL"),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
});

let cached: z.infer<typeof serverEnvSchema> | undefined;

export function serverEnv() {
  if (!cached) {
    const parsed = serverEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid server environment: ${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Public base URL for canonical links, sitemap and Open Graph. */
export function siteUrl(): URL {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined) ??
    "http://localhost:3000";
  return new URL(raw);
}
