import type { Locator, Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'

/**
 * Every control that floats over the editor, driven only by a real mouse and keyboard.
 * No fill() or selectOption() here: they skip the press that moves focus, which is
 * where these controls have broken without any other test noticing.
 */

const editor = (page: Page) => page.locator('.hlx-content').first()

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !/404|ERR_/.test(message.text()))
      seen.push(message.text())
  })
  await page.goto('/editor')
  await editor(page).click()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

const type = (page: Page, text: string) => page.keyboard.type(text, { delay: 10 })
const selectAll = (page: Page) => page.keyboard.press('ControlOrMeta+A')

/** Picks from the slash menu with the mouse, which the other tests do with Enter. */
async function pickFromMenu(page: Page, query: string) {
  await type(page, `/${query}`)
  const option = page.locator('.hlx-slash-menu [role="option"]').first()
  await expect(option).toBeVisible()
  await option.click()
  await expect(page.locator('.hlx-slash-menu')).toHaveCount(0)
}

/** Clicks into a field and replaces its text by typing. */
async function typeInto(page: Page, field: Locator, text: string) {
  await field.click()
  await expect(field).toBeFocused()
  await page.keyboard.press('ControlOrMeta+A')
  await type(page, text)
}

test.describe('slash menu', () => {
  test('inserts with a click, leaving no trigger', async ({ page }) => {
    await pickFromMenu(page, 'divider')
    await expect(editor(page).locator('hr')).toHaveCount(1)
    await expect(editor(page)).not.toContainText('/divider')
  })
})

test.describe('floating toolbar', () => {
  const floating = (page: Page) => page.locator('.hlx-floating-toolbar')
  const button = (page: Page, name: string) => floating(page).getByRole('button', { name, exact: true })

  test.beforeEach(async ({ page }) => {
    await type(page, '文字')
    await selectAll(page)
    await expect(floating(page)).toBeVisible()
  })

  test('formats with clicks, staying open', async ({ page }) => {
    for (const name of ['粗體', '斜體', '底線', '刪除線', '上標']) {
      await button(page, name).click()
      await expect(button(page, name)).toHaveAttribute('aria-pressed', 'true')
    }
    await button(page, '清除格式').click()
    await expect(button(page, '粗體')).toHaveAttribute('aria-pressed', 'false')
  })

  test('takes a link through its input and apply button', async ({ page }) => {
    await button(page, '連結').click()
    await typeInto(page, floating(page).getByLabel('網址', { exact: true }), 'example.com')
    await button(page, '套用連結').click()
    await expect(editor(page).locator('a')).toHaveAttribute('href', 'https://example.com')
    await expect(editor(page)).toBeFocused()
  })

  test('takes a reading through its input and apply button', async ({ page }) => {
    await button(page, 'Ruby 注音').click()
    await typeInto(page, floating(page).getByLabel('讀音', { exact: true }), 'wénzì')
    await button(page, '套用讀音').click()
    await expect(editor(page).locator('ruby')).toHaveAttribute('data-reading', 'wénzì')

    await button(page, 'Ruby 注音').click()
    await button(page, '移除讀音').click()
    await expect(editor(page).locator('ruby')).toHaveCount(0)
    await expect(editor(page).locator('p')).toHaveText('文字')
  })

  test('toggles a spoiler', async ({ page }) => {
    await button(page, 'Spoiler').click()
    await expect(editor(page).locator('.hlx-spoiler')).toHaveText('文字')
    await button(page, 'Spoiler').click()
    await expect(editor(page).locator('.hlx-spoiler')).toHaveCount(0)
  })
})

test.describe('fixed toolbar', () => {
  test('takes a link through its input and apply button', async ({ page }) => {
    await type(page, '文字')
    await selectAll(page)
    const bar = page.locator('.hlx-fixed-toolbar')
    await bar.getByRole('button', { name: '連結', exact: true }).click()
    await typeInto(page, bar.getByLabel('網址', { exact: true }), 'example.com')
    await bar.getByRole('button', { name: '套用連結', exact: true }).click()
    await expect(editor(page).locator('a')).toHaveAttribute('href', 'https://example.com')
  })
})

