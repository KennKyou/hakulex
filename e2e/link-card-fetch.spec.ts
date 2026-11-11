import type { Page, Route } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'

/*
 * Link cards that fetch what they show, in a real browser. GitHub, arXiv and every picture
 * are answered here: nothing leaves the machine.
 */

const RESPONSES = JSON.parse(readFileSync(new URL('./fixtures/link-card-responses.json', import.meta.url), 'utf8')) as Record<string, unknown>
// A 1×1 PNG, for avatars and site icons.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const CORS = { 'access-control-allow-origin': '*' }

const editor = (page: Page) => page.locator('.hlx-content').first()
const cards = (page: Page) => editor(page).locator('.hlx-link-card')
const errors = new WeakMap<Page, string[]>()

interface Json { type: string, url?: string, children?: Json[] }
async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}

/**
 * Answers GitHub and arXiv from the fixtures, and pictures with a PNG. Only github.com has an
 * icon, in the second place tried: Playwright doesn't see requests for /favicon.ico, the first.
 */
async function answer(page: Page, options: { fail?: RegExp, hold?: Promise<void> } = {}) {
  const asked: string[] = []
  await page.route(url => url.hostname !== 'localhost', async (route: Route) => {
    const url = new URL(route.request().url())
    asked.push(url.href)
    if (options.fail?.test(url.href))
      return route.fulfill({ status: 500, headers: CORS, body: '' })
    await options.hold
    if (url.hostname === 'api.github.com') {
      const body = RESPONSES[url.pathname.slice(1)]
      return body
        ? route.fulfill({ json: body, headers: CORS })
        : route.fulfill({
            status: 404,
            headers: CORS,
            json: { message: 'Not Found' },
          })
    }
    if (url.hostname === 'export.arxiv.org')
      return route.fulfill({ body: RESPONSES.arxiv as string, contentType: 'application/atom+xml', headers: CORS })
    if (url.hostname === 'avatars.example' || url.href === 'https://github.com/favicon.png')
      return route.fulfill({ body: PNG, contentType: 'image/png' })
    return route.fulfill({ status: 404, body: '' })
  })
  return asked
}

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    // A site without an icon in one of the places tried is expected.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      seen.push(message.text())
  })
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function loadSample(page: Page) {
  await page.goto('/editor')
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入自動抓資料的卡片' }).click()
}

test('holds each card\'s place until its data comes, then shows it', async ({ page }) => {
  let release!: () => void
  await answer(page, {
    hold: new Promise(resolve => release = resolve),
  })
  await loadSample(page)
  await expect(cards(page).first()).toHaveAttribute('data-loading', '')
  await expect(cards(page).first().locator('.hlx-link-card-image')).toBeVisible()
  release()
  const repo = cards(page).nth(0)
  await expect(repo.locator('.hlx-link-card-title-text')).toHaveText('lexical')
  await expect(repo.locator('.hlx-link-card-badge')).toHaveText('24,000')
  expect(await repo.evaluate(element => getComputedStyle(element).borderColor)).toMatch(/0\.19\)$/)
  const pr = cards(page).nth(1)
  await expect(pr.locator('.hlx-link-card-title-text')).toHaveText('PR: Documentation: Fix typo')
  await expect(pr.locator('.hlx-link-card-part').first()).toHaveText('Merged')
  expect(await pr.locator('.hlx-link-card-part').first().evaluate(element => getComputedStyle(element).color)).toBe('rgb(137, 87, 229)')
  await expect(cards(page).nth(2)).toContainText('Issue: gen-flow-files')
  const paper = cards(page).nth(3)
  await expect(paper).toHaveAttribute('data-shape', 'expanded')
  await expect(paper.locator('.hlx-link-card-title-text')).toHaveText('Attention Is All You Need')
  await expect(paper.locator('.hlx-link-card-description')).toHaveText('Ashish Vaswani et al.')
  expect((await paper.boundingBox())!.width).toBeGreaterThan((await repo.boundingBox())!.width)
  // The measurements: 40px picture, 14px 16px padding, 10px corners.
  const box = await repo.evaluate((element) => {
    const style = getComputedStyle(element)
    const picture = element.querySelector('.hlx-link-card-image')!.getBoundingClientRect()
    return [
      picture.width,
      picture.height,
      style.padding,
      style.borderRadius,
    ]
  })
  expect(box).toEqual([40, 40, '14px 16px', '10px'])
  // Only the address is stored.
  expect((await stored(page)).filter(node => node.type === 'link-card')[0]).toEqual({ type: 'link-card', version: 1, url: 'https://github.com/facebook/lexical' })
})

