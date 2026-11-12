import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { nodeCategories, nodesIn, nodeTypes } from '../demo/src/site/nodes'
import { toLineEnd } from './keys'

/* The node pages: the overview at /nodes, a page for each node, and their place in the navigation. */

const nav = (page: Page) => page.getByRole('navigation', { name: '網站導覽' })
const content = (page: Page) => page.locator('.site-content')
const tiles = (page: Page) => page.locator('.node-tile')
const tab = (page: Page, name: '呈現' | '編輯') => page.getByRole('tab', { name, exact: true })
const samples = (page: Page) => page.locator('.node-sample')
const json = (page: Page) => page.locator('.node-json pre')
const variant = (page: Page, name: string) => page.getByRole('radiogroup', { name: '排版' }).getByRole('radio', { name, exact: true }).click()
const firstEditor = (page: Page) => samples(page).first().locator('[contenteditable="true"]').first()

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  await page.route(url => url.hostname !== 'localhost', route => route.abort())
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

test.describe('the overview', () => {
  test('groups every node, with its name, type and number of samples', async ({ page }) => {
    await page.goto('/nodes')
    for (const { key, label } of nodeCategories) {
      const group = content(page).locator('section', {
        has: page.getByRole('heading', { name: label, exact: true }),
      })
      await expect(group.locator('.node-group-count')).toHaveText(String(nodesIn(key).length))
    }
    await expect(tiles(page)).toHaveCount(nodeTypes.length)

    const list = tiles(page).filter({ hasText: '清單' })
    await expect(list.locator('code')).toHaveText('list')
    await expect(list).toContainText('4 個範例')
  })

  test('filters by group', async ({ page }) => {
    await page.goto('/nodes')
    await page.getByRole('radio', { name: /^行內/ }).click()
    await expect(tiles(page)).toHaveCount(nodesIn('inline').length)
    await expect(content(page).getByRole('heading', { name: '區塊', exact: true })).toHaveCount(0)

    await page.getByRole('radio', { name: /^全部/ }).click()
    await expect(tiles(page)).toHaveCount(nodeTypes.length)
  })

  test('opens a node without reloading the page', async ({ page }) => {
    await page.goto('/nodes')
    await page.evaluate(() => {
      (window as unknown as { marker: string }).marker = 'same page'
    })
    await tiles(page).filter({ hasText: '隱藏文字' }).click()
    await expect(page).toHaveURL(/\/nodes\/spoiler$/)
    await expect(page.getByRole('heading', { name: '隱藏文字', level: 1 })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe('same page')
  })
})

test.describe('a node\'s page', () => {
  test('shows what the node is, read-only, with its JSON', async ({ page }) => {
    await page.goto('/nodes/spoiler')
    await page.evaluate(() => {
      const target = window as unknown as { copied: string[] }
      target.copied = []
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            target.copied.push(value)
          },
        },
      })
    })

    await expect(page.getByRole('heading', { name: '隱藏文字', level: 1 })).toBeVisible()
    await expect(content(page)).toContainText('讀者點開之前都遮住的文字')
    await expect(content(page).locator('.node-meta code')).toHaveText('spoiler')
    await expect(content(page).locator('.node-meta')).toContainText('@hakulex/editor')
    await expect(tab(page, '呈現')).toHaveAttribute('aria-selected', 'true')
    await expect(samples(page).first()).toContainText('點一下才看得到')
    await expect(samples(page).locator('[contenteditable="true"]')).toHaveCount(0)
    await expect(json(page)).toContainText('"type": "spoiler"')

    await page.getByRole('button', { name: '複製' }).click()
    const shown = await json(page).textContent()
    await expect.poll(() => page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([shown])
  })

  test('carries edits to the reading view and the JSON', async ({ page }) => {
    await page.goto('/nodes/spoiler')
    await tab(page, '編輯').click()
    await expect(firstEditor(page)).toContainText('點一下才看得到')
    await firstEditor(page).click()
    await toLineEnd(page)
    await page.keyboard.type('新增的字')
    await expect(json(page)).toContainText('新增的字')

    await tab(page, '呈現').click()
    await expect(samples(page).first()).toContainText('新增的字')
    await expect(samples(page).locator('[contenteditable="true"]')).toHaveCount(0)
  })

  test('lists each sample and shows the JSON of the one chosen', async ({ page }) => {
    await page.goto('/nodes/link')
    await expect(samples(page)).toHaveCount(2)
    await expect(samples(page).nth(0).getByRole('heading', { name: '連結' })).toBeVisible()
    await expect(samples(page).nth(1).getByRole('heading', { name: '自動連結' })).toBeVisible()
    await expect(json(page)).toContainText('"type": "link"')

    await page.getByRole('radiogroup', { name: 'JSON 範例' }).getByRole('radio', { name: '自動連結' }).click()
    await expect(json(page)).toContainText('"type": "autolink"')
  })

  test('follows the chosen layout and keeps the edits', async ({ page }) => {
    await page.goto('/nodes/spoiler')
    await variant(page, 'Note')
    await expect(samples(page).locator('[data-variant="note"]').first()).toBeVisible()

    await tab(page, '編輯').click()
    await firstEditor(page).click()
    await toLineEnd(page)
    await page.keyboard.type('留著')
    await variant(page, 'Comment')
    await expect(samples(page).locator('[data-variant="comment"]').first()).toBeVisible()
    await expect(firstEditor(page)).toContainText('留著')
  })

  test('goes to the overview when there is no such node', async ({ page }) => {
    await page.goto('/nodes/nope')
    await expect(page).toHaveURL(/\/nodes$/)
    await expect(tiles(page)).toHaveCount(nodeTypes.length)
  })

  test('moves to the next and previous node, starting over', async ({ page }) => {
    await page.goto('/nodes/spoiler')
    await tab(page, '編輯').click()
    await firstEditor(page).click()
    await toLineEnd(page)
    await page.keyboard.type('會消失')
    await expect(json(page)).toContainText('會消失')

    await page.getByRole('link', { name: /下一個/ }).click()
    await expect(page).toHaveURL(/\/nodes\/katex-inline$/)
    await expect(tab(page, '呈現')).toHaveAttribute('aria-selected', 'true')

    await page.getByRole('link', { name: /上一個/ }).click()
    await expect(page).toHaveURL(/\/nodes\/spoiler$/)
    await expect(tab(page, '呈現')).toHaveAttribute('aria-selected', 'true')
    await expect(samples(page).first()).not.toContainText('會消失')
    await expect(json(page)).not.toContainText('會消失')
  })

  test('has no previous on the first node and no next on the last', async ({ page }) => {
    await page.goto(`/nodes/${nodeTypes[0].type}`)
    await expect(page.getByRole('link', { name: /下一個/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /上一個/ })).toHaveCount(0)

    await page.goto(`/nodes/${nodeTypes.at(-1)!.type}`)
    await expect(page.getByRole('link', { name: /上一個/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /下一個/ })).toHaveCount(0)
  })
})

