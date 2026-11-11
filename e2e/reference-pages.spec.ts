import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { chartKinds, chartSamples, chartSamplesOf } from '../demo/src/site/charts'
import { nodeTypes } from '../demo/src/site/nodes'
import { presets } from '../demo/src/site/presets'
import { HOSTED_TOKENS, TOKEN_GROUPS } from '../packages/style-token/src/tokens'
import { toLineEnd } from './keys'

/* The chart, token and preset pages, and where the navigation reaches them. */

const nav = (page: Page) => page.getByRole('navigation', { name: '網站導覽' })
function sampleCard(page: Page, label: string) {
  return page.locator('.chart-sample').filter({
    has: page.getByRole('heading', { name: label, exact: true }),
  })
}
const tab = (page: Page, name: '呈現' | '編輯') => page.getByRole('tab', { name, exact: true })
const body = (page: Page) => page.locator('.preset-body')
const json = (page: Page) => page.locator('.preset-json pre')
const editor = (page: Page) => body(page).locator('[contenteditable="true"]').first()
const token = (page: Page, name: string) => page.locator(`.token-row[data-token="${name}"]`)

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

test.describe('charts', () => {
  test('the overview has each kind, and opens one without reloading', async ({ page }) => {
    await page.goto('/charts')
    await expect(page.locator('.chart-tile')).toHaveCount(chartKinds.length)
    for (const { key, label } of chartKinds)
      await expect(page.locator(`.chart-tile[href="/charts/${key}"]`)).toContainText(`${label}`)
    await expect(page.locator('.chart-tile[href="/charts/bar"]')).toContainText(`${chartSamplesOf('bar').length} 個範例`)
    await page.evaluate(() => {
      (window as unknown as { marker: string }).marker = 'same page'
    })
    await page.locator('.chart-tile[href="/charts/bar"]').click()
    await expect(page).toHaveURL(/\/charts\/bar$/)
    expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe('same page')
  })

  test('a sample has its description and a chart, and opens its LiteXML', async ({ page }) => {
    await page.goto('/charts/bar')
    const card = sampleCard(page, '分組')
    await expect(card).toContainText('兩組資料並排比較')
    await expect(card.locator('svg').first()).toBeVisible()
    await expect(card.locator('.chart-source')).toHaveCount(0)
    await card.getByRole('button', { name: 'LiteXML' }).click()
    await expect(card.locator('.chart-source')).toContainText('<chart><![CDATA[')
    await expect(card.locator('.chart-source')).toContainText('"type": "bar"')
    await card.getByRole('button', { name: 'LiteXML' }).click()
    await expect(card.locator('.chart-source')).toHaveCount(0)
  })

  test('states explain themselves, and the frames hold', async ({ page }) => {
    await page.goto('/charts/state')
    await expect(sampleCard(page, '空資料').locator('.chart-body')).not.toBeEmpty()
    await expect(sampleCard(page, '空資料').locator('.chart-body svg')).toHaveCount(0)
    await expect(sampleCard(page, '資料錯誤').locator('.chart-body')).toContainText('data[0].web')
    await expect(sampleCard(page, 'JSON 錯誤').locator('.chart-body')).toContainText('不是合法的 JSON')

    const table = sampleCard(page, '資料表檢視')
    await table.getByRole('button', { name: '檢視資料' }).click()
    await expect(table.locator('table')).toBeVisible()

    const narrow = (await sampleCard(page, '窄版長條').locator('.chart-body').boundingBox())!
    expect(narrow.width).toBeLessThanOrEqual(360)
    await expect(sampleCard(page, '深色').locator('[data-color-scheme="dark"]').first()).toBeVisible()
  })

  test('an unknown kind goes to the overview', async ({ page }) => {
    await page.goto('/charts/nope')
    await expect(page).toHaveURL(/\/charts$/)
    await expect(page.locator('.chart-tile')).toHaveCount(chartKinds.length)
  })

  for (const { key } of chartKinds) {
    test(`${key} shows all its samples`, async ({ page }) => {
      await page.goto(`/charts/${key}`)
      await expect(page.locator('.chart-sample')).toHaveCount(chartSamplesOf(key).length)
    })
  }

  test('the kinds together are every sample', () => {
    expect(chartKinds.flatMap(({ key }) => chartSamplesOf(key))).toHaveLength(chartSamples.length)
  })
})

test.describe('tokens', () => {
  test('lists every token with its real values', async ({ page }) => {
    await page.goto('/tokens')
    const groups = Object.entries(TOKEN_GROUPS) as [string, Record<string, string>][]
    await expect(page.locator('.token-group')).toHaveCount(groups.length)
    const count = groups.reduce((sum, [, names]) => sum + Object.keys(names).length, 0)
    await expect(page.locator('.token-row')).toHaveCount(count)

    for (const [group, names] of groups) {
      for (const [name, variable] of Object.entries(names)) {
        const row = token(page, variable)
        await expect(row, variable).toContainText(name)
        await expect(row, variable).toContainText(variable)
        for (const cell of ['light', 'dark']) {
          const value = row.locator(`[data-value="${cell}"]`)
          await expect(value, `${variable} ${cell}`).not.toHaveText('')
          await expect(value, `${variable} ${cell}`).not.toContainText('var(')
        }
        if (group === 'color')
          await expect(row.locator('.token-swatch').first(), variable).toBeVisible()
      }
    }
  })

  test('follows the layout chosen', async ({ page }) => {
    await page.goto('/tokens')
    const value = token(page, '--hlx-font-size-base').locator('[data-value="light"]')
    await expect(value).not.toHaveText('')
    const article = await value.textContent()
    await page.getByRole('radiogroup', { name: '排版' }).getByRole('radio', { name: 'Comment', exact: true }).click()
    await expect(value).not.toHaveText(article!)
  })

  test('explains how a site sets its own design', async ({ page }) => {
    await page.goto('/tokens')
    const section = page.locator('.token-host')
    await expect(section).toContainText('--hlx-host-color-accent')
    await expect(section.getByRole('button', { name: /複製/ })).toBeVisible()
    for (const variable of HOSTED_TOKENS.slice(0, 3))
      await expect(section.locator('.token-hosted')).toContainText(variable)
    await expect(section.locator('.token-hosted li')).toHaveCount(HOSTED_TOKENS.length)
  })
})

