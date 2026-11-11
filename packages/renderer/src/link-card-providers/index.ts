import type { LinkCardProvider } from './types'
import { arxivProvider } from './arxiv'
import { matchLinkCardUrl, mergeLinkCardProviders } from './fetch'
import { githubCommitProvider, githubDiscussionProvider, githubIssueProvider, githubPrProvider, githubRepoProvider } from './github'

/** The sources every card knows, highest priority first. */
export const builtinLinkCardProviders: readonly LinkCardProvider[] = mergeLinkCardProviders([
  githubRepoProvider,
  githubCommitProvider,
  githubPrProvider,
  githubIssueProvider,
  githubDiscussionProvider,
  arxivProvider,
])

export { arxivProvider } from './arxiv'
export { cleanLinkCardData, fetchGitHubApi, fetchJsonWithContext, fetchLinkCard, LinkCardSettingsKey, matchLinkCardUrl, mergeLinkCardProviders } from './fetch'
export { githubCommitProvider, githubDiscussionProvider, githubIssueProvider, githubPrProvider, githubRepoProvider } from './github'
export type * from './types'

/** The provider for this address with a site's providers, or `null`: for pasting and switching to a card. */
export function matchLinkCard(url: string, providers?: readonly LinkCardProvider[]) {
  const all = providers
    ? mergeLinkCardProviders(builtinLinkCardProviders, providers)
    : builtinLinkCardProviders
  const found = matchLinkCardUrl(url, all)
  return found && found.provider.isValidId(found.match.id)
    ? found
    : null
}
