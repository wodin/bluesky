import {type AppBskyFeedDefs} from '@atproto/api'
import {beforeEach, describe, expect, it, jest} from '@jest/globals'

import {device} from '#/storage'
import {FeedTuner} from './feed-manip'
import {RepeatedLinkStore} from './repeatedLinks/store'

jest.mock('react-native-mmkv', () => ({
  MMKV: class MMKVMock {
    static _store = new Map<string, string>()

    set(key: string, value: string) {
      MMKVMock._store.set(key, value)
    }

    getString(key: string) {
      return MMKVMock._store.get(key)
    }

    delete(key: string) {
      return MMKVMock._store.delete(key)
    }

    clearAll() {
      MMKVMock._store.clear()
    }
  },
}))

beforeEach(() => {
  device.removeAll()
})

/**
 * A link post: the minimum a `FeedViewPostsSlice` needs to survive construction,
 * plus an external embed carrying `url`.
 */
function linkPost({
  rkey,
  url,
  did = 'did:plc:alice',
}: {
  rkey: string
  url: string
  did?: string
}): AppBskyFeedDefs.FeedViewPost {
  return {
    post: {
      uri: `at://${did}/app.bsky.feed.post/${rkey}`,
      cid: `bafy${rkey}`,
      author: {did, handle: 'author.example.com'},
      record: {
        $type: 'app.bsky.feed.post',
        text: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      indexedAt: '2026-01-01T00:00:00.000Z',
      embed: {
        $type: 'app.bsky.embed.external#view',
        external: {
          $type: 'app.bsky.embed.external#viewExternal',
          uri: url,
          title: 'A story',
          description: '',
        },
      },
    },
  }
}

function uris(slices: {feedPostUri: string}[]) {
  return slices.map(slice => slice.feedPostUri)
}

describe('FeedTuner.removeRepeatedLinks', () => {
  it('suppresses a link one author has already had surfaced', () => {
    const tuner = new FeedTuner([
      FeedTuner.removeRepeatedLinks(new RepeatedLinkStore()),
    ])

    const slices = tuner.tune([
      linkPost({rkey: 'first', url: 'https://example.com/story'}),
      linkPost({rkey: 'second', url: 'https://example.com/story?utm_source=x'}),
    ])

    expect(uris(slices)).toEqual([
      'at://did:plc:alice/app.bsky.feed.post/first',
    ])
  })

  it('keeps the same link from two different authors', () => {
    const tuner = new FeedTuner([
      FeedTuner.removeRepeatedLinks(new RepeatedLinkStore()),
    ])

    const slices = tuner.tune([
      linkPost({rkey: 'hers', url: 'https://example.com/story'}),
      linkPost({
        rkey: 'his',
        url: 'https://example.com/story',
        did: 'did:plc:bob',
      }),
    ])

    expect(uris(slices)).toEqual([
      'at://did:plc:alice/app.bsky.feed.post/hers',
      'at://did:plc:bob/app.bsky.feed.post/his',
    ])
  })

  it('still shows the kept post when the feed is reloaded', () => {
    const post = linkPost({rkey: 'first', url: 'https://example.com/story'})
    new FeedTuner([
      FeedTuner.removeRepeatedLinks(new RepeatedLinkStore()),
    ]).tune([post])

    /* A reload builds a fresh tuner, but the store outlives it. */
    const slices = new FeedTuner([
      FeedTuner.removeRepeatedLinks(new RepeatedLinkStore()),
    ]).tune([post])

    expect(uris(slices)).toEqual([
      'at://did:plc:alice/app.bsky.feed.post/first',
    ])
  })

  it('remembers nothing on a dry run', () => {
    const store = new RepeatedLinkStore()
    const post = linkPost({rkey: 'first', url: 'https://example.com/story'})

    new FeedTuner([FeedTuner.removeRepeatedLinks(store)]).tune([post], {
      dryRun: true,
    })

    const slices = new FeedTuner([FeedTuner.removeRepeatedLinks(store)]).tune([
      linkPost({rkey: 'second', url: 'https://example.com/story'}),
    ])
    expect(uris(slices)).toEqual([
      'at://did:plc:alice/app.bsky.feed.post/second',
    ])
  })
})
