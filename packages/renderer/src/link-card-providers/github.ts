import type { LinkCardPart, LinkCardProvider } from './types'
import { fetchGitHubApi } from './fetch'

/*
 * GitHub's repositories, issues, pull requests, commits and discussions
 * read them (rich-renderer-linkcard/src/plugins/github): the same addresses, the same API
 * requests, and the same things shown.
 */

/** GitHub's colors for each language. */
const LANGUAGE_COLORS: Record<string, string> = {
  'typescript': '#2b7489',
  'javascript': '#f1e05a',
  'html': '#e34c26',
  'java': '#b07219',
  'go': '#00add8',
  'vue': '#2c3e50',
  'css': '#563d7c',
  'yaml': '#cb171e',
  'json': '#292929',
  'markdown': '#083fa1',
  'csharp': '#178600',
  'c#': '#178600',
  'c': '#555555',
  'cpp': '#f34b7d',
  'c++': '#f34b7d',
  'python': '#3572a5',
  'lua': '#000080',
  'vimscript': '#199f4b',
  'shell': '#89e051',
  'dockerfile': '#384d54',
  'ruby': '#701516',
  'php': '#4f5d95',
  'lisp': '#3fb68b',
  'kotlin': '#F18E33',
  'rust': '#dea584',
  'dart': '#00B4AB',
  'swift': '#ffac45',
  'objective-c': '#438eff',
  'objective-c++': '#6866fb',
  'r': '#198ce7',
  'matlab': '#e16737',
  'scala': '#c22d40',
  'sql': '#e38c00',
  'perl': '#0298c3',
}

const OPEN = '#238636'
const PURPLE = '#8957e5'
const RED = '#f85149'

function parts(url: URL) {
  return url.hostname === 'github.com'
    ? url.pathname.split('/').filter(Boolean)
    : null
}

/** A change's added and deleted lines, kept together. */
function lines(additions: unknown, deletions: unknown): LinkCardPart {
  return {
    group: [
      {
        text: `+${additions}`,
        color: OPEN,
      },
      {
        text: `-${deletions}`,
        color: RED,
      },
    ],
  }
}

export const githubRepoProvider: LinkCardProvider = {
  name: 'gh-repo',
  displayName: 'GitHub Repository',
  priority: 100,
  shape: 'compact',
  provider: 'github',
  matchUrl(url) {
    const path = parts(url)
    if (!path || path.length !== 2)
      return null
    return {
      id: `${path[0]}/${path[1]}`,
      fullUrl: url.toString(),
    }
  },
  isValidId: id => /^[^/]+\/[^/]+$/.test(id),
  async fetch(id, context) {
    const [owner, repo] = id.split('/')
    const data = await fetchGitHubApi(`/repos/${owner}/${repo}`, context)
    return {
      title: data.name,
      badge: data.stargazers_count > 0
        ? {
            text: Number(data.stargazers_count).toLocaleString('en-US'),
            icon: 'star',
            color: '#fb923c',
          }
        : undefined,
      description: data.description ?? undefined,
      image: data.owner?.avatar_url,
      color: LANGUAGE_COLORS[String(data.language).toLowerCase()],
    }
  },
}

export const githubPrProvider: LinkCardProvider = {
  name: 'gh-pr',
  displayName: 'GitHub Pull Request',
  priority: 95,
  shape: 'compact',
  provider: 'github',
  matchUrl(url) {
    const path = parts(url)
    if (!path || path.length < 4 || path[2] !== 'pull')
      return null
    return {
      id: `${path[0]}/${path[1]}/${path[3]}`,
      fullUrl: url.toString(),
    }
  },
  isValidId: id => /^[^/]+\/[^/]+\/[^/]+$/.test(id),
  async fetch(id, context) {
    const [owner, repo, number] = id.split('/')
    const data = await fetchGitHubApi(`/repos/${owner}/${repo}/pulls/${number}`, context)
    const state = data.merged
      ? 'merged'
      : data.state === 'open'
        ? 'open'
        : 'closed'
    const color = {
      open: OPEN,
      merged: PURPLE,
      closed: RED,
    }[state]
    return {
      title: `PR: ${data.title}`,
      color,
      description: [
        {
          text: {
            open: 'Open',
            merged: 'Merged',
            closed: 'Closed',
          }[state],
          icon: ({
            open: 'git-pull-request',
            merged: 'git-merge',
            closed: 'git-pull-request-closed',
          } as const)[state],
          color,
        },
        lines(data.additions, data.deletions),
        {
          text: `${owner}/${repo}`,
          tone: 'faded',
        },
      ],
      image: data.user?.avatar_url,
    }
  },
}

