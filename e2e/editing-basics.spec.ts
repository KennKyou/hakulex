import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { toLineEnd, toLineStart } from './keys'

const editor = (page: Page) => page.locator('.hlx-content')
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const toolbarButton = (page: Page, name: string) => page.locator('.hlx-floating-toolbar').getByRole('button', { name, exact: true })

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
  // Nothing leaves the machine: the links' sites, and their icons, are made up.
  await page.route(url => url.hostname !== 'localhost', route => route.abort())
  await page.goto('/editor')
  await editor(page).click()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

/** Through the real system clipboard and keyboard shortcut. */
async function paste(page: Page, text: string) {
  await page.evaluate(value => navigator.clipboard.writeText(value), text)
  await page.keyboard.press('ControlOrMeta+V')
}

// Lexical's invisible caret anchors next to decorators are not part of the document.
function blockOrder(page: Page) {
  return editor(page).evaluate(root => [...root.children]
    .filter(child => !child.hasAttribute('data-lexical-decorator-boundary'))
    .map(child => child.textContent ?? ''))
}

test.describe('pasting', () => {
  test('converts markdown into nodes, and undoes in one step', async ({ page }) => {
    await page.keyboard.type('before')
    await page.keyboard.press('Enter')
    await paste(page, '# Title\n\n- one\n- two\n\nSome **bold** text')

    await expect(editor(page).locator('h1')).toHaveText('Title')
    await expect(editor(page).locator('li')).toHaveCount(2)
    await expect(editor(page).locator('.hlx-bold')).toHaveText('bold')
    await expect(editor(page)).not.toContainText('**')

    await undo(page)
    await expect(editor(page).locator('h1')).toHaveCount(0)
    await expect(editor(page)).toContainText('before')
  })

  test('converts a plain list, but not a single item', async ({ page }) => {
    await paste(page, '- one\n- two')
    await expect(editor(page).locator('ul li')).toHaveCount(2)
    await expect(editor(page)).not.toContainText('- ')

    await page.keyboard.press('ControlOrMeta+Z')
    await expect(editor(page).locator('li')).toHaveCount(0)
    await paste(page, '- just one')
    await expect(editor(page).locator('li')).toHaveCount(0)
    await expect(editor(page)).toContainText('- just one')
  })

  test('keeps ordinary prose as it is', async ({ page }) => {
    const prose = 'Plain prose with a * b and `one` code span.'
    await paste(page, prose)
    await expect(editor(page).locator('p')).toHaveCount(1)
    await expect(editor(page)).toHaveText(prose)
    await expect(editor(page).locator('.hlx-code')).toHaveCount(0)
  })

  test('does not make clickable links from unsafe markdown', async ({ page }) => {
    await paste(page, '# Title\n\n[evil](javascript:alert(1))')
    await expect(editor(page).locator('h1')).toHaveText('Title')
    await expect(editor(page).locator('a')).toHaveCount(0)
    await expect(editor(page)).toContainText('evil')
  })

  test('links a selected word when pasting a URL over it', async ({ page }) => {
    await page.keyboard.type('read docs')
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Shift+ArrowLeft')
    await paste(page, 'https://example.com/docs')

    const link = editor(page).locator('a')
    await expect(link).toHaveText('docs')
    await expect(link).toHaveAttribute('href', 'https://example.com/docs')
    await expect(editor(page)).toHaveText('read docs')
  })

  test('turns VS Code data into a code block', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox ignores clipboardData on a scripted paste event')
    // Scripted: a real VS Code copy can't be made here. The data format is what it writes.
    await editor(page).evaluate((root) => {
      const data = new DataTransfer()
      data.setData('text/plain', '# not a heading\nconst a = 1')
      data.setData('vscode-editor-data', JSON.stringify({ mode: 'typescript' }))
      root.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
    })
    await expect(editor(page).locator('.hlx-code-card')).toHaveAttribute('data-language', 'ts')
    await expect(editor(page).locator('.cm-content')).toContainText('# not a heading')
    await expect(editor(page).locator('h1')).toHaveCount(0)
  })
})