test.describe('callouts', () => {
  test('removes a block with its button, keeping the text', async ({ page }) => {
    await pickFromMenu(page, 'banner')
    await type(page, '內容')
    await page.locator('.hlx-callout-bar').getByRole('button', { name: '移除區塊' }).click()
    await expect(editor(page).locator('.hlx-banner')).toHaveCount(0)
    await expect(editor(page)).toContainText('內容')
  })

  test('saves a summary when clicking back into the text', async ({ page }) => {
    await pickFromMenu(page, 'details')
    await type(page, '內容')
    await typeInto(page, page.locator('.hlx-callout-bar input'), '新摘要')
    await editor(page).locator('.hlx-details-body p').click()
    await expect(editor(page).locator('summary')).toHaveText('新摘要')
    await type(page, '續')
    await expect(editor(page).locator('.hlx-details-body')).toContainText('續')
  })
})

test.describe('math', () => {
  test('applies with a click, and cancels with a click', async ({ page }) => {
    await pickFromMenu(page, 'math')
    const input = page.getByLabel('LaTeX 數學式')
    await expect(input).toBeVisible()
    await typeInto(page, input, 'a+b')
    await page.locator('.hlx-math-popover').getByRole('button', { name: '套用' }).click()
    await expect(page.locator('.hlx-math-popover')).toHaveCount(0)
    await expect(editor(page).locator('.katex')).toBeVisible()

    // A double click opens it again; a click only picks it.
    await editor(page).locator('.hlx-math-editor').dblclick()
    await typeInto(page, input, 'zzz')
    await page.locator('.hlx-math-popover').getByRole('button', { name: '取消' }).click()
    await expect(page.locator('.hlx-math-popover')).toHaveCount(0)
    await expect(editor(page).locator('.katex')).not.toContainText('zzz')
  })

  test('applies when clicking outside', async ({ page }) => {
    await pickFromMenu(page, 'math')
    await typeInto(page, page.getByLabel('LaTeX 數學式'), 'c+d')
    await page.locator('h1').click()
    await expect(page.locator('.hlx-math-popover')).toHaveCount(0)
    await expect(editor(page).locator('.katex')).toContainText('c')
  })
})

test.describe('mermaid', () => {
  test('takes source through its textarea and buttons', async ({ page }) => {
    await pickFromMenu(page, 'mermaid')
    const source = page.getByLabel('Mermaid 原始碼')
    await expect(source).toBeVisible()
    await typeInto(page, source, 'flowchart LR\n  A --> B')
    await page.locator('[role="dialog"]').locator('button[data-primary]').click()
    await expect(source).toHaveCount(0)
    await expect(editor(page).locator('.hlx-mermaid-block')).toHaveCount(1)
  })
})

test.describe('code block', () => {
  test('picks a language with the mouse, and takes typing', async ({ page }) => {
    await pickFromMenu(page, 'code')
    const language = editor(page).locator('.hlx-lang-input')
    await language.click()
    await type(page, 'pyth')
    await page.getByRole('option', { name: /python/i }).first().click()
    await expect(language).toHaveValue(/python/i)

    await editor(page).locator('.cm-content').click()
    await type(page, 'x = 1')
    await expect(editor(page).locator('.cm-content')).toContainText('x = 1')
  })
})