test('says when a card can\'t be fetched, and still links to it', async ({ page }) => {
  await answer(page, { fail: /issues\/1000/ })
  const seen = errors.get(page)!
  await loadSample(page)
  const failed = cards(page).nth(2)
  await expect(failed).toHaveAttribute('data-failed', '')
  await expect(failed).toContainText('github.com/facebook/lexical/issues/1000')
  await expect(failed).toContainText('無法預覽・仍可前往')
  expect(await failed.evaluate(element => getComputedStyle(element).borderStyle)).toBe('dashed')
  // The failure is reported, and nothing else went wrong.
  expect(seen.every(message => message.includes('[hakulex link card] gh-issue'))).toBe(true)
  seen.length = 0
})

test('fetches in the preview too, from the same document', async ({ page }) => {
  await answer(page)
  await loadSample(page)
  await page.getByRole('tab', { name: '預覽' }).click()
  const preview = page.locator('.hlx-renderer')
  await expect(preview.locator('a.hlx-link-card').first().locator('.hlx-link-card-title-text')).toHaveText('lexical')
  await expect(preview.locator('a.hlx-link-card').first()).toHaveAttribute('href', 'https://github.com/facebook/lexical')
  // Site icons are only while editing.
  await expect(preview.locator('[data-favicon]')).toHaveCount(0)
})

test('turns a pasted address into a card on a blank line, as one undo step', async ({ page }) => {
  await answer(page)
  await loadSample(page)
  await editor(page).getByText('貼上 GitHub 或 arXiv').click()
  await toLineEnd(page)
  await page.keyboard.press('Enter')
  // Through the real clipboard and shortcut.
  await page.evaluate(() => navigator.clipboard.writeText('https://github.com/KennKyou/hakulex'))
  await page.keyboard.press('ControlOrMeta+V')
  await expect(cards(page)).toHaveCount(6)
  await expect(cards(page).last().locator('.hlx-link-card-title-text')).toHaveText('hakulex')
  await page.keyboard.press('ControlOrMeta+Z')
  await expect(cards(page)).toHaveCount(5)
})

test('switches a link alone on its line to a card, and the card back to a link', async ({ page }) => {
  await answer(page)
  await loadSample(page)
  await editor(page).locator('a.hlx-link', { hasText: 'hakulex' }).click()
  const kinds = page.getByRole('group', { name: '連結或卡片' })
  await expect(kinds).toBeVisible()
  await kinds.getByRole('button', { name: '卡片' }).click()
  await expect(cards(page)).toHaveCount(6)
  await expect(cards(page).last().locator('.hlx-link-card-title-text')).toHaveText('hakulex')
  await expect.poll(async () => (await stored(page)).filter(node => node.type === 'link-card').at(-1)).toEqual({ type: 'link-card', version: 1, url: 'https://github.com/KennKyou/hakulex' })
  // The card is selected, with its toolbar.
  await page.locator('.hlx-block-toolbar').getByRole('button', { name: '轉成連結' }).click()
  await expect(cards(page)).toHaveCount(5)
  await expect(editor(page).locator('a.hlx-link', { hasText: 'hakulex' })).toHaveCount(1)
})

test('shows a link\'s site icon before its text while editing', async ({ page, browserName }) => {
  if (browserName === 'webkit') {
    // Playwright never shows a request for /favicon.ico to the route, in any browser. Chromium
    // and Firefox then fail the picture at once, but WebKit never answers it, so the search
    // would wait on it for good. Fail it at once here too, as the other two do.
    await page.addInitScript(() => {
      const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        ...source,
        get(this: HTMLImageElement) {
          return source.get!.call(this)
        },
        set(this: HTMLImageElement, value: string) {
          if (/^https?:\/\/[^/]+\/favicon\.ico$/.test(value)) {
            setTimeout(() => this.dispatchEvent(new Event('error')))
            return
          }
          source.set!.call(this, value)
        },
      })
    })
  }
  const asked = await answer(page)
  await loadSample(page)
  const link = editor(page).locator('a.hlx-link', { hasText: 'hakulex' })
  await expect(link).toHaveAttribute('data-favicon', 'loaded')
  // Tried in order, once for the site, up to the one that loads.
  // Showing it asks again, so only which addresses were asked matters.
  expect([
    ...new Set(asked.filter(url => url.startsWith('https://github.com/'))),
  ]).toEqual(['https://github.com/favicon.png'])
  const icon = await link.evaluate((element) => {
    const style = getComputedStyle(element, '::before')
    return [
      style.width,
      style.height,
      style.marginRight,
      style.backgroundImage.includes('github.com/favicon.png'),
    ]
  })
  const size = await link.evaluate(element => getComputedStyle(element).fontSize)
  expect(icon).toEqual([
    size,
    size,
    `${Number.parseFloat(size) * 0.2}px`,
    true,
  ])
  await expect(link).toHaveText('hakulex')
})
