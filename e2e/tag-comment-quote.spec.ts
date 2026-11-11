import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const tag = (page: Page) => editor(page).locator('.hlx-tag')
const comment = (page: Page) => editor(page).locator('.hlx-comment')
const field = (page: Page) => page.getByRole('textbox', { name: '出處' })
const quote = (page: Page, text: string) => editor(page).locator('blockquote', { hasText: text })

interface Json { type: string, text?: string, attribution?: string | null, children?: Json[] }

/** What `v-model` handed the page. */
async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error')
      seen.push(message.text())
  })
  await page.goto('/editor')
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function sample(page: Page) {
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入標籤和引用' }).click()
  await expect(tag(page)).toBeVisible()
}

async function insert(page: Page, query: string) {
  await editor(page).click()
  await page.keyboard.type(`前 /${query}`)
  await expect(page.locator('.hlx-slash-menu [role="option"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
}

test.describe('tag', () => {
  test('inserts from the slash menu, and typing replaces its text', async ({ page }) => {
    await insert(page, 'tag')
    await expect(tag(page)).toHaveText('標籤')
    await page.keyboard.type('new')
    await expect(tag(page)).toHaveText('new')
    await expect(editor(page).locator('p')).toHaveText('前 new')
  })

  test('goes away with one undo after inserting', async ({ page }) => {
    await insert(page, 'tag')
    await expect(tag(page)).toBeVisible()
    await undo(page)
    await expect(tag(page)).toHaveCount(0)
  })

  test('inserts from the toolbar', async ({ page }) => {
    await editor(page).click()
    await page.getByRole('button', { name: '插入' }).click()
    await page.getByRole('menuitem', { name: '標籤' }).click()
    await expect(tag(page)).toHaveText('標籤')
    await page.keyboard.type('字')
    await expect(tag(page)).toHaveText('字')
  })

  test('turns from typed markdown, and typing goes on after it', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('前<tag>字</tag>後')
    await expect(tag(page)).toHaveText('字')
    await expect(editor(page).locator('p')).toHaveText('前字後')
  })

  test('stays text in inline code', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('`ab`')
    await expect(editor(page).locator('code')).toHaveText('ab')
    await page.keyboard.press('ArrowLeft')
    // The caret takes on the code format when the browser reports where it went.
    await expect.poll(() => editor(page).evaluate(root =>
      ((root as unknown as { __lexicalEditor: { getEditorState: () => { _selection: { format: number } | null } } }).__lexicalEditor.getEditorState()._selection?.format ?? 0) & 16)).toBe(16)
    await page.keyboard.type('<tag>c</tag>')
    await expect(editor(page).locator('code')).toContainText('<tag>c</tag>')
    await expect(tag(page)).toHaveCount(0)
  })

  test('takes typing in the middle', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('<tag>甲乙</tag>')
    await expect(tag(page)).toHaveText('甲乙')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type('中')
    await expect(tag(page)).toHaveText('甲中乙')
  })

  test('sends text typed right after it outside', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('<tag>字</tag>')
    await expect(tag(page)).toHaveText('字')
    await page.keyboard.type('外')
    await expect(tag(page)).toHaveText('字')
    await expect(editor(page).locator('p')).toHaveText('字外')
  })

  test('goes away when its last character is deleted', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('前<tag>字</tag>')
    await expect(tag(page)).toHaveText('字')
    await page.keyboard.press('Backspace')
    await expect(tag(page)).toHaveCount(0)
    await page.keyboard.type('x')
    await expect(editor(page).locator('p')).toHaveText('前x')
  })

  test('shows in the preview', async ({ page }) => {
    await sample(page)
    await page.getByRole('tab', { name: '預覽' }).click()
    await expect(page.locator('.editor-frame:visible .hlx-tag')).toHaveText('標籤')
  })
})

