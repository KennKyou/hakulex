import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const selectAll = (page: Page) => page.keyboard.press('ControlOrMeta+A')
const toolbar = (page: Page) => page.locator('.hlx-floating-toolbar')
const button = (page: Page, label: string) => toolbar(page).getByRole('button', { name: label, exact: true })

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

/** The text of the editor's first paragraph. Readings aren't text there. */
function baseText(page: Page) {
  return editor(page).locator('p').first().evaluate((paragraph) => {
    const copy = paragraph.cloneNode(true) as HTMLElement
    return copy.textContent
  })
}

function color(page: Page, selector: string) {
  return page.locator(selector).first().evaluate(element => getComputedStyle(element).color)
}
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/** A paragraph holding `||雷||` between two pieces of text. */
async function withSpoiler(page: Page, before = '', after = '') {
  await paste(page, `${before}||雷雷|| 和 ^上^${after}`)
  await expect(editor(page).locator('.hlx-spoiler')).toHaveCount(1)
}

test.describe('typing', () => {
  test('converts each syntax, formats inside a spoiler included, then continues in plain text', async ({ page }) => {
    await type(page, '||雷 **粗**||外')
    const spoiler = editor(page).locator('.hlx-spoiler')
    await expect(spoiler).toHaveText('雷 粗')
    await expect(spoiler.locator('strong')).toHaveText('粗')
    expect(await baseText(page)).toBe('雷 粗外')

    await page.keyboard.press('Enter')
    await type(page, 'H~2~O 和 2^10^ 和 ++底++尾')
    const line = editor(page).locator('p').nth(1)
    await expect(line).toHaveText('H2O 和 210 和 底尾')
    await expect(line.locator('sub')).toHaveText('2')
    await expect(line.locator('sup')).toHaveText('10')
    await expect(line.locator('.hlx-underline')).toHaveText('底')
  })

  test('leaves ordinary text alone', async ({ page }) => {
    const text = 'a || b || c，if (a||b||c)，約 ~5 到 ~10，i++'
    await type(page, text)
    expect(await baseText(page)).toBe(text)
    await expect(editor(page).locator('.hlx-spoiler, sub, sup')).toHaveCount(0)
  })

  test('undoes the conversion back to the typed markers', async ({ page }) => {
    await type(page, '||雷||')
    await expect(editor(page).locator('.hlx-spoiler')).toHaveCount(1)
    await undo(page)
    await expect(editor(page).locator('.hlx-spoiler')).toHaveCount(0)
    expect(await baseText(page)).toBe('||雷||')
  })
})