test.describe('dialogs', () => {
  const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

  test('image: adds an address by clicking, inserts it, then fills its fields in the panel', async ({ page }) => {
    await pickFromMenu(page, 'image')
    const dialog = page.locator('.hlx-image-dialog')
    await typeInto(page, dialog.locator('input[name="src"]'), PIXEL)
    await dialog.getByRole('button', { name: '加入' }).click()
    await dialog.locator('button[data-primary]').click()
    await expect(dialog).toHaveCount(0)

    await editor(page).locator('img.hlx-image').click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    const panel = page.locator('.hlx-block-panel[aria-label="圖片"]')
    await typeInto(page, panel.locator('input[name="alt"]'), '替代')
    await typeInto(page, panel.locator('input[name="caption"]'), '圖說')
    await expect(editor(page).locator('figcaption')).toHaveText('圖說')
    await typeInto(page, panel.locator('input[name="caption"]'), '新圖說')
    await expect(editor(page).locator('figcaption')).toHaveText('新圖說')
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await expect(panel).toHaveCount(0)
    await expect(editor(page).locator('figcaption')).toHaveText('新圖說')
  })

  test('file: picks through the real file chooser', async ({ page }) => {
    await pickFromMenu(page, 'file')
    const dialog = page.locator('.hlx-media-dialog')
    const chooser = page.waitForEvent('filechooser')
    await dialog.locator('input[type="file"]').click()
    await (await chooser).setFiles({
      name: '報告.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('內容'),
    })
    await typeInto(page, dialog.locator('input[name="name"]'), '年報.pdf')
    await dialog.getByRole('button', { name: '插入' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(editor(page).locator('.hlx-file-name')).toHaveText('年報.pdf')
  })

  test('video: fills its fields by clicking, and cancels with its button', async ({ page }) => {
    await pickFromMenu(page, 'video')
    const dialog = page.locator('.hlx-media-dialog')
    await typeInto(page, dialog.locator('input[name="src"]'), '/a.webm')
    await typeInto(page, dialog.locator('input[name="poster"]'), PIXEL)
    await dialog.getByRole('button', { name: '取消' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(editor(page).locator('video')).toHaveCount(0)
    await expect(editor(page)).toBeFocused()
  })
})

test.describe('footnotes', () => {
  test('writes when clicking from the input back into the text, and removes with its button', async ({ page }) => {
    await type(page, '前 ')
    await pickFromMenu(page, 'footnote')
    const input = editor(page).locator('.hlx-footnote-input')
    await expect(input).toBeFocused()
    await type(page, '內容')
    await editor(page).locator('p').first().click()
    await expect(editor(page).locator('.hlx-footnote-ref a')).toHaveAttribute('title', '內容')

    await input.hover()
    await editor(page).getByRole('button', { name: '刪除註腳 1' }).click()
    await expect(editor(page).locator('.hlx-footnote-ref')).toHaveCount(0)
  })
})

test.describe('where a dialog inserts', () => {
  async function linesAround(page: Page) {
    await type(page, '上')
    await page.keyboard.press('Enter')
    await type(page, '下')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    // Selection changes reach the editor a moment after the key.
    await page.waitForTimeout(100)
  }

  const order = (page: Page) => editor(page).evaluate(root => [...root.children]
    .filter(child => !child.hasAttribute('data-lexical-decorator-boundary') && child.tagName !== 'BR')
    .map(child => child.tagName === 'P'
      ? child.textContent
      : child.className.split(' ')[0])
    .filter(Boolean))

  test('file: at the caret, not at the start of the document', async ({ page }) => {
    await linesAround(page)
    await pickFromMenu(page, 'file')
    const dialog = page.locator('.hlx-media-dialog')
    await typeInto(page, dialog.locator('input[name="src"]'), '/a.pdf')
    await dialog.getByRole('button', { name: '插入' }).click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => order(page)).toEqual(['上', 'hlx-file-block', '下'])
  })

  test('file: also when submitted with Enter', async ({ page }) => {
    await linesAround(page)
    await pickFromMenu(page, 'file')
    const dialog = page.locator('.hlx-media-dialog')
    await type(page, '/a.pdf')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => order(page)).toEqual(['上', 'hlx-file-block', '下'])
    await type(page, '續')
    await expect.poll(() => order(page)).toEqual(['上', 'hlx-file-block', '續下'])
  })

  test('file: on the last line, which has nothing after it', async ({ page }) => {
    await type(page, '上')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await type(page, '/file')
    await page.keyboard.press('Enter')
    const dialog = page.locator('.hlx-media-dialog')
    await type(page, '/a.pdf')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => order(page)).toEqual(['上', 'hlx-file-block'])
  })

  test('image: also when submitted with Enter', async ({ page }) => {
    await type(page, '上')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)
    await type(page, '/image')
    await page.keyboard.press('Enter')
    const dialog = page.locator('.hlx-image-dialog')
    // The drop zone has the focus first; Tab goes on to the address.
    await expect(dialog.locator('.hlx-image-dropzone')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(dialog.locator('input[name="src"]')).toBeFocused()
    await type(page, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
    // Enter adds it to the list, and the next Enter inserts.
    await page.keyboard.press('Enter')
    await expect(dialog.locator('button[data-primary]')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => order(page)).toEqual(['上', 'hlx-image-block'])
  })

  test('image: at the caret, not at the start of the document', async ({ page }) => {
    await linesAround(page)
    await pickFromMenu(page, 'image')
    const dialog = page.locator('.hlx-image-dialog')
    await typeInto(page, dialog.locator('input[name="src"]'), 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
    await dialog.getByRole('button', { name: '加入' }).click()
    await dialog.locator('button[data-primary]').click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => order(page)).toEqual(['上', 'hlx-image-block', '下'])
  })

  test('mermaid: at the caret, not at the start of the document', async ({ page }) => {
    await linesAround(page)
    await pickFromMenu(page, 'mermaid')
    await typeInto(page, page.getByLabel('Mermaid 原始碼'), 'flowchart LR\n  A --> B')
    await page.locator('[role="dialog"]').locator('button[data-primary]').click()
    await expect.poll(() => order(page)).toEqual(['上', 'hlx-mermaid-block', '下'])
  })

  test('insert menu: table and divider at the caret', async ({ page }) => {
    await linesAround(page)
    const bar = page.locator('.hlx-fixed-toolbar')
    await bar.getByRole('button', { name: '插入', exact: true }).click()
    await page.locator('.hlx-fixed-toolbar-menu').getByRole('menuitem', { name: '分隔線' }).click()
    await expect.poll(() => order(page)).toEqual(['上', 'hlx-hr-block', '下'])
  })
})

test.describe('typing at the edges of inline wrappers', () => {
  // Latin goes through key events. Chinese is sent as composition, as an input method would.
  for (const [name, text] of [
    ['keys', 'Z'],
    ['composition', '後'],
  ]) {
    for (const [kind, source, inside] of [
      ['ruby', '甲<ruby>漢字<rt>hàn</rt></ruby>乙 和 **粗**', 'ruby'],
      ['spoiler', '甲 ||漢字|| 乙 和 **粗**', '.hlx-spoiler'],
    ]) {
      test(`${kind}, by ${name}: the end stays outside, once`, async ({ page, browserName }) => {
        // Known: Firefox doubles the text here. Playwright's composition arrives all at once,
        // unlike a real input method, so this waits for a check with a real one.
        test.fixme(browserName === 'firefox' && name === 'composition', 'doubled in Firefox; not confirmed with a real input method')
        await page.evaluate(value => navigator.clipboard?.writeText(value), source)
        await page.keyboard.press('ControlOrMeta+V')
        const wrapper = editor(page).locator(inside)
        await expect(wrapper).toHaveCount(1)
        await selectAll(page)
        await page.keyboard.press('ArrowLeft')
        await page.waitForTimeout(50)
        // Into the wrapper, then along it to its end.
        while (await page.evaluate(() => getSelection()!.anchorNode?.textContent) !== '漢字')
          await page.keyboard.press('ArrowRight')
        while (await page.evaluate(() => getSelection()!.anchorOffset) < 2 && await page.evaluate(() => getSelection()!.anchorNode?.textContent) === '漢字')
          await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(150)
        await type(page, text)
        await page.waitForTimeout(100)
        await expect(wrapper.locator('span').first()).toHaveText('漢字')
        const all = await editor(page).locator('p').first().textContent()
        expect(all?.split(text)).toHaveLength(2)
      })
    }

    test(`ruby ending a line, by ${name}: stays outside, once`, async ({ page }) => {
      await page.evaluate(() => navigator.clipboard?.writeText('<ruby>漢<rt>hàn</rt></ruby>'))
      await page.keyboard.press('ControlOrMeta+V')
      await expect(editor(page).locator('ruby')).toHaveCount(1)
      await toLineEnd(page)
      await page.waitForTimeout(150)
      await type(page, text)
      await page.waitForTimeout(100)
      await expect(editor(page).locator('ruby')).not.toContainText(text)
      await expect(editor(page).locator('p')).toHaveText(`漢${text}`)
    })
  }

  test('backspace from just after a spoiler reaches into it', async ({ page }) => {
    await page.evaluate(() => navigator.clipboard?.writeText('甲 ||漢字|| 乙 和 **粗**'))
    await page.keyboard.press('ControlOrMeta+V')
    const spoiler = editor(page).locator('.hlx-spoiler')
    await expect(spoiler).toHaveCount(1)
    await spoiler.click({
      position: { x: 2, y: 8 },
    })
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(150)
    await page.keyboard.press('Backspace')
    await expect(spoiler).toHaveText('漢')
  })
})

test.describe('deleting in a ruby', () => {
  async function ruby(page: Page) {
    await page.evaluate(() => navigator.clipboard?.writeText('甲<ruby>漢字<rt>hàn</rt></ruby>乙 和 **粗**'))
    await page.keyboard.press('ControlOrMeta+V')
    await expect(editor(page).locator('ruby')).toHaveCount(1)
    await selectAll(page)
    await page.keyboard.press('ArrowLeft')
  }

  const paragraphText = (page: Page) => editor(page).locator('p').first().textContent()

  test('backspace takes characters one by one, then the ruby itself', async ({ page }) => {
    await ruby(page)
    for (let i = 0; i < 3; i++)
      await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(100)
    await page.keyboard.press('Backspace')
    await expect.poll(() => paragraphText(page)).toBe('甲漢乙 和 粗')
    await page.keyboard.press('Backspace')
    await expect(editor(page).locator('ruby')).toHaveCount(0)
    await expect.poll(() => paragraphText(page)).toBe('甲乙 和 粗')
    await type(page, 'X')
    await expect.poll(() => paragraphText(page)).toBe('甲X乙 和 粗')
  })

  test('forward delete works too', async ({ page }) => {
    await ruby(page)
    for (let i = 0; i < 2; i++)
      await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(100)
    await page.keyboard.press('Delete')
    await expect.poll(() => paragraphText(page)).toBe('甲漢乙 和 粗')
    // Now at the end of what's left.
    await page.keyboard.press('Backspace')
    await expect(editor(page).locator('ruby')).toHaveCount(0)
    await expect.poll(() => paragraphText(page)).toBe('甲乙 和 粗')
  })
})

test.describe('blocks', () => {
  test('picks a video, by a click or the button that shows on hover, and edits it from its toolbar', async ({ page, browserName }) => {
    await pickFromMenu(page, 'video')
    const dialog = page.locator('.hlx-media-dialog')
    await typeInto(page, dialog.locator('input[name="src"]'), '/a.webm')
    await dialog.getByRole('button', { name: '插入' }).click()
    await expect(dialog).toHaveCount(0)

    const block = editor(page).locator('.hlx-media-editor')
    const box = (await block.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + 10)
    // Firefox's player keeps every mouse event, so there it is picked by the button on hover.
    if (browserName !== 'firefox') {
      await page.mouse.down()
      await page.mouse.up()
    }
    else {
      await block.getByRole('button', { name: '選取' }).click()
    }
    await expect(block).toHaveAttribute('data-selected')
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await expect(page.locator('.hlx-block-panel[aria-label="影片"] input[name="src"]')).toHaveValue('/a.webm')
  })

  test('opens and closes details by its summary', async ({ page }) => {
    await pickFromMenu(page, 'details')
    await type(page, '內容')
    const details = editor(page).locator('details')
    await expect(details).toHaveAttribute('open')
    await details.locator('summary').click()
    await expect(details).not.toHaveAttribute('open')
    await details.locator('summary').click()
    await expect(details).toHaveAttribute('open')
  })

  test('ticks a check item', async ({ page }) => {
    await type(page, '[ ] 待辦')
    const item = editor(page).locator('li')
    const box = (await item.boundingBox())!
    await page.mouse.click(box.x + 6, box.y + box.height / 2)
    await expect(item).toHaveAttribute('aria-checked', 'true')
  })
})

test.describe('fields that save when leaving', () => {
  async function typeOnFirstLine(page: Page) {
    await page.locator('.hlx-content p', { hasText: '上' }).click()
    await toLineEnd(page)
    await page.keyboard.type('x')
    await expect(page.locator('.hlx-content p', { hasText: '上' }).first()).toHaveText('上x')
  }

  test('a details summary leaves the caret where the click put it', async ({ page }) => {
    await page.locator('.hlx-content').click()
    await page.keyboard.type('上')
    await page.keyboard.press('Enter')
    await page.keyboard.type('/details')
    await page.keyboard.press('Enter')
    await page.keyboard.type('內')
    await page.getByRole('textbox', { name: '摘要' }).click()
    await page.keyboard.type('abc')
    await typeOnFirstLine(page)
    await expect(page.locator('.hlx-content summary')).toContainText('abc')
  })

  test('a footnote leaves the caret where the click put it', async ({ page }) => {
    await page.locator('.hlx-content').click()
    await page.keyboard.type('上')
    await page.keyboard.press('Enter')
    await page.keyboard.type('下 /footnote')
    await page.keyboard.press('Enter')
    await page.keyboard.type('abc')
    await typeOnFirstLine(page)
    await expect(page.locator('.hlx-footnote-input')).toHaveValue('abc')
  })
})
