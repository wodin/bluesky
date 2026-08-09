import {type Device, device} from '#/storage'

type PersistedEntry = NonNullable<Device['repeatedLinkPosts']>[number]

type Entry = {uri: string; seenAt: number}

/**
 * How long a kept post keeps suppressing its repeats. Long enough to cover an
 * account that reposts a story over days, short enough that the feed is not
 * shaped by something read a season ago.
 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * A backstop on how far the persisted list can grow, since the whole list is
 * rewritten on every remember. Age eviction is the primary bound; this only
 * bites for someone who reads far more link posts in a month than we expect.
 */
const MAX_ENTRIES = 1000

/**
 * Narrows an untrusted persisted entry. Anything on disk was written by some
 * build of this app, but not necessarily this one, so the stored shape cannot
 * be taken on trust.
 */
function isPersistedEntry(value: unknown): value is PersistedEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as PersistedEntry
  return (
    typeof entry.key === 'string' &&
    typeof entry.uri === 'string' &&
    typeof entry.seenAt === 'number'
  )
}

/**
 * The persisted entries, or none at all when what is on disk cannot be read.
 * Losing the history costs a few repeats in the feed; throwing here would take
 * the feed down with it, since this runs while the feed tuner is built.
 */
function load(): PersistedEntry[] {
  let persisted
  try {
    persisted = device.get(['repeatedLinkPosts'])
  } catch {
    return []
  }
  return Array.isArray(persisted) ? persisted.filter(isPersistedEntry) : []
}

/**
 * The single live store, or none yet.
 */
let shared: RepeatedLinkStore | undefined

/**
 * The store the app shares. Two live instances clobber each other, since each
 * remember rewrites the whole persisted list from its own map, so there is
 * exactly one. Built on first use rather than at import so that loading this
 * module does not read storage.
 */
export function sharedRepeatedLinkStore(): RepeatedLinkStore {
  shared ??= new RepeatedLinkStore()
  return shared
}

/**
 * Remembers which link post was kept for a given dedup key, so a repeat stays
 * suppressed across app restarts.
 */
export class RepeatedLinkStore {
  /** Insertion-ordered, oldest first, which is the order entries are dropped in. */
  private kept: Map<string, Entry>

  private now: () => number
  private maxEntries: number

  constructor({
    now = Date.now,
    maxEntries = MAX_ENTRIES,
  }: {now?: () => number; maxEntries?: number} = {}) {
    this.now = now
    this.maxEntries = maxEntries
    this.kept = new Map(
      load().map(({key, uri, seenAt}) => [key, {uri, seenAt}]),
    )
    /*
     * Evict on load rather than leaving it to the caller: this is the one moment
     * we are guaranteed to get, and the pruned map is what the next remember
     * writes back.
     */
    this.evict()
  }

  /**
   * The AT URI of the post kept for this dedup key, or undefined when the key
   * has not been seen.
   */
  getKept(key: string): string | undefined {
    return this.kept.get(key)?.uri
  }

  /**
   * Record `uri` as the post kept for `key`.
   */
  remember(key: string, uri: string): void {
    this.kept.delete(key)
    this.kept.set(key, {uri, seenAt: this.now()})
    this.evict()
    this.persist()
  }

  /**
   * Drop entries that have aged out or that overflow the entry cap. Kept
   * private so the bounds hold by construction; a caller who had to ask would
   * eventually forget.
   */
  private evict(): void {
    const cutoff = this.now() - MAX_AGE_MS
    for (const [key, {seenAt}] of this.kept) {
      if (seenAt < cutoff) {
        this.kept.delete(key)
      }
    }

    /*
     * Map iterates in insertion order and remember() re-inserts, so the entries
     * at the front are the ones least recently kept.
     */
    for (const key of [...this.kept.keys()].slice(
      0,
      this.kept.size - this.maxEntries,
    )) {
      this.kept.delete(key)
    }
  }

  private persist(): void {
    device.set(
      ['repeatedLinkPosts'],
      [...this.kept].map(([key, {uri, seenAt}]) => ({key, uri, seenAt})),
    )
  }
}