test.describe('inside inline code', () => {
  for (const value of ['||a||', '^a^', '~a~', '++a++', '[^1]']) {
    test(`keeps ${value} as text`, async ({ page }) => {
      await type(page, '`xy`')
      const code = editor(page).locator('code')
      await expect(code).toHaveText('xy')
      const box = (await code.boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
      // The caret takes the code format once the browser has reported the new selection.
      await page.waitForTimeout(200)
      await type(page, value)
      await expect(code).toHaveText(`x${value}y`)
      await expect(editor(page).locator('.hlx-spoiler, sup, sub, .hlx-underline, .hlx-footnote-ref')).toHaveCount(0)
    })
  }
})

test.describe('caret', () => {
  test('types outside at both edges of a spoiler, and inside in the middle', async ({ page }) => {
    await withSpoiler(page)
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('ArrowLeft')
    await type(page, '前')
    await expect(editor(page).locator('.hlx-spoiler')).toHaveText('雷雷')

    // Selection changes reach the editor a moment after the key.
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(100)
    await type(page, '中')
    await expect(editor(page).locator('.hlx-spoiler')).toHaveText('雷中雷')

    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(100)
    await type(page, '後')
    await expect(editor(page).locator('.hlx-spoiler')).toHaveText('雷中雷')
    expect((await baseText(page))?.startsWith('前雷中雷後')).toBe(true)
  })

  test('moves through a ruby with the arrow keys, in both directions', async ({ page }) => {
    await paste(page, '甲<ruby>漢字<rt>hànzì</rt></ruby>乙 和 **粗**')
    await expect(editor(page).locator('ruby')).toHaveCount(1)
    await selectAll(page)
    await page.keyboard.press('ArrowLeft')

    const positions: (string | null)[] = []
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press('ArrowRight')
      positions.push(await page.evaluate(() => {
        const selection = getSelection()!
        const inReading = selection.anchorNode?.parentElement?.closest('rt') !== null
        return inReading
          ? 'rt'
          : `${selection.anchorNode?.textContent}:${selection.anchorOffset}`
      }))
    }
    // Never in the reading. Firefox stops once more where the ruby meets the next text.
    // At the ruby's end the caret moves out to the same spot in the next text, which may take a moment.
    expect(positions.slice(0, 2)).toEqual(['甲:1', '漢字:1'])
    expect(positions[2]).toMatch(/^(?:漢字:2|乙 和 :0)$/)
    expect(positions[3]).toMatch(/^乙 和 :[01]$/)
    await page.keyboard.press('ArrowLeft')

    await type(page, 'X')
    expect(await baseText(page)).toBe('甲漢字X乙 和 粗')
    await expect(editor(page).locator('ruby')).toHaveAttribute('data-reading', 'hànzì')
    await undo(page)

    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await type(page, 'Y')
    await expect(editor(page).locator('ruby')).toHaveAttribute('data-reading', 'hànzì')
    expect(await baseText(page)).toContain('Y')
    expect((await baseText(page))?.replace('Y', '')).toBe('甲漢字乙 和 粗')
  })

  test.describe('with the mouse', () => {
    test.beforeEach(async ({ page }) => {
      await paste(page, '甲甲甲 <ruby>漢字<rt>hànzì</rt></ruby> 乙乙乙 和 **粗**')
      await expect(editor(page).locator('ruby')).toHaveCount(1)
    })

    const selected = (page: Page) => page.evaluate(() => getSelection()!.toString())

    test('selects the whole paragraph with a triple click, keeping the toolbar', async ({ page }) => {
      await editor(page).locator('ruby').click({
        clickCount: 3,
        position: { x: 4, y: 10 },
      })
      await expect.poll(() => selected(page)).toContain('甲甲甲')
      expect(await selected(page)).toContain('乙乙乙')
      await expect(toolbar(page)).toBeVisible()
      await expect(button(page, 'Ruby 注音')).toBeEnabled()
      await button(page, '粗體').click()
      expect(await baseText(page)).toBe('甲甲甲 漢字 乙乙乙 和 粗')
      await expect(editor(page).locator('ruby')).toHaveAttribute('data-reading', 'hànzì')
    })

    test('selects across a ruby by dragging', async ({ page }) => {
      const box = (await editor(page).locator('p').first().boundingBox())!
      const ruby = (await editor(page).locator('ruby').boundingBox())!
      const y = ruby.y + ruby.height - 6
      await page.mouse.move(box.x + 4, y)
      await page.mouse.down()
      await page.mouse.move(ruby.x + ruby.width + 30, y, { steps: 8 })
      await page.mouse.up()
      await expect.poll(() => selected(page)).toContain('漢字')
      await expect(toolbar(page)).toBeVisible()
    })

    test('selects a word inside a ruby with a double click', async ({ page }) => {
      await editor(page).locator('ruby').dblclick({
        position: { x: 4, y: 10 },
      })
      await expect.poll(() => selected(page)).not.toBe('')
      await expect(toolbar(page)).toBeVisible()
      await expect(button(page, 'Ruby 注音')).toHaveAttribute('aria-pressed', 'true')
    })

    test('never takes typing in the reading', async ({ page }) => {
      const box = (await editor(page).locator('ruby').boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + 2)
      await type(page, 'X')
      await expect(editor(page).locator('ruby')).toHaveAttribute('data-reading', 'hànzì')
      expect(await baseText(page)).toContain('X')

      const json = await editor(page).evaluate(root => JSON.stringify((root as unknown as { __lexicalEditor: { getEditorState: () => { toJSON: () => unknown } } }).__lexicalEditor.getEditorState().toJSON()))
      expect(json).toContain('"reading":"hànzì"')
    })

    test('deletes through a ruby with backspace, removing it once empty', async ({ page }) => {
      await page.keyboard.press('ControlOrMeta+A')
      await page.keyboard.press('ArrowLeft')
      // To the end of the ruby, however many stops this browser makes on the way.
      for (let i = 0; i < 12 && await page.evaluate(() => `${getSelection()!.anchorNode?.textContent}:${getSelection()!.anchorOffset}`) !== '漢字:2'; i++)
        await page.keyboard.press('ArrowRight')
      await page.keyboard.press('Backspace')
      await page.keyboard.press('Backspace')
      await expect(editor(page).locator('ruby')).toHaveCount(0)
      expect(await baseText(page)).toBe('甲甲甲  乙乙乙 和 粗')
    })
  })

  test('keeps text typed right after a ruby outside it', async ({ page }) => {
    await paste(page, '<ruby>漢<rt>hàn</rt></ruby>')
    await expect(editor(page).locator('ruby')).toHaveCount(1)
    await toLineEnd(page)
    await type(page, '外')
    await expect(editor(page).locator('ruby')).toContainText('漢')
    await expect(editor(page).locator('ruby')).not.toContainText('外')
    expect(await baseText(page)).toBe('漢外')
  })
})