test.describe('autolinks', () => {
  test('links typed URLs and emails', async ({ page }) => {
    await page.keyboard.type('see https://example.com and me@example.com ok')
    const links = editor(page).locator('a')
    await expect(links).toHaveCount(2)
    await expect(links.nth(0)).toHaveAttribute('href', 'https://example.com')
    await expect(links.nth(1)).toHaveAttribute('href', 'mailto:me@example.com')
    await expect(editor(page)).toHaveText('see https://example.com and me@example.com ok')
  })

  test('stays unlinked once removed, also in the preview', async ({ page }) => {
    await page.keyboard.type('https://example.com')
    await expect(editor(page).locator('a')).toHaveCount(1)

    await editor(page).locator('a').click({ clickCount: 3 })
    await toolbarButton(page, '連結').click()
    await toolbarButton(page, '移除連結').click()
    await expect(editor(page).locator('a')).toHaveCount(0)

    await toLineEnd(page)
    await page.keyboard.type('/more')
    await expect(editor(page)).toContainText('https://example.com/more')
    await expect(editor(page).locator('a')).toHaveCount(0)

    await page.getByRole('tab', { name: '預覽' }).click()
    await expect(page.locator('.hlx-renderer a')).toHaveCount(0)
    await expect(page.locator('.hlx-renderer')).toContainText('https://example.com/more')
  })

  test('does not link inside inline code', async ({ page }) => {
    await page.keyboard.type('`https://example.com`')
    await expect(editor(page).locator('.hlx-code')).toHaveText('https://example.com')
    await expect(editor(page).locator('a')).toHaveCount(0)
  })
})

test.describe('clear formatting', () => {
  test('clears formats, keeps links, and undoes in one step', async ({ page }) => {
    await paste(page, '**bold** *italic* `code` [link](https://example.com/)')
    await expect(editor(page).locator('.hlx-bold')).toHaveCount(1)
    await expect(editor(page).locator('a')).toHaveCount(1)

    await editor(page).locator('p').click({ clickCount: 3 })
    await toolbarButton(page, '清除格式').click()
    await expect(editor(page).locator('.hlx-bold, .hlx-italic, .hlx-code')).toHaveCount(0)
    await expect(editor(page).locator('a')).toHaveText('link')
    await expect(editor(page)).toHaveText('bold italic code link')

    await undo(page)
    await expect(editor(page).locator('.hlx-bold')).toHaveCount(1)
    await expect(editor(page).locator('.hlx-code')).toHaveCount(1)
  })
})

test.describe('leaving inline code', () => {
  /** Lexical reads the caret on `selectionchange`, which fires after the key press returns. */
  const settled = (page: Page) => page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)))

  /** Inline code at the end of a line, with the caret holding the code format. */
  async function caretAtCodeEnd(page: Page) {
    await page.keyboard.type('x `code`')
    await expect(editor(page).locator('.hlx-code')).toHaveText('code')
    await page.keyboard.press('ArrowLeft')
    await settled(page)
    await page.keyboard.type('Q')
    await expect(editor(page).locator('.hlx-code')).toHaveText('codQe')
    await toLineEnd(page)
    await settled(page)
    // Typing here continues the code, which is what the next key has to get out of.
    await page.keyboard.type('Z')
    await expect(editor(page).locator('.hlx-code')).toHaveText('codQeZ')
  }

  test('leaves with arrow right, and adds nothing until the author types', async ({ page }) => {
    await caretAtCodeEnd(page)
    await page.keyboard.press('ArrowRight')
    await expect(editor(page)).toHaveText('x codQeZ')
    expect(await editor(page).evaluate(root => root.textContent)).not.toContain('​')

    await page.keyboard.type('ab')
    await expect(editor(page).locator('.hlx-code')).toHaveText('codQeZ')
    await expect(editor(page)).toHaveText('x codQeZab')
  })

  test('leaves with space', async ({ page }) => {
    await caretAtCodeEnd(page)
    await page.keyboard.type(' ab')
    await expect(editor(page).locator('.hlx-code')).toHaveText('codQeZ')
    await expect(editor(page)).toHaveText('x codQeZ ab')
  })

  test('keeps normal arrow keys in the middle of a line', async ({ page }) => {
    await page.keyboard.type('x `code`')
    await expect(editor(page).locator('.hlx-code')).toHaveText('code')
    await page.keyboard.type(' after')
    await toLineStart(page)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await settled(page)
    await page.keyboard.type('Y')
    await expect(editor(page).locator('.hlx-code')).toHaveText('cYode')
  })
})

