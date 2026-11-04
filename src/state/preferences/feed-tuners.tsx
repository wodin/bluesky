import {useMemo} from 'react'

import {FeedTuner} from '#/lib/api/feed-manip'
import {sharedRepeatedLinkStore} from '#/lib/api/repeatedLinks/store'
import {type FeedDescriptor} from '../queries/post-feed'
import {usePreferencesQuery} from '../queries/preferences'
import {useSession} from '../session'
import {useLanguagePrefs} from './languages'

export function useFeedTuners(feedDesc: FeedDescriptor) {
  const langPrefs = useLanguagePrefs()
  const {data: preferences} = usePreferencesQuery()
  const {currentAccount} = useSession()

  return useMemo(() => {
    if (feedDesc.startsWith('author')) {
      if (feedDesc.endsWith('|posts_with_replies')) {
        // TODO: Do this on the server instead.
        return [FeedTuner.removeReposts]
      }
    }
    if (feedDesc.startsWith('feedgen')) {
      return [
        FeedTuner.preferredLangOnly(langPrefs.contentLanguages),
        FeedTuner.removeMutedThreads,
      ]
    }
    if (feedDesc === 'following' || feedDesc.startsWith('list')) {
      const feedTuners = [FeedTuner.removeOrphans]

      if (preferences?.feedViewPrefs.hideReposts) {
        feedTuners.push(FeedTuner.removeReposts)
      }
      if (preferences?.feedViewPrefs.hideReplies) {
        feedTuners.push(FeedTuner.removeReplies)
      } else {
        feedTuners.push(
          FeedTuner.followedRepliesOnly({
            userDid: currentAccount?.did || '',
          }),
        )
      }
      if (preferences?.feedViewPrefs.hideQuotePosts) {
        feedTuners.push(FeedTuner.removeQuotePosts)
      }
      feedTuners.push(FeedTuner.dedupThreads)
      feedTuners.push(FeedTuner.removeMutedThreads)
      /*
       * Last, so that every other filter has already had its say. Keeping a
       * post records it as the one surfaced for its link, and a post dropped
       * by a later tuner would suppress its own repeats without ever being
       * seen.
       */
      feedTuners.push(FeedTuner.removeRepeatedLinks(sharedRepeatedLinkStore()))

      return feedTuners
    }
    return []
  }, [feedDesc, currentAccount, preferences, langPrefs])
}