test.describe('toolbar', () => {
  test('switches between superscript and subscript, and undoes one step', async ({ page }) => {
    await type(page, 'text')
    await selectAll(page)
    await button(page, '上標').click()
    await expect(editor(page).locator('sup')).toHaveText('text')
    await button(page, '下標').click()
    await expect(editor(page).locator('sub')).toHaveText('text')
    await expect(editor(page).locator('sup')).toHaveCount(0)
    await expect(button(page, '下標')).toHaveAttribute('aria-pressed', 'true')
    await undo(page)
    await expect(editor(page).locator('sup')).toHaveText('text')
    await expect(editor(page).locator('sub')).toHaveCount(0)
  })

  test('wraps and unwraps a spoiler per paragraph', async ({ page }) => {
    await type(page, 'one')
    await page.keyboard.press('Enter')
    await type(page, 'two')
    await selectAll(page)
    await button(page, 'Spoiler').click()
    await expect(editor(page).locator('.hlx-spoiler')).toHaveText(['one', 'two'])
    await expect(editor(page).locator('p')).toHaveCount(2)
    await button(page, 'Spoiler').click()
    await expect(editor(page).locator('.hlx-spoiler')).toHaveCount(0)
    await expect(editor(page).locator('p')).toHaveText(['one', 'two'])
    await expect(button(page, 'Ruby 注音')).toBeDisabled()
  })

  test('edits a reading with focus moving to the input and back', async ({ page }) => {
    await type(page, '漢')
    await selectAll(page)
    await button(page, 'Ruby 注音').click()
    const input = toolbar(page).getByLabel('讀音', { exact: true })
    await expect(input).toBeFocused()
    await page.keyboard.type('hàn')
    await page.keyboard.press('Enter')

    const ruby = editor(page).locator('ruby')
    await expect(ruby).toHaveAttribute('data-reading', 'hàn')
    await expect(editor(page)).toBeFocused()
    await expect(button(page, 'Ruby 注音')).toHaveAttribute('aria-pressed', 'true')

    await button(page, 'Ruby 注音').click()
    await expect(input).toHaveValue('hàn')
    await page.keyboard.type('kan')
    await page.keyboard.press('Escape')
    await expect(ruby).toHaveAttribute('data-reading', 'hàn')
    await expect(editor(page)).toBeFocused()

    await button(page, 'Ruby 注音').click()
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Enter')
    await expect(ruby).toHaveCount(0)
    expect(await baseText(page)).toBe('漢')

    await undo(page)
    await expect(ruby).toHaveAttribute('data-reading', 'hàn')
    await undo(page)
    await expect(ruby).toHaveCount(0)
  })
})

