import { navGroups } from './nav'
import { nodeTypes } from './nodes'
import { packages, packagesPath } from './packages'
import { presets } from './presets'

/* Everything the search can find: each page, under its section. */

export interface SearchEntry {
  label: string
  section: string
  path: string
  keywords: string
}

const keywords = new Map<string, string>([
  ...nodeTypes.map(node => [`/nodes/${node.type}`, `${node.type} ${node.description}`] as const),
  ...packages.map(entry => [`${packagesPath(entry.kind)}/${entry.id}`, `${entry.packageName} ${entry.description}`] as const),
  ...presets.map(preset => [`/presets/${preset.id}`, preset.description] as const),
])

export const searchEntries: SearchEntry[] = navGroups.flatMap(group => group.sections.flatMap((section) => {
  const pages = (section.tree ?? [])
    .flatMap(tree => tree.items)
    .filter(item => item.path !== section.path)
    .map(item => ({
      label: item.label,
      section: section.label,
      path: item.path,
      keywords: keywords.get(item.path) ?? '',
    }))
  return [
    {
      label: section.label,
      section: group.label,
      path: section.path,
      keywords: '',
    },
    ...pages,
  ]
}))

export function searchPages(query: string): SearchEntry[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length)
    return searchEntries
  return searchEntries
    .filter((entry) => {
      const text = `${entry.label} ${entry.section} ${entry.keywords}`.toLowerCase()
      return words.every(word => text.includes(word))
    })
    // A match in the name comes before one in the description.
    .sort((a, b) => Number(b.label.toLowerCase().includes(words[0])) - Number(a.label.toLowerCase().includes(words[0])))
}