export const githubIssueProvider: LinkCardProvider = {
  name: 'gh-issue',
  displayName: 'GitHub Issue',
  priority: 95,
  shape: 'compact',
  provider: 'github',
  matchUrl(url) {
    const path = parts(url)
    if (!path || path.length < 4 || path[2] !== 'issues' || !/^\d+$/.test(path[3]!))
      return null
    return {
      id: `${path[0]}/${path[1]}/${path[3]}`,
      fullUrl: url.toString(),
    }
  },
  isValidId: id => /^[^/]+\/[^/]+\/\d+$/.test(id),
  async fetch(id, context) {
    const [owner, repo, number] = id.split('/')
    const data = await fetchGitHubApi(`/repos/${owner}/${repo}/issues/${number}`, context)
    const color = {
      open: OPEN,
      closed: PURPLE,
    }[data.state as string] ?? '#6b7280'
    return {
      title: `Issue: ${data.title}`,
      color,
      description: [
        {
          text: {
            open: 'Open',
            closed: 'Closed',
          }[data.state as string] ?? data.state,
          icon: data.state === 'closed'
            ? 'circle-check'
            : 'circle-dot',
          color,
        },
        {
          text: `#${number} · ${owner}/${repo}`,
          tone: 'faded',
        },
      ],
      image: data.user?.avatar_url,
    }
  },
}

export const githubCommitProvider: LinkCardProvider = {
  name: 'gh-commit',
  displayName: 'GitHub Commit',
  priority: 95,
  shape: 'compact',
  provider: 'github',
  matchUrl(url) {
    const path = parts(url)
    if (!path || path.length < 4 || path[2] !== 'commit')
      return null
    return {
      id: `${path[0]}/${path[1]}/commit/${path[3]}`,
      fullUrl: url.toString(),
    }
  },
  isValidId: id => /^[^/]+\/[^/]+\/commit\/[^/]+$/.test(id),
  async fetch(id, context) {
    const [owner, repo, , sha] = id.split('/')
    const data = await fetchGitHubApi(`/repos/${owner}/${repo}/commits/${sha}`, context)
    return {
      title: String(data.commit.message).replace(/Signed-off-by:.+/s, '').trim(),
      plainTitle: true,
      description: [
        lines(data.stats.additions, data.stats.deletions),
        {
          text: String(data.sha).slice(0, 7),
          icon: 'git-commit-horizontal',
        },
        {
          text: `${owner}/${repo}`,
          tone: 'faded',
        },
      ],
      image: data.author?.avatar_url,
    }
  },
}

export const githubDiscussionProvider: LinkCardProvider = {
  name: 'gh-discussion',
  displayName: 'GitHub Discussion',
  priority: 95,
  shape: 'compact',
  provider: 'github',
  matchUrl(url) {
    const path = parts(url)
    if (!path || path.length < 4 || path[2] !== 'discussions' || !/^\d+$/.test(path[3]!))
      return null
    return {
      id: `${path[0]}/${path[1]}/${path[3]}`,
      fullUrl: url.toString(),
    }
  },
  isValidId: id => /^[^/]+\/[^/]+\/\d+$/.test(id),
  async fetch(id, context) {
    const [owner, repo, number] = id.split('/')
    const data = await fetchGitHubApi(`/repos/${owner}/${repo}/discussions/${number}`, context)
    return {
      title: `Discussion: ${data.title}`,
      description: [
        {
          text: data.category?.name || 'Discussion',
          icon: 'messages-square',
          tone: 'tag',
        },
        {
          text: `#${number} · ${owner}/${repo}`,
          tone: 'faded',
        },
      ],
      image: data.user?.avatar_url,
    }
  },
}
