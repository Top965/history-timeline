import type { CommonsImage } from "@/lib/content/types";
import { commonsSrcSet, commonsThumbUrl } from "@/lib/commons/thumbnails";
import type { Locale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/messages";

type Props = {
  locale: Locale;
  kind: "photo" | "map";
  caption: string;
  captionLocale?: Locale;
  image: CommonsImage | null;
  priority?: boolean;
  sizes?: string;
};

/**
 * A Wikimedia Commons image loaded straight from Commons thumbnails, with the
 * author and license credit the license requires. Without an image yet, shows
 * the striped placeholder from the prototype.
 */
export function CommonsFigure({
  locale,
  kind,
  caption,
  captionLocale,
  image,
  priority,
  sizes = "(max-width: 792px) 100vw, 760px",
}: Props) {
  const t = getMessages(locale);
  return (
    <figure className="m-0 grid gap-1.5">
      {image ? (
        // Plain <img>: Commons serves the thumbnails, so Next's image optimizer (and its cost) is not involved.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={commonsThumbUrl(image, 960)}
          srcSet={commonsSrcSet(image)}
          sizes={sizes}
          width={image.width}
          height={image.height}
          alt={image.alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-auto w-full rounded-xl border border-line bg-track object-cover"
        />
      ) : (
        <div
          className="placeholder-stripes grid aspect-video max-w-full place-items-center content-center gap-2 rounded-xl border border-line text-xs font-semibold tracking-[.06em] text-muted uppercase"
          role="img"
          aria-label={caption}
        >
          {kind === "map" ? (
            <svg viewBox="0 0 24 24" className="size-[30px] fill-none stroke-current stroke-[1.5]" aria-hidden="true">
              <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
              <path d="M9 4v14M15 6v14" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="size-[30px] fill-none stroke-current stroke-[1.5]" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <circle cx="9" cy="10" r="2" />
              <path d="M21 16l-5-5-8 8" />
            </svg>
          )}
          <span>{kind === "map" ? t.story.archiveMap : t.story.archivePhoto}</span>
        </div>
      )}
      <figcaption className="text-[13px] text-muted">
        <b className="font-medium text-ink" lang={captionLocale} dir="auto">
          {image?.caption ?? caption}
        </b>
        {image ? (
          <>
            {" · "}
            <span>
              {image.authorUrl ? (
                <a
                  href={image.authorUrl}
                  rel="noopener noreferrer"
                  className="underline decoration-line underline-offset-2"
                >
                  {image.author}
                </a>
              ) : (
                image.author
              )}
              {", "}
              {image.licenseUrl ? (
                <a
                  href={image.licenseUrl}
                  rel="license noopener noreferrer"
                  className="underline decoration-line underline-offset-2"
                >
                  {image.license}
                </a>
              ) : (
                image.license
              )}
              {", "}
              <a
                href={image.filePageUrl}
                rel="noopener noreferrer"
                className="underline decoration-line underline-offset-2"
              >
                {t.image.source}
              </a>
            </span>
          </>
        ) : (
          <> · {t.image.source}</>
        )}
      </figcaption>
    </figure>
  );
}