test.describe('comment', () => {
  test('inserts from the slash menu, and typing replaces its text', async ({ page }) => {
    await insert(page, 'comment')
    await expect(comment(page)).toHaveText('註解')
    await page.keyboard.type('note')
    await expect(comment(page)).toHaveText('note')
  })

  test('turns from typed markdown, and typing goes on after it', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('前<!--字-->後')
    await expect(comment(page)).toHaveText('字')
    await expect(editor(page).locator('p')).toContainText('後')
    const nodes = (await stored(page))[0].children!
    expect(nodes.map(node => node.type)).toEqual(['text', 'comment', 'text'])
  })

  test('shows to the author, and not in the preview or a read-only editor', async ({ page }) => {
    await sample(page)
    await expect(comment(page)).toBeVisible()
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await expect(comment(page)).toBeHidden()
    await page.getByRole('tab', { name: '預覽' }).click()
    const frame = page.locator('.editor-frame:visible')
    await expect(frame).toContainText('前')
    await expect(frame).not.toContainText('筆記')
    await page.getByRole('tab', { name: 'SSR HTML' }).click()
    await expect(page.locator('pre.code-block').first()).toContainText('<!--筆記-->')
  })
})

test.describe('attribution', () => {
  test('makes a quote typed by hand a rich one', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('> 引文')
    await expect(field(page)).toBeVisible()
    await field(page).click()
    await page.keyboard.type('魯迅')
    await page.keyboard.press('Enter')
    await expect(quote(page, '引文').locator('footer')).toHaveText('— 魯迅')
    await expect(field(page)).toHaveValue('魯迅')
    await page.keyboard.type('x')
    await expect(quote(page, '引文')).toContainText('引文x')
    expect((await stored(page))[0]).toMatchObject({ type: 'rich-quote', attribution: '魯迅' })
  })

  test('goes back to a plain quote with one undo', async ({ page }) => {
    await sample(page)
    await quote(page, '一般的引用').click()
    await field(page).click()
    await page.keyboard.type('某人')
    await page.keyboard.press('Enter')
    await expect(quote(page, '一般的引用').locator('footer')).toHaveText('— 某人')
    await undo(page)
    await expect(quote(page, '一般的引用').locator('footer')).toHaveCount(0)
    await expect.poll(async () => (await stored(page))[2].type).toBe('quote')
  })

  test('is written when clicking elsewhere', async ({ page }) => {
    await sample(page)
    await quote(page, '一般的引用').click()
    await field(page).click()
    await page.keyboard.type('某人')
    await editor(page).locator('p', { hasText: '最後一段' }).click()
    await expect(quote(page, '一般的引用').locator('footer')).toHaveText('— 某人')
    await expect(field(page)).toHaveCount(0)
    await page.keyboard.type('x')
    await expect(editor(page).locator('p', { hasText: '最後一段' })).toContainText('x')
    await expect(quote(page, '一般的引用')).not.toContainText('x')
  })

  test('is dropped with Esc', async ({ page }) => {
    await sample(page)
    await quote(page, '有出處的引用').click()
    await expect(field(page)).toHaveValue('魯迅')
    await field(page).click()
    await page.keyboard.type('改掉')
    await page.keyboard.press('Escape')
    await expect(field(page)).toHaveValue('魯迅')
    await expect(quote(page, '有出處的引用').locator('footer')).toHaveText('— 魯迅')
    await page.keyboard.type('x')
    await expect(quote(page, '有出處的引用')).toContainText('有出處的引用x')
  })

  test('can be cleared', async ({ page }) => {
    await sample(page)
    await quote(page, '有出處的引用').click()
    await field(page).click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Enter')
    await expect(quote(page, '有出處的引用').locator('footer')).toBeHidden()
    await expect.poll(async () => (await stored(page))[1]).toMatchObject({ type: 'rich-quote', attribution: null })
  })

  test('is gone when read only, with the attribution still showing', async ({ page }) => {
    await sample(page)
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await quote(page, '有出處的引用').click()
    await expect(field(page)).toHaveCount(0)
    await expect(quote(page, '有出處的引用').locator('footer')).toHaveText('— 魯迅')
  })

  test('does not take the caret into the attribution', async ({ page }) => {
    await sample(page)
    await quote(page, '有出處的引用').locator('footer').click()
    await page.keyboard.type('字')
    await expect(quote(page, '有出處的引用').locator('footer')).toHaveText('— 魯迅')
  })

  test('can be reached inside a callout, along with the callout bar', async ({ page }) => {
    await sample(page)
    await quote(page, '提示裡的引用').click()
    await expect(field(page)).toBeVisible()
    const type = page.getByRole('combobox', { name: '區塊類型' })
    await expect(type).toBeVisible()
    const [a, b] = await Promise.all([
      field(page).boundingBox(),
      type.boundingBox(),
    ])
    expect(a!.y >= b!.y + b!.height || b!.y >= a!.y + a!.height).toBe(true)
    await field(page).click()
    await page.keyboard.type('某人')
    await page.keyboard.press('Enter')
    await expect(quote(page, '提示裡的引用').locator('footer')).toHaveText('— 某人')
    await quote(page, '提示裡的引用').click()
    await expect(type).toBeVisible()
    await type.click()
  })
})

