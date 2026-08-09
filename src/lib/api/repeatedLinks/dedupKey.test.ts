import {type AppBskyFeedDefs} from '@atproto/api'

import {dedupKey, extractEmbedUrl, normalizeEmbedUrl} from './dedupKey'

function makePost({
  embed,
  did = 'did:plc:author',
}: {
  embed?: AppBskyFeedDefs.PostView['embed']
  did?: string
}): AppBskyFeedDefs.PostView {
  return {
    uri: `at://${did}/app.bsky.feed.post/abc`,
    cid: 'bafyabc',
    author: {
      did,
      handle: 'author.example.com',
    },
    record: {
      $type: 'app.bsky.feed.post',
      text: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    indexedAt: '2026-01-01T00:00:00.000Z',
    embed,
  }
}

function externalEmbed(uri: string) {
  return {
    $type: 'app.bsky.embed.external#view' as const,
    external: {
      $type: 'app.bsky.embed.external#viewExternal' as const,
      uri,
      title: 'A story',
      description: '',
    },
  }
}

describe('extractEmbedUrl', () => {
  it('returns the URL of an external embed', () => {
    const post = makePost({embed: externalEmbed('https://example.com/story')})
    expect(extractEmbedUrl(post)).toBe('https://example.com/story')
  })

  it('returns the URL of the external media in a recordWithMedia embed', () => {
    const post = makePost({
      embed: {
        $type: 'app.bsky.embed.recordWithMedia#view',
        record: {
          $type: 'app.bsky.embed.record#view',
          record: {
            $type: 'app.bsky.embed.record#viewNotFound',
            uri: 'at://did:plc:other/app.bsky.feed.post/xyz',
            notFound: true,
          },
        },
        media: externalEmbed('https://example.com/story'),
      },
    })
    expect(extractEmbedUrl(post)).toBe('https://example.com/story')
  })

  it('returns undefined for a post with no embed', () => {
    expect(extractEmbedUrl(makePost({}))).toBeUndefined()
  })

  it('returns undefined for an embed that carries no external link', () => {
    const post = makePost({
      embed: {
        $type: 'app.bsky.embed.images#view',
        images: [
          {
            thumb: 'https://cdn.example.com/thumb.jpg',
            fullsize: 'https://cdn.example.com/full.jpg',
            alt: '',
          },
        ],
      },
    })
    expect(extractEmbedUrl(post)).toBeUndefined()
  })
})

describe('normalizeEmbedUrl', () => {
  it('leaves an already-canonical URL alone', () => {
    expect(normalizeEmbedUrl('https://example.com/story')).toBe(
      'https://example.com/story',
    )
  })

  it.each([
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'fbclid',
    'gclid',
    'si',
    'ref',
    'ref_src',
  ])('strips the %s tracking parameter', param => {
    expect(normalizeEmbedUrl(`https://example.com/story?${param}=spam`)).toBe(
      'https://example.com/story',
    )
  })

  it('preserves the YouTube video id so two videos stay distinct', () => {
    expect(
      normalizeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    expect(
      normalizeEmbedUrl('https://www.youtube.com/watch?v=oHg5SJYRHA0'),
    ).toBe('https://www.youtube.com/watch?v=oHg5SJYRHA0')
  })

  it('keeps non-tracking parameters', () => {
    expect(
      normalizeEmbedUrl('https://example.com/story?page=2&utm_source=spam'),
    ).toBe('https://example.com/story?page=2')
  })

  it('encodes remaining parameters the same way with or without tracking', () => {
    expect(normalizeEmbedUrl('https://example.com/s?q=a+b')).toBe(
      normalizeEmbedUrl('https://example.com/s?q=a+b&fbclid=spam'),
    )
  })

  it('lowercases the host but not the path', () => {
    expect(normalizeEmbedUrl('https://EXAMPLE.com/Story')).toBe(
      'https://example.com/Story',
    )
  })

  it('drops the fragment', () => {
    expect(normalizeEmbedUrl('https://example.com/story#comments')).toBe(
      'https://example.com/story',
    )
  })

  it('drops a trailing slash', () => {
    expect(normalizeEmbedUrl('https://example.com/story/')).toBe(
      'https://example.com/story',
    )
    expect(normalizeEmbedUrl('https://example.com/')).toBe(
      'https://example.com',
    )
  })

  it('keeps the port', () => {
    expect(normalizeEmbedUrl('https://example.com:8443/story')).toBe(
      'https://example.com:8443/story',
    )
  })

  it('returns undefined for a malformed URL', () => {
    expect(normalizeEmbedUrl('not a url')).toBeUndefined()
  })

  it('returns undefined for a non-http scheme', () => {
    expect(normalizeEmbedUrl('mailto:someone@example.com')).toBeUndefined()
  })
})

describe('dedupKey', () => {
  it('is the same for one author sharing a link twice with different tracking', () => {
    const first = makePost({
      embed: externalEmbed('https://example.com/story?utm_source=twitter'),
    })
    const second = makePost({
      embed: externalEmbed('https://example.com/story#comments'),
    })
    expect(dedupKey(first)).toBe(dedupKey(second))
  })

  it('differs for one author sharing two different links', () => {
    expect(
      dedupKey(makePost({embed: externalEmbed('https://example.com/one')})),
    ).not.toBe(
      dedupKey(makePost({embed: externalEmbed('https://example.com/two')})),
    )
  })

  it('differs for two authors sharing the same link', () => {
    const url = 'https://example.com/story'
    expect(
      dedupKey(makePost({embed: externalEmbed(url), did: 'did:plc:alice'})),
    ).not.toBe(
      dedupKey(makePost({embed: externalEmbed(url), did: 'did:plc:bob'})),
    )
  })

  it('is undefined for a post with no embed URL', () => {
    expect(dedupKey(makePost({}))).toBeUndefined()
  })

  it('is undefined when the embed URL cannot be normalized', () => {
    expect(
      dedupKey(makePost({embed: externalEmbed('not a url')})),
    ).toBeUndefined()
  })
})