test.describe('the navigation', () => {
  test('reaches every node and marks the current one, in view', async ({ page }) => {
    await page.goto('/nodes/poll')
    await expect(nav(page).locator('.site-nav-leaf[href="/nodes"]')).toHaveText('概覽')
    for (const node of nodeTypes)
      await expect(nav(page).locator(`.site-nav-leaf[href="/nodes/${node.type}"]`)).toHaveText(node.label)

    const poll = nav(page).getByRole('link', { name: '投票' })
    await expect(poll).toHaveAttribute('aria-current', 'page')
    await expect(poll).toBeInViewport({ ratio: 1 })
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1)
  })

  test.describe('on a narrow screen', () => {
    test.use({
      viewport: { width: 375, height: 812 },
    })

    const noSidewaysScroll = async (page: Page) => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    }

    test('has only the ways in, above the content, without sideways scrolling', async ({ page }) => {
      await page.goto('/nodes')
      await expect(nav(page).getByRole('link')).toHaveText([
        '編輯器',
        'AI 協作',
        '範例文件',
        '節點',
        '外掛',
        '套件',
        '圖表',
        'Token',
      ], { useInnerText: true })
      const navBox = (await nav(page).boundingBox())!
      const firstTile = (await tiles(page).first().boundingBox())!
      expect(navBox.y + navBox.height).toBeLessThanOrEqual(firstTile.y)
      await noSidewaysScroll(page)

      await tiles(page).filter({ hasText: '程式碼片段' }).click()
      await expect(page).toHaveURL(/\/nodes\/code-snippet$/)
      await expect(samples(page)).toHaveCount(1)
      await expect(nav(page).getByRole('link')).toHaveText([
        '編輯器',
        'AI 協作',
        '範例文件',
        '節點',
        '外掛',
        '套件',
        '圖表',
        'Token',
      ], { useInnerText: true })
      await noSidewaysScroll(page)
    })
  })
})

test.describe('every node', () => {
  const expected = [
    'text',
    'link',
    'spoiler',
    'katex-inline',
    'ruby',
    'mention',
    'tag',
    'comment',
    'footnote',
    'heading',
    'quote',
    'rich-quote',
    'list',
    'table',
    'horizontalrule',
    'code-block',
    'code-snippet',
    'mermaid',
    'katex-block',
    'image',
    'video',
    'file',
    'embed',
    'link-card',
    'chart',
    'poll',
    'chat',
    'dynamic',
    'alert-quote',
    'banner',
    'details',
    'gallery',
    'grid-container',
    'steps',
    'nested-doc',
  ]

  test('the list is all the nodes hakulex supports', () => {
    expect(nodeTypes.map(node => node.type)).toEqual(expected)
    for (const node of nodeTypes)
      expect(node.samples.length, node.type).toBeGreaterThan(0)
  })

  for (const node of nodeTypes) {
    test(`${node.type} reads and edits every sample`, async ({ page }) => {
      await page.goto(`/nodes/${node.type}`)
      await expect(page.getByRole('heading', { name: node.label, level: 1, exact: true })).toBeVisible()
      await expect(samples(page)).toHaveCount(node.samples.length)
      await expect(page.locator('.hlx-unknown')).toHaveCount(0)
      await expect(json(page)).toContainText(`"type": "${node.type}"`)

      await tab(page, '編輯').click()
      for (let index = 0; index < node.samples.length; index++)
        await expect(samples(page).nth(index).locator('[contenteditable="true"]').first()).toBeVisible()
      await expect(page.locator('.hlx-unknown')).toHaveCount(0)
      await expect(json(page)).toContainText(`"type": "${node.type}"`)
    })
  }
})