test.describe('presets', () => {
  test('the overview has each document, and opens one without reloading', async ({ page }) => {
    await page.goto('/presets')
    await expect(page.locator('.preset-tile')).toHaveCount(presets.length)
    for (const preset of presets) {
      const tile = page.locator(`.preset-tile[href="/presets/${preset.id}"]`)
      await expect(tile).toContainText(preset.label)
      await expect(tile).toContainText(preset.description)
    }
    await page.evaluate(() => {
      (window as unknown as { marker: string }).marker = 'same page'
    })
    await page.locator('.preset-tile[href="/presets/tech-article"]').click()
    await expect(page).toHaveURL(/\/presets\/tech-article$/)
    expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe('same page')
  })

  test('carries edits to the reading view and the JSON, in any layout', async ({ page }) => {
    await page.goto('/presets/tech-article')
    await expect(tab(page, '呈現')).toHaveAttribute('aria-selected', 'true')
    await expect(body(page).locator('[contenteditable="true"]')).toHaveCount(0)

    await tab(page, '編輯').click()
    await editor(page).locator('h1').click()
    await toLineEnd(page)
    await page.keyboard.type('新增的字')
    await expect(json(page)).toContainText('新增的字')
    await page.getByRole('radiogroup', { name: '排版' }).getByRole('radio', { name: 'Note', exact: true }).click()
    await expect(body(page).locator('[data-variant="note"]').first()).toBeVisible()

    await tab(page, '呈現').click()
    await expect(body(page)).toContainText('新增的字')
    await expect(body(page).locator('[data-variant="note"]').first()).toBeVisible()
  })

  test('the document of all nodes has every node, read and edited', async ({ page }) => {
    await page.goto('/presets/all-nodes')
    await expect(page.locator('.preset-json pre')).toBeAttached()
    const text = await json(page).textContent()
    for (const node of nodeTypes)
      expect(text, node.type).toContain(`"type": "${node.type}"`)
    await expect(page.locator('.hlx-unknown')).toHaveCount(0)

    await tab(page, '編輯').click()
    await expect(editor(page)).toBeVisible()
    await expect(page.locator('.hlx-unknown')).toHaveCount(0)
  })

  test('an unknown document goes to the overview', async ({ page }) => {
    await page.goto('/presets/nope')
    await expect(page).toHaveURL(/\/presets$/)
    await expect(page.locator('.preset-tile')).toHaveCount(presets.length)
  })

  for (const preset of presets) {
    test(`${preset.id} has content`, async ({ page }) => {
      await page.goto(`/presets/${preset.id}`)
      await expect(page.getByRole('heading', { name: preset.label, level: 1, exact: true })).toBeVisible()
      await expect(body(page)).not.toBeEmpty()
      await expect(page.locator('.hlx-unknown')).toHaveCount(0)
    })
  }
})

test.describe('the navigation', () => {
  test('reaches every section and each page inside it', async ({ page }) => {
    await page.goto('/nodes/poll')
    for (const path of [
      '/editor',
      '/presets',
      '/nodes',
      '/plugins',
      '/packages',
      '/charts',
      '/tokens',
    ])
      await expect(nav(page).locator(`.site-nav-section[href="${path}"]`), path).toBeVisible()

    await page.goto('/presets')
    for (const preset of presets)
      await expect(nav(page).locator(`.site-nav-leaf[href="/presets/${preset.id}"]`)).toHaveText(preset.label)
    await page.goto('/charts')
    for (const { key, label } of chartKinds)
      await expect(nav(page).locator(`.site-nav-leaf[href="/charts/${key}"]`)).toHaveText(label)

    await page.goto('/nodes/poll')
    const poll = nav(page).getByRole('link', { name: '投票' })
    await expect(poll).toHaveAttribute('aria-current', 'page')
    await expect(poll).toBeInViewport({ ratio: 1 })
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1)
  })

  test.describe('on a narrow screen', () => {
    test.use({
      viewport: { width: 375, height: 812 },
    })

    for (const path of ['/charts/bar', '/tokens', '/presets/tech-article']) {
      test(`${path} has the seven ways in and no sideways scrolling`, async ({ page }) => {
        await page.goto(path)
        await expect(nav(page).getByRole('link')).toHaveText([
          '編輯器',
          '範例文件',
          '節點',
          '外掛',
          '套件',
          '圖表',
          'Token',
        ], { useInnerText: true })
        await expect(page.locator('.site-content h1').first()).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
      })
    }
  })
})
