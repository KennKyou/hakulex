import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { toLineStart } from './keys'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const inputs = (page: Page) => editor(page).locator('.hlx-footnote-input')
const refs = (page: Page) => editor(page).locator('.hlx-footnote-ref')

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      seen.push(message.text())
  })
  await page.goto('/editor')
  await editor(page).click()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

const type = (page: Page, text: string) => page.keyboard.type(text, { delay: 15 })

async function paste(page: Page, text: string) {
  await page.evaluate(value => navigator.clipboard.writeText(value), text)
  await page.keyboard.press('ControlOrMeta+V')
}

interface Json { type: string, text?: string, identifier?: string, definitions?: Record<string, string>, children?: Json[] }

function documentJson(page: Page) {
  return editor(page).evaluate(root =>
    (root as unknown as { __lexicalEditor: { getEditorState: () => { toJSON: () => { root: unknown } } } }).__lexicalEditor.getEditorState().toJSON().root) as Promise<Json>
}
const definitions = async (page: Page) => (await documentJson(page)).children?.find(child => child.type === 'footnote-section')?.definitions

/** A paragraph as `甲[1]乙`, with the reference's identifier in brackets. */
async function paragraphs(page: Page) {
  const line = (node: Json): string => node.type === 'footnote'
    ? `[${node.identifier}]`
    : node.text ?? (node.children ?? []).map(line).join('')
  return ((await documentJson(page)).children ?? [])
    .filter(child => child.type === 'paragraph')
    .map(line)
}
const blockTypes = async (page: Page) => ((await documentJson(page)).children ?? []).map(child => child.type)

