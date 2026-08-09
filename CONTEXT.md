# Bluesky Social App

A client for the AT Protocol network. This glossary covers link deduplication in
the feed, the one area where this fork has introduced language of its own.

## Language

### Link deduplication

Some accounts post the same story link over and over. Deduplication surfaces one
post per link per account and holds the rest back.

**Link post**:
A post whose embed carries an external URL.
_Avoid_: card post, external post

**Embed URL**:
The external URL a link post carries, exactly as the post author published it,
tracking parameters and all.
_Avoid_: link, external URI

**Dedup key**:
The identity a link post is deduplicated by: its author plus its embed URL,
normalized so that cosmetic differences between two URLs do not read as two
different stories. Scoped to the author, so two people posting the same story
are two stories, not a repeat.
_Avoid_: cache key, fingerprint, hash

**Repeat**:
A link post sharing an earlier post's dedup key. Being a repeat is a fact about
the post; it does not by itself mean the reader will not see it.
_Avoid_: duplicate, copy

**Kept**:
The one post surfaced for a given dedup key. Following is reverse-chronological,
so the kept post is usually the _most recent_ repeat rather than the one
published first.
_Avoid_: original, winner, first

**Suppressed**:
A repeat held back from the feed because another post is already kept for its
dedup key.
_Avoid_: hidden, muted, filtered, blocked
