import type { PackageKind } from './packages'
import { chartKinds } from './charts'
import { nodeCategories, nodesIn, nodeTypes } from './nodes'
import { packagesOf, packagesPath } from './packages'
import { presets } from './presets'

/*
 * The site's navigation: groups of sections. A section with pages of its own opens them while
 * the reader is inside it.
 */

export interface NavLeaf {
  label: string
  path: string
}

export interface NavTreeGroup {
  /** Shown above the pages; the first group, with the overview, has none. */
  label?: string
  items: NavLeaf[]
}

export interface NavSection {
  label: string
  path: string
  /** Other addresses that show this page, so it reads as current there too. */
  aliases?: string[]
  count?: number
  tree?: NavTreeGroup[]
}

export interface NavGroup {
  label: string
  sections: NavSection[]
}

function withOverview(path: string, groups: NavTreeGroup[]): NavTreeGroup[] {
  return [
    {
      items: [
        { label: '概覽', path },
      ],
    },
    ...groups,
  ]
}

function packageSection(kind: PackageKind, label: string): NavSection {
  const path = packagesPath(kind)
  const entries = packagesOf(kind)
  return {
    label,
    path,
    count: entries.length,
    tree: withOverview(path, [
      {
        items: entries.map(entry => ({ label: entry.label, path: `${path}/${entry.id}` })),
      },
    ]),
  }
}

export const navGroups: NavGroup[] = [
  {
    label: '試玩',
    sections: [
      {
        label: '編輯器',
        path: '/editor',
      },
      {
        label: '範例文件',
        path: '/presets',
        count: presets.length,
        tree: withOverview('/presets', [
          {
            items: presets.map(preset => ({ label: preset.label, path: `/presets/${preset.id}` })),
          },
        ]),
      },
    ],
  },
  {
    label: '參考',
    sections: [
      {
        label: '節點',
        path: '/nodes',
        count: nodeTypes.length,
        tree: withOverview('/nodes', nodeCategories.map(({ key, label }) => ({
          label: `${label} · ${nodesIn(key).length}`,
          items: nodesIn(key).map(node => ({ label: node.label, path: `/nodes/${node.type}` })),
        }))),
      },
      packageSection('plugin', '外掛'),
      packageSection('package', '套件'),
      {
        label: '圖表',
        path: '/charts',
        count: chartKinds.length,
        tree: withOverview('/charts', [
          {
            items: chartKinds.map(kind => ({ label: kind.label, path: `/charts/${kind.key}` })),
          },
        ]),
      },
      { label: 'Token', path: '/tokens' },
    ],
  },
]