async function insertFromMenu(page: Page) {
  await type(page, '/footnote')
  await expect(page.locator('.hlx-slash-menu [role="option"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(inputs(page).last()).toBeFocused()
}

/** Text with two notes that have content. */
async function withNotes(page: Page) {
  await paste(page, '甲[^1]乙[^2]丙\n\n[^1]: 第一\n\n[^2]: 第二 https://example.com/x 。')
  await expect(inputs(page)).toHaveCount(2)
}

test.describe('adding', () => {
  test('turns a typed number into a reference, with its note last', async ({ page }) => {
    await type(page, '前[^1]後')
    await expect(refs(page)).toHaveText('1')
    expect(await paragraphs(page)).toEqual(['前[1]後'])
    expect(await blockTypes(page)).toEqual(['paragraph', 'footnote-section'])

    await type(page, ' [^abc]')
    expect(await paragraphs(page)).toEqual(['前[1]後 [^abc]'])
  })

  test('goes from the slash menu to the content, and back to the text', async ({ page }) => {
    await type(page, '前 ')
    await insertFromMenu(page)
    await page.keyboard.type('內容')
    await page.keyboard.press('Enter')
    await expect(editor(page)).toBeFocused()
    await type(page, '後')
    expect(await paragraphs(page)).toEqual(['前 [1]後'])
    expect(await definitions(page)).toEqual({ 1: '內容' })
  })

  test('undoes the slash menu in one step, leaving no trigger behind', async ({ page }) => {
    await type(page, '前 ')
    await insertFromMenu(page)
    await page.keyboard.press('Escape')
    await expect(editor(page)).toBeFocused()
    await undo(page)
    await expect(refs(page)).toHaveCount(0)
    expect((await paragraphs(page))[0]).toBe('前 ')
    expect(await blockTypes(page)).toEqual(['paragraph'])
  })
})

test.describe('editing content', () => {
  test.beforeEach(async ({ page }) => {
    await withNotes(page)
  })

  test('goes to the note when a reference is clicked', async ({ page }) => {
    const before = await documentJson(page)
    await refs(page).nth(1).locator('a').click()
    await expect(inputs(page).nth(1)).toBeFocused()
    expect(await documentJson(page)).toEqual(before)
    expect(page.url()).not.toContain('#')
  })

  test('writes when leaving the input, and undoes in one step', async ({ page }) => {
    await inputs(page).first().click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.type('改過')
    expect((await definitions(page))?.[1]).toBe('第一')
    await page.keyboard.press('Tab')
    await expect.poll(async () => (await definitions(page))?.[1]).toBe('改過')

    await editor(page).locator('p').first().click()
    await undo(page)
    await expect.poll(async () => (await definitions(page))?.[1]).toBe('第一')
    await expect(inputs(page).first()).toHaveValue('第一')
  })

  test('uses the browser for undo inside the input, and Escape gives the old text back', async ({ page }) => {
    const before = await documentJson(page)
    await inputs(page).first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('X')
    await undo(page)
    await expect(inputs(page).first()).toHaveValue('第一')
    expect(await documentJson(page)).toEqual(before)

    await page.keyboard.type('Y')
    await page.keyboard.press('Escape')
    await expect(editor(page)).toBeFocused()
    await expect(inputs(page).first()).toHaveValue('第一')
    await type(page, '插')
    expect(await paragraphs(page)).toEqual(['甲[1]插乙[2]丙'])
  })

  test('removes a note with its references, renumbering the rest, and undoes in one step', async ({ page }) => {
    await editor(page).getByRole('button', { name: '刪除註腳 1', exact: true }).click()
    await expect(refs(page)).toHaveText(['1'])
    expect(await paragraphs(page)).toEqual(['甲乙[2]丙'])
    expect(await definitions(page)).toEqual({ 2: '第二 https://example.com/x 。' })

    await undo(page)
    await expect(refs(page)).toHaveText(['1', '2'])
    expect(await paragraphs(page)).toEqual(['甲[1]乙[2]丙'])
  })
})

test.describe('around references', () => {
  test('moves past a reference with the arrow keys, and deletes it with backspace', async ({ page }) => {
    await type(page, 'ab[^1]cd')
    await toLineStart(page)
    for (let i = 0; i < 3; i++)
      await page.keyboard.press('ArrowRight')
    await type(page, 'X')
    expect(await paragraphs(page)).toEqual(['ab[1]Xcd'])

    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    expect(await paragraphs(page)).toEqual(['abcd'])
    await expect.poll(() => blockTypes(page)).toEqual(['paragraph'])

    await undo(page)
    await expect.poll(() => paragraphs(page)).toEqual(['ab[1]cd'])
    await expect.poll(() => blockTypes(page)).toEqual(['paragraph', 'footnote-section'])
  })

  test('keeps the content when a paragraph is cut and pasted back', async ({ page }) => {
    await paste(page, '甲[^1]\n\n乙\n\n[^1]: 第一')
    await expect(inputs(page)).toHaveValue('第一')

    // A triple click, as Shift+End means something else on each platform.
    await editor(page).locator('p').first().click({
      clickCount: 3,
      position: { x: 5, y: 8 },
    })
    await page.keyboard.press('ControlOrMeta+X')
    await expect(refs(page)).toHaveCount(0)
    await expect(editor(page).locator('.hlx-footnote-orphan')).toBeVisible()
    await expect(inputs(page)).toHaveValue('第一')

    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ControlOrMeta+V')
    await expect(refs(page)).toHaveText('1')
    await expect(editor(page).locator('.hlx-footnote-orphan')).toHaveCount(0)
    expect(await definitions(page)).toEqual({ 1: '第一' })
    expect(await blockTypes(page)).toEqual(['paragraph', 'paragraph', 'footnote-section'])
  })

  test('selects a whole paragraph with a triple click, reference included', async ({ page }) => {
    await paste(page, '甲甲甲[^1]乙乙乙\n\n[^1]: 第一')
    await expect(refs(page)).toHaveCount(1)
    const line = editor(page).locator('p').first()
    await line.click({
      clickCount: 3,
      position: { x: 5, y: 8 },
    })
    await expect.poll(() => page.evaluate(() => getSelection()!.toString())).toContain('乙乙乙')
    await expect(page.locator('.hlx-floating-toolbar')).toBeVisible()
    await page.locator('.hlx-floating-toolbar').getByRole('button', { name: '粗體' }).click()
    expect(await paragraphs(page)).toEqual(['甲甲甲[1]乙乙乙'])
  })

  test('puts a click below the notes in a paragraph above them', async ({ page }) => {
    await withNotes(page)
    const box = (await editor(page).boundingBox())!
    await page.mouse.click(box.x + 40, box.y + box.height - 4)
    await type(page, '新段')
    expect(await paragraphs(page)).toEqual(['甲[1]乙[2]丙', '新段'])
    expect((await blockTypes(page)).at(-1)).toBe('footnote-section')
  })

  test('keeps references and content through copy and paste within a document', async ({ page }) => {
    await withNotes(page)
    await editor(page).locator('p').first().click({
      clickCount: 3,
      position: { x: 5, y: 8 },
    })
    await page.keyboard.press('ControlOrMeta+C')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ControlOrMeta+V')
    await expect(refs(page)).toHaveText(['1', '2', '1', '2'])
    expect(await definitions(page)).toEqual({ 1: '第一', 2: '第二 https://example.com/x 。' })
  })

  test('converts pasted markdown in one undo step', async ({ page }) => {
    await type(page, '前')
    await withNotes(page)
    await undo(page)
    await expect(refs(page)).toHaveCount(0)
    expect(await blockTypes(page)).toEqual(['paragraph'])
    expect(await paragraphs(page)).toEqual(['前'])
  })
})

test.describe('readers', () => {
  test.beforeEach(async ({ page }) => {
    await withNotes(page)
  })

  async function followBothWays(page: Page, root: ReturnType<Page['locator']>) {
    await root.locator('.hlx-footnote-ref a').nth(1).click()
    await expect.poll(() => new URL(page.url()).hash).toBe('#footnote-2')
    const note = root.locator('#footnote-2')
    await expect(note).toBeInViewport()
    await expect.poll(() => note.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')

    await note.locator('.hlx-footnote-back').click()
    await expect.poll(() => new URL(page.url()).hash).toBe('#footnote-ref-2')
  }

  test('links both ways in the preview, with safe URLs in the content', async ({ page }) => {
    await page.getByRole('tab', { name: '預覽' }).click()
    const preview = page.locator('.hlx-renderer')
    await expect(preview.locator('.hlx-footnote-ref')).toHaveText(['1', '2'])
    await expect(preview.locator('.hlx-footnote-ref a').first()).toHaveAttribute('title', '第一')
    await expect(preview.locator('.hlx-footnote-text a')).toHaveAttribute('href', 'https://example.com/x')
    await followBothWays(page, preview)
  })

  test('links both ways while read-only, with no controls and no changes', async ({ page }) => {
    const before = await documentJson(page)
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await expect(inputs(page)).toHaveCount(0)
    await expect(editor(page).locator('.hlx-footnote-remove')).toHaveCount(0)
    await expect(editor(page).locator('.hlx-footnote-text').first()).toHaveText('第一')
    await followBothWays(page, editor(page))
    expect(await documentJson(page)).toEqual(before)
  })

  test('links both ways from server output with JavaScript off', async ({ page, browser }) => {
    await page.getByRole('tab', { name: 'SSR HTML' }).click()
    const html = await page.locator('pre.code-block').first().textContent()
    expect(html).toContain('doc-endnotes')

    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: 'http://localhost:5199' })
    const reader = await context.newPage()
    await reader.route('**/ssr', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8">${html}<div style="height:3000px"></div>` }))
    await reader.goto('/ssr')
    await reader.locator('.hlx-footnote-ref a').nth(1).click()
    await expect.poll(() => new URL(reader.url()).hash).toBe('#footnote-2')
    await reader.locator('#footnote-2 .hlx-footnote-back').click()
    await expect.poll(() => new URL(reader.url()).hash).toBe('#footnote-ref-2')
    await context.close()
  })
})
