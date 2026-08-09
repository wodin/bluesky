import {
  AppBskyEmbedExternal,
  AppBskyEmbedRecordWithMedia,
  type AppBskyFeedDefs,
} from '@atproto/api'

/**
 * The embed URL of a link post, or undefined when the post carries no external
 * link.
 */
export function extractEmbedUrl(
  post: AppBskyFeedDefs.PostView,
): string | undefined {
  const embed = post.embed
  if (AppBskyEmbedExternal.isView(embed)) {
    return embed.external.uri
  }
  if (
    AppBskyEmbedRecordWithMedia.isView(embed) &&
    AppBskyEmbedExternal.isView(embed.media)
  ) {
    return embed.media.external.uri
  }
  return undefined
}

/**
 * Query parameters that identify where a link was shared from rather than what
 * it points at. Note that `si`, `ref` and `ref_src` are meaningful to a handful
 * of sites; we accept the occasional over-merge in exchange for catching the
 * common share-tracking case.
 */
const TRACKING_PARAMS = new Set(['fbclid', 'gclid', 'si', 'ref', 'ref_src'])

/**
 * A canonical form of an embed URL, so that the same story shared twice with
 * different tracking decoration produces one dedup key. Returns undefined for
 * anything we cannot confidently canonicalise, which fails closed: the post is
 * never suppressed.
 */
export function normalizeEmbedUrl(url: string): string | undefined {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return undefined
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return undefined
  }

  for (const param of [...parsed.searchParams.keys()]) {
    if (param.startsWith('utm_') || TRACKING_PARAMS.has(param)) {
      parsed.searchParams.delete(param)
    }
  }

  /*
   * Serialise the query from searchParams unconditionally. Reading parsed.search
   * would return the original text when nothing was stripped and a re-encoded
   * form when something was, so the same link would key differently depending on
   * whether it happened to carry tracking.
   */
  const query = parsed.searchParams.toString()

  return (
    parsed.protocol +
    '//' +
    /*
     * Lowercase the host explicitly. The WHATWG spec says the parser does this,
     * but React Native's URL polyfill leaves the case as written, so relying on
     * the parser would key EXAMPLE.com and example.com separately on device.
     */
    parsed.host.toLowerCase() +
    parsed.pathname.replace(/\/$/, '') +
    (query ? `?${query}` : '')
  )
}

/**
 * The identity a link post is deduped on: its author plus its normalized embed
 * URL. Undefined when the post is not a link post, meaning it is never
 * suppressed.
 */
export function dedupKey(post: AppBskyFeedDefs.PostView): string | undefined {
  const url = extractEmbedUrl(post)
  if (!url) return undefined

  const normalized = normalizeEmbedUrl(url)
  if (!normalized) return undefined

  /*
   * A space is unambiguous as a separator: a DID cannot contain one, and a
   * normalized URL has had any space percent-encoded by the URL parser.
   */
  return `${post.author.did} ${normalized}`
}