test.describe('clicking below the document', () => {
  test('adds a paragraph after a trailing divider', async ({ page }) => {
    await page.keyboard.type('--- ')
    await expect(editor(page).locator('hr')).toHaveCount(1)
    await page.keyboard.press('Backspace')
    await expect(editor(page).locator('hr')).toHaveCount(1)
    await expect.poll(() => editor(page).locator('p').count()).toBe(0)

    const box = (await editor(page).boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 4)
    await page.keyboard.type('below')
    await expect.poll(() => blockOrder(page)).toEqual(['', 'below'])
  })

  test('adds nothing after a trailing paragraph', async ({ page }) => {
    await page.keyboard.type('only')
    const box = (await editor(page).boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 4)
    await expect(editor(page).locator('p')).toHaveCount(1)
  })
})

test.describe('collapsing long code', () => {
  const lines = (count: number) => Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n')
  const fence = (count: number) => `\`\`\`js\n${lines(count)}\n\`\`\``

  test('collapses 21 lines in the preview only, and toggles', async ({ page }) => {
    await paste(page, fence(21))
    await expect(editor(page).locator('.hlx-code-card')).not.toHaveAttribute('data-collapsed')
    await expect(editor(page).locator('.hlx-code-toggle')).toHaveCount(0)

    await page.getByRole('tab', { name: '預覽' }).click()
    const card = page.locator('.hlx-renderer .hlx-code-card')
    const body = card.locator('.hlx-code-body')
    const toggle = card.getByRole('button', { name: '展開' })
    await expect(card).toHaveAttribute('data-collapsed')
    expect(await body.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true)

    await body.evaluate((el) => {
      el.scrollTop = 40
    })
    expect(await body.evaluate(el => el.scrollTop)).toBe(40)

    await toggle.click()
    await expect(card).not.toHaveAttribute('data-collapsed')
    expect(await body.evaluate(el => el.scrollHeight <= el.clientHeight)).toBe(true)

    await card.getByRole('button', { name: '收合' }).click()
    await expect(card).toHaveAttribute('data-collapsed')
  })

  test('copies the whole block while collapsed', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'only Chromium lets a test read the clipboard')
    await paste(page, fence(21))
    await page.getByRole('tab', { name: '預覽' }).click()
    await page.locator('.hlx-renderer .hlx-code-card').getByRole('button', { name: '複製程式碼' }).click()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(lines(21))
  })

  test('keeps every line in the SSR HTML', async ({ page }) => {
    await paste(page, fence(21))
    await page.getByRole('tab', { name: 'SSR HTML' }).click()
    const html = page.locator('pre.code-block').first()
    await expect(html).toContainText('data-collapsed')
    await expect(html).toContainText('line 21')
  })

  test('does not collapse 20 lines', async ({ page }) => {
    await paste(page, fence(20))
    await page.getByRole('tab', { name: '預覽' }).click()
    const card = page.locator('.hlx-renderer .hlx-code-card')
    await expect(card).toBeVisible()
    await expect(card).not.toHaveAttribute('data-collapsed')
    await expect(card.locator('.hlx-code-toggle')).toHaveCount(0)
  })
})
