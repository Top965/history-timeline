/**
 * Pictures load straight from Wikimedia. Some networks (offices, schools) block
 * upload.wikimedia.org, so when a picture fails to load, the browser asks for it
 * again through this site's own address, which passes the request on to Wikimedia
 * (see the rewrite in next.config.ts). Pictures that load normally never touch us.
 */
export const COMMONS_HOST = "https://upload.wikimedia.org/wikipedia/";
export const COMMONS_VIA_SITE = "/commons/wikipedia/";

/** The same file, asked for through this site. Other addresses are left alone. */
export const viaSite = (url: string) => url.split(COMMONS_HOST).join(COMMONS_VIA_SITE);

/**
 * Runs in <head>, before any picture starts loading, so it also catches pictures
 * that fail before the page is interactive. Error events don't bubble, hence the
 * capture listener. Each picture is retried once.
 */
export const IMAGE_FALLBACK_SCRIPT = `document.addEventListener("error",function(e){var i=e.target;if(!(i instanceof HTMLImageElement)||i.dataset.viaSite)return;var h=${JSON.stringify(
  COMMONS_HOST,
)},p=${JSON.stringify(
  COMMONS_VIA_SITE,
)};if((i.currentSrc||i.src).indexOf(h)!==0)return;i.dataset.viaSite="1";if(i.srcset)i.srcset=i.srcset.split(h).join(p);i.src=i.src.split(h).join(p)},true);`;