test.describe('composing', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'only Chromium can drive a composition step by step')

  async function compose(page: Page, ...steps: string[]) {
    const session = await page.context().newCDPSession(page)
    for (const text of steps)
      await session.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length })
    await session.send('Input.insertText', {
      text: steps.at(-1)!,
    })
    await session.detach()
  }

  test('replaces the selected default text with the whole word', async ({ page }) => {
    await insert(page, 'tag')
    await expect(tag(page)).toHaveText('標籤')
    await compose(page, 'ㄒ', '新', '新標')
    await expect(tag(page)).toHaveText('新標')
    await expect(editor(page).locator('p')).toHaveText('前 新標')
  })

  test('keeps a word composed in parts inside', async ({ page }) => {
    await insert(page, 'comment')
    await compose(page, 'ㄒ', '新')
    await compose(page, 'ㄅ', '標')
    await expect(comment(page)).toHaveText('新標')
    await page.keyboard.press('ArrowRight')
    await compose(page, 'ㄨ', '外')
    await expect(comment(page)).toHaveText('新標')
    await expect(editor(page).locator('p')).toContainText('外')
  })

  test('goes outside right after a tag', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('<tag>abc</tag>')
    await expect(tag(page)).toHaveText('abc')
    await compose(page, 'ㄨ', '外')
    await expect(tag(page)).toHaveText('abc')
    await expect(editor(page).locator('p')).toHaveText('abc外')
  })

  test('stays inside in the middle of a tag', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('<tag>abc</tag>')
    await expect(tag(page)).toHaveText('abc')
    await page.keyboard.press('ArrowLeft')
    await compose(page, 'ㄓ', '中')
    await expect(tag(page)).toHaveText('ab中c')
  })

  test('does not confirm the attribution with the Enter that picks a word', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('> abc')
    await field(page).click()
    await compose(page, 'ㄌ', '魯')
    await expect(field(page)).toHaveValue('魯')
    await expect(field(page)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(quote(page, 'abc').locator('footer')).toHaveText('— 魯')
  })
})

test('all come back from JSON without a placeholder', async ({ page }) => {
  await sample(page)
  await expect(editor(page).locator('[data-unknown-type]')).toHaveCount(0)
  await editor(page).locator('p', { hasText: '最後一段' }).click()
  await toLineEnd(page)
  await page.keyboard.type('新')
  await expect.poll(async () => JSON.stringify(await stored(page))).toContain('最後一段新')
  const children = await stored(page)
  expect(children[0].children!.map(node => node.type)).toEqual([
    'text',
    'tag',
    'text',
    'comment',
    'text',
  ])
  expect(children[1]).toMatchObject({ type: 'rich-quote', attribution: '魯迅' })
  expect(children[2].type).toBe('quote')
})