test.describe('readers', () => {
  test('shows a spoiler while editing, tinted and without a tab stop', async ({ page }) => {
    await withSpoiler(page)
    expect(await color(page, '.hlx-content .hlx-spoiler')).not.toBe(TRANSPARENT)
    await expect(editor(page).locator('.hlx-spoiler')).not.toHaveAttribute('tabindex')
    const background = await editor(page).locator('.hlx-spoiler').evaluate(element => getComputedStyle(element).backgroundColor)
    expect(background).not.toBe(TRANSPARENT)
  })

  test('hides it read-only, and toggles by click and keyboard without changing the document', async ({ page }) => {
    await withSpoiler(page)
    await page.mouse.move(0, 0)
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    const spoiler = editor(page).locator('.hlx-spoiler')
    await expect(spoiler).toHaveAttribute('tabindex', '0')
    await expect.poll(() => color(page, '.hlx-content .hlx-spoiler')).toBe(TRANSPARENT)

    await spoiler.click()
    await expect(spoiler).toHaveAttribute('aria-expanded', 'true')
    await expect.poll(() => color(page, '.hlx-content .hlx-spoiler')).not.toBe(TRANSPARENT)
    await spoiler.click()
    await expect(spoiler).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(() => color(page, '.hlx-content .hlx-spoiler')).toBe(TRANSPARENT)

    await page.mouse.move(0, 0)
    await spoiler.focus()
    await page.keyboard.press('Enter')
    await expect(spoiler).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press(' ')
    await expect(spoiler).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(() => color(page, '.hlx-content .hlx-spoiler')).toBe(TRANSPARENT)

    await page.getByRole('checkbox', { name: '可編輯' }).check()
    await expect(spoiler).not.toHaveAttribute('tabindex')
    await expect.poll(() => color(page, '.hlx-content .hlx-spoiler')).not.toBe(TRANSPARENT)
  })

  test('hides it in the preview, shows it on hover and focus, and toggles', async ({ page }) => {
    await withSpoiler(page)
    await page.getByRole('tab', { name: '預覽' }).click()
    await page.mouse.move(0, 0)
    const selector = '.hlx-renderer .hlx-spoiler'
    const spoiler = page.locator(selector)
    await expect.poll(() => color(page, selector)).toBe(TRANSPARENT)

    await spoiler.hover()
    await expect.poll(() => color(page, selector)).not.toBe(TRANSPARENT)
    await page.mouse.move(0, 0)
    await expect.poll(() => color(page, selector)).toBe(TRANSPARENT)

    // Reach it with Tab, so the browser treats it as keyboard focus.
    await page.getByRole('tab', { name: '預覽' }).focus()
    for (let i = 0; i < 5 && !(await spoiler.evaluate(element => element === document.activeElement)); i++)
      await page.keyboard.press('Tab')
    await expect(spoiler).toBeFocused()
    await expect.poll(() => color(page, selector)).not.toBe(TRANSPARENT)

    await page.keyboard.press('Enter')
    await expect(spoiler).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Enter')
    await expect(spoiler).toHaveAttribute('aria-expanded', 'false')
    await expect.poll(() => color(page, selector)).toBe(TRANSPARENT)
  })

  test('renders ruby and scripts the same in the preview', async ({ page }) => {
    await paste(page, '<ruby>漢<rt>hàn</rt></ruby> ^上^ ~下~ ++底++ 和 **粗**')
    await expect(editor(page).locator('ruby')).toHaveCount(1)
    await page.getByRole('tab', { name: '預覽' }).click()
    const preview = page.locator('.hlx-renderer')
    await expect(preview.locator('ruby rt')).toHaveText('hàn')
    await expect(preview.locator('sup')).toHaveText('上')
    await expect(preview.locator('sub')).toHaveText('下')
    await expect(preview.locator('.hlx-underline')).toHaveText('底')
  })
})

test.describe('paste', () => {
  test('converts through the real clipboard, in one undo step', async ({ page }) => {
    await type(page, '前')
    await paste(page, '||雷|| 和 **粗**')
    await expect(editor(page).locator('.hlx-spoiler')).toHaveText('雷')
    await undo(page)
    await expect(editor(page).locator('.hlx-spoiler')).toHaveCount(0)
    expect(await baseText(page)).toBe('前')
  })

  test('leaves a lone marker as text', async ({ page }) => {
    await paste(page, '||x||')
    await expect(editor(page).locator('.hlx-spoiler')).toHaveCount(0)
    expect(await baseText(page)).toBe('||x||')
  })

  test('keeps nodes when copying from the editor and pasting back', async ({ page }) => {
    await paste(page, '||雷|| <ruby>漢<rt>hàn</rt></ruby> 和 **粗**')
    await expect(editor(page).locator('ruby')).toHaveCount(1)
    await selectAll(page)
    await page.keyboard.press('ControlOrMeta+C')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ControlOrMeta+V')
    await expect(editor(page).locator('.hlx-spoiler')).toHaveCount(2)
    await expect(editor(page).locator('ruby[data-reading="hàn"]')).toHaveCount(2)
  })
})
