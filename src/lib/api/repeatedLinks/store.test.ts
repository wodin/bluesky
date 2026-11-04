import {beforeEach, describe, expect, it, jest} from '@jest/globals'

import {type Device, device} from '#/storage'
import {RepeatedLinkStore, sharedRepeatedLinkStore} from './store'

/*
 * The mock's map is static so it outlives an instance, which is what lets a
 * second RepeatedLinkStore stand in for the app being restarted.
 */
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

const DAY = 24 * 60 * 60 * 1000

describe('RepeatedLinkStore', () => {
  it('evicts entries older than 30 days and keeps the rest', () => {
    let now = 1_700_000_000_000
    const store = new RepeatedLinkStore({now: () => now})
    store.remember('did:plc:alice https://example.com/old', 'at://alice/old')
    now += 31 * DAY
    store.remember('did:plc:alice https://example.com/new', 'at://alice/new')

    expect(
      store.getKept('did:plc:alice https://example.com/old'),
    ).toBeUndefined()
    expect(store.getKept('did:plc:alice https://example.com/new')).toBe(
      'at://alice/new',
    )
  })

  it('evicts the oldest entries once it is over the cap', () => {
    const store = new RepeatedLinkStore({maxEntries: 2})
    store.remember('did:plc:alice https://example.com/1', 'at://alice/1')
    store.remember('did:plc:alice https://example.com/2', 'at://alice/2')
    store.remember('did:plc:alice https://example.com/3', 'at://alice/3')

    expect(store.getKept('did:plc:alice https://example.com/1')).toBeUndefined()
    expect(store.getKept('did:plc:alice https://example.com/2')).toBe(
      'at://alice/2',
    )
    expect(store.getKept('did:plc:alice https://example.com/3')).toBe(
      'at://alice/3',
    )
  })

  it('remembers the post kept for a dedup key', () => {
    const store = new RepeatedLinkStore()
    store.remember('did:plc:alice https://example.com/story', 'at://alice/1')
    expect(store.getKept('did:plc:alice https://example.com/story')).toBe(
      'at://alice/1',
    )
  })

  it('has nothing for a dedup key it has not seen', () => {
    const store = new RepeatedLinkStore()
    expect(
      store.getKept('did:plc:alice https://example.com/story'),
    ).toBeUndefined()
  })

  it('ignores persisted entries that are not the shape it expects', () => {
    const now = 1_700_000_000_000
    /* Off-schema on purpose: what some older build might have left behind. */
    const persisted = [
      'a bare string, as an older build might have written',
      {key: 'did:plc:alice https://example.com/story', uri: 'at://alice/1'},
      {
        key: 'did:plc:bob https://example.com/story',
        uri: 'at://bob/1',
        seenAt: now,
      },
    ] as unknown as NonNullable<Device['repeatedLinkPosts']>
    device.set(['repeatedLinkPosts'], persisted)

    const store = new RepeatedLinkStore({now: () => now})

    expect(
      store.getKept('did:plc:alice https://example.com/story'),
    ).toBeUndefined()
    expect(store.getKept('did:plc:bob https://example.com/story')).toBe(
      'at://bob/1',
    )
  })

  it('starts empty rather than throwing when the persisted data is unreadable', () => {
    // @ts-expect-error reaching past the schema to plant a half-written value
    device.store.set('repeatedLinkPosts', '{"data": [{"key": "did:p')

    const store = new RepeatedLinkStore()

    expect(
      store.getKept('did:plc:alice https://example.com/story'),
    ).toBeUndefined()
    store.remember('did:plc:alice https://example.com/story', 'at://alice/1')
    expect(store.getKept('did:plc:alice https://example.com/story')).toBe(
      'at://alice/1',
    )
  })

  it('drops aged-out entries when it is rebuilt, without being asked', () => {
    const start = 1_700_000_000_000
    new RepeatedLinkStore({now: () => start}).remember(
      'did:plc:alice https://example.com/story',
      'at://alice/1',
    )

    const later = new RepeatedLinkStore({now: () => start + 31 * DAY})

    expect(
      later.getKept('did:plc:alice https://example.com/story'),
    ).toBeUndefined()
  })

  /*
   * Identity is the whole contract here. Two live instances each persist their
   * own map, so whichever writes last drops what the other remembered, and the
   * feed starts showing repeats again.
   */
  it('hands out one shared store rather than a fresh one per caller', () => {
    expect(sharedRepeatedLinkStore()).toBe(sharedRepeatedLinkStore())
  })

  it('still knows the kept post after a restart', () => {
    new RepeatedLinkStore().remember(
      'did:plc:alice https://example.com/story',
      'at://alice/1',
    )
    expect(
      new RepeatedLinkStore().getKept(
        'did:plc:alice https://example.com/story',
      ),
    ).toBe('at://alice/1')
  })
})
