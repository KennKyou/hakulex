import type { Locator, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/*
 * Element looks in a real browser, with sample content
 * (e2e/fixtures/looks.json): what each one computes to, in the editor and the preview.
 */

const FIXTURE = JSON.parse(readFileSync(new URL('./fixtures/looks.json', import.meta.url), 'utf8'))
const editor = (page: Page) => page.locator('.hlx-content').first()
const preview = (page: Page) => page.locator('.hlx-renderer')
const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    // A link's site icon is looked for in a few places, and a missing one fails to load.
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      seen.push(message.text())
  })
  // Nothing leaves the machine: the document's links go to made-up sites.
  await page.route(url => url.hostname !== 'localhost', route => route.abort())
  await page.goto('/editor')
  // The demo's document, set as a site would set its v-model.
  await page.evaluate((doc) => {
    ;(document.querySelector('#app') as any).__vue_app__._instance.setupState.doc = doc
  }, FIXTURE)
  await expect(editor(page).locator('.hlx-code-card')).toBeVisible()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

const style = (locator: Locator, name: string, pseudo?: string) => locator.evaluate((element, [property, part]) => getComputedStyle(element, part ?? null).getPropertyValue(property!).trim(), [name, pseudo] as const)

test('draws links, mentions and spoilers, in the editor and the preview', async ({ page }) => {
  for (const view of ['editor', 'preview'] as const) {
    if (view === 'preview')
      await page.getByRole('tab', { name: '預覽' }).click()
    const root = view === 'editor'
      ? editor(page)
      : preview(page)
    const link = root.locator('a.hlx-link').first()
    expect(await style(link, 'color')).toBe('rgb(37, 99, 235)')
    expect(await style(link, 'text-underline-offset')).toBe('3.52px')
    expect(await style(link, 'text-decoration-color')).toMatch(/oklab|rgba|color\(/)
    const mention = root.locator('.hlx-mention').first()
    expect(await style(mention, 'border-radius')).toBe('999px')
    expect(await style(mention, 'background-color')).toBe('rgb(250, 250, 250)')
  }
  // Readers see a mask in the third text color until they point at it.
  const hidden = preview(page).locator('.hlx-spoiler').first()
  expect(await style(hidden, 'background-color')).toBe('rgb(115, 115, 115)')
  expect(await style(hidden, 'color')).toBe('rgba(0, 0, 0, 0)')
  await hidden.hover()
  await expect.poll(() => style(hidden, 'color')).not.toBe('rgba(0, 0, 0, 0)')
  // The author sees the text through a tint.
  await page.getByRole('tab', { name: '編輯' }).click()
  expect(await style(editor(page).locator('.hlx-spoiler').first(), 'background-color')).toMatch(/^rgba\(23, 23, 23, 0\.3\)$|^color\(srgb 0\.09\d* 0\.09\d* 0\.09\d* \/ 0\.3\)$/)
})

test('sweeps a highlight in as a reader scrolls to it, and shows it at once while editing', async ({ page }) => {
  expect(await style(editor(page).locator('.hlx-highlight').first(), '--hlx-highlighted')).toBe('1')
  await page.getByRole('tab', { name: '預覽' }).click()
  const highlight = preview(page).locator('.hlx-highlight').first()
  expect(await style(highlight, 'background-image')).toContain('linear-gradient(120deg')
  await highlight.scrollIntoViewIfNeeded()
  await expect.poll(() => style(highlight, '--hlx-highlighted')).toBe('1')
})

test('letters nested numbered lists, keeps circles at every deeper level, and draws checkboxes that still tick', async ({ page }) => {
  expect(await style(editor(page).locator('.hlx-listitem-nested .hlx-ol').first(), 'list-style-type')).toBe('lower-alpha')
  expect(await style(editor(page).locator('.hlx-listitem-nested .hlx-listitem-nested .hlx-ul').first(), 'list-style-type')).toBe('circle')
  const ticked = editor(page).locator('.hlx-listitem-checked').first()
  expect(await style(ticked, 'width', '::before')).toBe('18px')
  expect(await style(ticked, 'background-color', '::before')).toBe('rgb(23, 23, 23)')
  expect(await style(ticked, 'color')).toBe('rgb(115, 115, 115)')
  const open = editor(page).locator('li', { hasText: 'Write unit tests' })
  await open.scrollIntoViewIfNeeded()
  const box = (await open.boundingBox())!
  // The box sits on the first line.
  await page.mouse.click(box.x + 9, box.y + 12)
  await expect(open).toHaveClass(/hlx-listitem-checked/)
})

test('bars a quote with 2px, and draws an article\'s rule short, with the next block right after its space', async ({ page }) => {
  const quote = editor(page).locator('.hlx-quote').first()
  expect(await style(quote, 'width', '::before')).toBe('2px')
  const rule = editor(page).locator('.hlx-hr').first()
  expect((await rule.boundingBox())!.width).toBe(60)
  const after = editor(page).locator('.hlx-hr-block + *').first()
  expect(await style(after, 'margin-top')).toBe('0px')
})

test('heads alerts with their icon, tints the banner, and folds the heading into a comment\'s first line', async ({ page }) => {
  const note = editor(page).locator('.hlx-alert').first()
  const icon = note.locator('.hlx-callout-icon svg')
  await expect(icon).toBeVisible()
  expect((await icon.boundingBox())!.width).toBe(15)
  expect(await style(note.locator('.hlx-callout-label'), 'color')).toBe('rgb(37, 99, 235)')
  expect(await style(note, 'width', '::before')).toBe('2px')
  const banner = editor(page).locator('.hlx-banner').first()
  expect(await style(banner, 'background-color')).not.toBe('rgba(0, 0, 0, 0)')
  await expect(banner.locator('.hlx-callout-icon svg')).toBeVisible()
  await expect(banner.locator('.hlx-callout-title')).toHaveClass(/hlx-visually-hidden/)
  await page.getByRole('radiogroup', { name: 'Variant' }).getByRole('radio', { name: 'Comment', exact: true }).click()
  expect(await style(note.locator('.hlx-callout-label'), 'float')).toBe('left')
})

test('opens a collapsible block with the arrow turning and the line giving way to a guide', async ({ page }) => {
  await page.getByRole('tab', { name: '預覽' }).click()
  const outer = preview(page).locator('details.hlx-details').first()
  const summary = outer.locator(':scope > .hlx-details-summary')
  expect(Number.parseFloat(await style(summary, 'width', '::after'))).toBeGreaterThan(20)
  await summary.click()
  await expect(outer).toHaveAttribute('open', '')
  await expect.poll(() => style(outer, '--hlx-details-progress')).toBe('1')
  expect(await style(summary.locator('.hlx-details-chevron'), 'transform')).toMatch(/^matrix\(6\.1\d*e-17, 1, -1, 6\.1\d*e-17, 0, 0\)$|^matrix\(0, 1, -1, 0, 0, 0\)$/)
  expect(await style(outer.locator(':scope > .hlx-details-body'), 'color')).toBe('rgb(64, 64, 64)')
  // The one inside stays closed: each keeps its own progress.
  const inner = outer.locator('details.hlx-details')
  expect(await style(inner, '--hlx-details-progress')).toBe('0')
})

test('opens at once when the reader asks for less motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('tab', { name: '預覽' }).click()
  const outer = preview(page).locator('details.hlx-details').first()
  await outer.locator(':scope > .hlx-details-summary').click()
  expect(await style(outer, '--hlx-details-progress')).toBe('1')
})

test('numbers a code block\'s lines and heads it with the language\'s icon, in the preview and the editor', async ({ page }) => {
  const card = editor(page).locator('.hlx-code-card').first()
  await expect(card.locator('.hlx-code-lang-icon svg')).toBeVisible()
  expect((await card.locator('.hlx-code-header').boundingBox())!.height).toBe(36)
  await expect(card.locator('.cm-lineNumbers .cm-gutterElement', { hasText: /^5$/ })).toBeVisible()
  await page.getByRole('tab', { name: '預覽' }).click()
  // Once highlighted: until then the lines are plain, and are swapped for colored ones.
  await expect(preview(page).locator('.hlx-code-lined')).toHaveAttribute('data-highlighted', '')
  const lines = preview(page).locator('.hlx-code-lined .hlx-code-line')
  await expect(lines).toHaveCount(5)
  expect(await style(lines.nth(4), 'content', '::before')).toBe('counter(hlx-code-line)')
  expect(await lines.nth(4).evaluate(element => getComputedStyle(element, '::before').position)).toBe('sticky')
  expect(await style(lines.nth(0), 'color', '::before')).toBe('rgb(163, 163, 163)')
})
