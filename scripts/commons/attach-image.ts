/**
 * Attaches a Wikimedia Commons file to an event (stores license and author credit).
 *
 *   npx tsx scripts/commons/attach-image.ts --event great-pyramid-of-giza \
 *     --file "File:Kheops-Pyramid.jpg" --caption "The Great Pyramid of Giza" [--alt "..."] [--role hero|gallery]
 *
 * Uses DATABASE_URL with a role that can write (the Supabase `postgres` connection string).
 * Non-free files are refused. Every Commons and database call is logged.
 */
import { parseArgs } from "node:util";
import postgres from "postgres";
import { logExternalCall, logger } from "@/lib/log/logger";
import { fetchCommonsFile, NotFreeError } from "./commons";

async function main() {
  const { values } = parseArgs({
    options: {
      event: { type: "string" },
      file: { type: "string" },
      caption: { type: "string" },
      alt: { type: "string" },
      role: { type: "string", default: "hero" },
      locale: { type: "string", default: "en" },
    },
  });
  if (!values.event || !values.file || !values.caption) {
    console.error(
      'Usage: attach-image.ts --event <slug> --file "File:Name.jpg" --caption "..." [--alt "..."] [--role hero|gallery]',
    );
    process.exit(2);
  }
  if (values.role !== "hero" && values.role !== "gallery") throw new Error("--role must be hero or gallery");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

  const info = await fetchCommonsFile(values.file);
  const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await logExternalCall(
      { service: "database", operation: "images.attach", meta: { event: values.event, file: info.commonsFile } },
      () =>
        sql.begin(async (tx) => {
          const [event] = await tx`select id from public.events where slug = ${values.event!}`;
          if (!event) throw new Error(`No event with slug ${values.event}`);
          const [image] = await tx`
            insert into public.images (commons_file, file_page_url, original_url, width, height, mime_type,
              license_short_name, license_url, author_text, author_url, credit_text, attribution_required, is_free, retrieved_at)
            values (${info.commonsFile}, ${info.filePageUrl}, ${info.originalUrl}, ${info.width}, ${info.height}, ${info.mimeType},
              ${info.licenseShortName}, ${info.licenseUrl}, ${info.authorText}, ${info.authorUrl}, ${info.creditText},
              ${info.attributionRequired}, true, now())
            on conflict (commons_file) do update set
              file_page_url = excluded.file_page_url, original_url = excluded.original_url, width = excluded.width,
              height = excluded.height, mime_type = excluded.mime_type, license_short_name = excluded.license_short_name,
              license_url = excluded.license_url, author_text = excluded.author_text, author_url = excluded.author_url,
              credit_text = excluded.credit_text, attribution_required = excluded.attribution_required, retrieved_at = now()
            returning id`;
          await tx`
            insert into public.image_translations (image_id, locale, caption, alt_text)
            values (${image.id}, ${values.locale!}, ${values.caption!}, ${values.alt ?? values.caption!})
            on conflict (image_id, locale) do update set caption = excluded.caption, alt_text = excluded.alt_text`;
          if (values.role === "hero") {
            await tx`update public.event_images set role = 'gallery' where event_id = ${event.id} and role = 'hero' and image_id <> ${image.id}`;
          }
          await tx`
            insert into public.event_images (event_id, image_id, role)
            values (${event.id}, ${image.id}, ${values.role!})
            on conflict (event_id, image_id) do update set role = excluded.role`;
        }),
    );
    logger.info(
      { event: values.event, file: info.commonsFile, license: info.licenseShortName, author: info.authorText },
      "image attached",
    );
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  if (err instanceof NotFreeError) {
    logger.warn({ reason: err.message }, "image refused");
    console.error(err.message);
    process.exit(3);
  }
  logger.error({ err: { name: err?.name, message: err?.message } }, "attach-image failed");
  console.error(err);
  process.exit(1);
});
