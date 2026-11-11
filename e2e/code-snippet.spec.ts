import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const block = (page: Page) => editor(page).locator('.hlx-block-editor:has(.hlx-snippet)')
const dialog = (page: Page) => page.locator('.hlx-block-dialog')
const code = (page: Page) => dialog(page).locator('.cm-content')
const fileOption = (page: Page, name: string) => dialog(page).getByRole('option', { name, exact: true })
const fileNames = (page: Page) => dialog(page).locator('.hlx-snippet-file-list [role="option"]').allTextContents().then(names => names.map(name => name.trim()))

interface Json { type: string, files?: { filename: string, code: string }[] }

async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}
const files = async (page: Page) => (await stored(page)).find(node => node.type === 'code-snippet')?.files ?? []

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

async function insert(page: Page) {
  await editor(page).click()
  await page.keyboard.type('/snippet')
  await expect(page.locator('.hlx-slash-item').first()).toContainText('程式碼片段')
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
}

async function saved(page: Page, text = 'const a = 1') {
  await insert(page)
  await code(page).click()
  await page.keyboard.type(text)
  await dialog(page).getByRole('button', { name: '儲存' }).click()
  await expect(block(page)).toBeVisible()
}

test.describe('inserting', () => {
  test('from the slash menu, and saved with the keyboard', async ({ page }) => {
    await insert(page)
    await code(page).click()
    await page.keyboard.type('hello')
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(dialog(page)).toHaveCount(0)
    await expect(block(page).locator('code')).toContainText('hello')
    await expect.poll(() => files(page)).toEqual([
      { filename: 'untitled.ts', code: 'hello' },
    ])
    await undo(page)
    await expect(block(page)).toHaveCount(0)
  })

  test('from the toolbar', async ({ page }) => {
    await editor(page).click()
    await page.getByRole('button', { name: '插入' }).click()
    await page.getByRole('menuitem', { name: '程式碼片段' }).click()
    await expect(dialog(page)).toBeVisible()
  })

  test('cancelling leaves nothing, and typing goes on where it was', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('前 /snippet')
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toBeVisible()
    await dialog(page).getByRole('button', { name: '取消' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await page.keyboard.type('後')
    await expect(editor(page)).toHaveText('前 後')
  })
})

test.describe('the dialog', () => {
  test('Tab indents and stays in the code, and undo there is its own', async ({ page }) => {
    await insert(page)
    await code(page).click()
    await page.keyboard.type('a')
    await page.keyboard.press('Tab')
    await expect(code(page)).toBeFocused()
    await page.keyboard.type('b')
    await expect(code(page)).toContainText('b')
    await page.keyboard.press('ControlOrMeta+Z')
    await expect(dialog(page)).toBeVisible()
  })

  test('handles several files, keeping each one\'s code', async ({ page }) => {
    await saved(page, '甲')
    await block(page).click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await dialog(page).getByRole('button', { name: '新增檔案' }).click()
    await code(page).click()
    await page.keyboard.type('乙')
    // Renamed in the list: a double click, the name, Enter.
    await fileOption(page, 'untitled-2.ts').dblclick()
    await dialog(page).getByLabel('檔名').fill('b.py')
    await page.keyboard.press('Enter')
    await fileOption(page, 'untitled.ts').click()
    await expect(code(page)).toContainText('甲')
    await fileOption(page, 'b.py').click()
    await expect(code(page)).toContainText('乙')
    await expect(dialog(page).locator('.hlx-snippet-current-name')).toHaveText('b.py')
    await dialog(page).getByRole('button', { name: '儲存' }).click()
    await expect.poll(() => files(page)).toEqual([
      { filename: 'untitled.ts', code: '甲' },
      { filename: 'b.py', code: '乙' },
    ])
    await expect(block(page).getByRole('tab')).toHaveCount(2)
    await undo(page)
    await expect(block(page).getByRole('tab')).toHaveCount(0)
  })

  test('Esc asks before throwing changes away', async ({ page }) => {
    await saved(page)
    await block(page).click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await code(page).click()
    await page.keyboard.type('更多')
    await page.keyboard.press('Escape')
    await expect(dialog(page).getByText('有未儲存的修改')).toBeVisible()
    await dialog(page).getByRole('button', { name: '繼續編輯' }).click()
    await expect(code(page)).toContainText('更多')
    await page.keyboard.press('Escape')
    await dialog(page).getByRole('button', { name: '放棄' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect.poll(async () => (await files(page))[0].code).toBe('const a = 1')
  })

  test('a new block leaves the caret on the line after it', async ({ page }) => {
    await saved(page)
    await expect(editor(page)).toBeFocused()
    await page.keyboard.type('下一行')
    await expect(editor(page).locator('> p')).toHaveText('下一行')
  })

  test('focus comes back to the picked block after saving', async ({ page }) => {
    await saved(page)
    await block(page).click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await code(page).click()
    await page.keyboard.type('更多')
    await dialog(page).getByRole('button', { name: '儲存' }).click()
    await expect(editor(page)).toBeFocused()
    await expect(block(page)).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(block(page)).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Delete')
    await expect(block(page)).toHaveCount(0)
    await undo(page)
    await expect(block(page)).toHaveCount(1)
  })
})

test.describe('the sample', () => {
  test.beforeEach(async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入程式碼片段、圖庫和對話' }).click()
    await expect(block(page)).toBeVisible()
  })

  test('tabs work with the mouse and the arrow keys, without moving the caret', async ({ page }) => {
    await block(page).getByRole('tab', { name: 'greet.ts' }).click()
    await expect(block(page).getByRole('tabpanel').locator('visible=true')).toContainText('export function greet')
    await page.keyboard.press('ArrowRight')
    await expect(block(page).getByRole('tab', { name: 'style.css' })).toHaveAttribute('aria-selected', 'true')
    await expect(block(page)).not.toHaveAttribute('data-selected', 'true')
  })

  test('is highlighted, with the marked line', async ({ page }) => {
    await expect(block(page).locator('.hlx-code-body[data-highlighted]').first()).toBeVisible()
    await expect(block(page).locator('.hlx-code-line[data-highlight]')).toContainText('console.log')
  })

  test('is reached by the arrow keys and read only follows', async ({ page }) => {
    await editor(page).locator('> p').first().click()
    await page.keyboard.press('ArrowDown')
    await expect(block(page)).toHaveAttribute('data-selected', 'true')
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await expect(block(page).getByRole('button', { name: '編輯' })).toHaveCount(0)
    await expect(block(page).getByRole('tab')).toHaveCount(3)
  })

  test('shows each line under the one before, in the editor and the preview', async ({ page }) => {
    for (const where of ['editor', 'preview'] as const) {
      if (where === 'preview')
        await page.getByRole('tab', { name: '預覽' }).click()
      const snippet = where === 'editor'
        ? block(page)
        : page.locator('.editor-frame:visible .hlx-snippet')
      const body = snippet.locator('.hlx-code-body:visible')
      // Once highlighted: until then the lines are plain text, and are swapped for the colored ones.
      await expect(body).toHaveAttribute('data-highlighted', '')
      const lines = await body.locator('.hlx-code-line').evaluateAll(items => items.map((item) => {
        const box = item.getBoundingClientRect()
        return {
          left: Math.round(box.left),
          top: Math.round(box.top),
          width: Math.round(box.width),
        }
      }))
      expect(lines.length, where).toBe(3)
      expect(new Set(lines.map(line => line.left)).size, `${where}: every line starts at the same place`).toBe(1)
      expect(lines.every((line, i) => i === 0 || line.top > lines[i - 1].top), `${where}: each line below the last`).toBe(true)
      // Short lines leave nothing to scroll, and each line spans the box, edge to edge.
      expect(await body.evaluate(element => element.scrollWidth <= element.clientWidth), where).toBe(true)
      const box = await body.evaluate(element => ({
        left: Math.round(element.getBoundingClientRect().left),
        width: element.clientWidth,
      }))
      expect(lines[2].left, where).toBe(box.left)
      expect(Math.abs(lines[2].width - box.width), where).toBeLessThanOrEqual(1)
    }
  })

  test('shades a marked line across a long line\'s whole width when scrolled', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 })
    const body = block(page).locator('.hlx-code-body:visible')
    const [scroll, marked] = await body.evaluate(element => [element.scrollWidth, (element.querySelector('.hlx-code-line[data-highlight]') as HTMLElement).scrollWidth])
    expect(marked).toBeGreaterThanOrEqual(scroll - 32 - 1)
  })

  test('the dialog\'s file list and the file\'s head have no scrollbars of their own', async ({ page }) => {
    await block(page).hover()
    await block(page).click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    for (const part of ['.hlx-snippet-file-list', '.hlx-snippet-current-head']) {
      const element = dialog(page).locator(part)
      await expect(element).toBeVisible()
      expect(await element.evaluate(box => box.scrollHeight <= box.clientHeight && box.scrollWidth <= box.clientWidth), part).toBe(true)
    }
  })

  test('picks a language in the dialog with the mouse, from a list shown over it', async ({ page }) => {
    await block(page).hover()
    await block(page).click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    const field = dialog(page).locator('.hlx-snippet-current-head .hlx-lang-anchor')
    // One quiet field beside the name: neither its input nor its arrow has a box of its own.
    const parts = await field.evaluate(anchor => [
      anchor,
      anchor.querySelector('input')!,
      anchor.querySelector('button')!,
    ].map((element) => {
      const style = getComputedStyle(element)
      return {
        shadow: style.boxShadow !== 'none',
        border: style.borderTopWidth,
        height: Math.round(element.getBoundingClientRect().height),
      }
    }))
    expect(parts.map(part => part.shadow)).toEqual([false, false, false])
    expect(parts.map(part => part.border)).toEqual(['0px', '0px', '0px'])
    expect(parts[0].height).toBe(24)
    await field.getByRole('button', { name: '選擇程式語言' }).click()
    const option = page.getByRole('option', { name: 'Python', exact: true })
    await expect(option).toBeVisible()
    await option.scrollIntoViewIfNeeded()
    // On top: what the pointer would hit there is the option, not the dialog under it.
    expect(await option.evaluate((element) => {
      const box = element.getBoundingClientRect()
      return element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
    })).toBe(true)
    await option.click()
    await expect(field.locator('input')).toHaveValue('Python')
  })

  test('heads the code: icons on the tabs, and copying by an icon', async ({ page, context, browserName }) => {
    const tabs = block(page).getByRole('tab')
    await expect(tabs.locator('svg.hlx-code-file-icon')).toHaveCount(3)
    expect(await tabs.locator('svg.hlx-code-file-icon').evaluateAll(icons => icons.map(icon => icon.getAttribute('data-icon')))).toEqual(['typescript', 'typescript', 'css'])
    // Material Icon Theme's icons, in their own colors: 14px, with no outline of another style's.
    const typescript = tabs.first().locator('svg.hlx-code-file-icon')
    expect(await typescript.evaluate((icon) => {
      const style = getComputedStyle(icon)
      return [
        Math.round(icon.getBoundingClientRect().width),
        style.stroke,
        getComputedStyle(icon.querySelector('path')!).stroke,
      ]
    })).toEqual([14, 'none', 'none'])
    expect(await typescript.evaluate(icon => [
      ...icon.querySelectorAll('[fill]'),
    ].some(part => part.getAttribute('fill')!.startsWith('#')))).toBe(true)
    const chosen = await block(page).getByRole('tab', { name: 'main.ts' }).evaluate(tab => getComputedStyle(tab).boxShadow)
    expect(chosen).not.toBe('none')
    const copy = block(page).getByRole('button', { name: '複製程式碼' })
    await expect(copy).toHaveText('複製')
    if (browserName === 'chromium')
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await copy.click()
    await expect(block(page).getByRole('button', { name: '已複製' })).toHaveText('已複製')
  })

  test('shows its toolbar at its top right once picked, with no edit button on the code', async ({ page }) => {
    await block(page).locator('.hlx-code-body:visible').hover()
    await expect(block(page).getByRole('button', { name: '編輯' })).toHaveCount(0)
    await block(page).locator('.hlx-code-body:visible').click()
    const toolbar = page.locator('.hlx-block-toolbar')
    await expect(toolbar).toBeVisible()
    const [bar, box] = await Promise.all([
      toolbar.boundingBox(),
      block(page).boundingBox(),
    ])
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(box!.y)
    expect(Math.abs(bar!.x + bar!.width - (box!.x + box!.width))).toBeLessThan(2)
  })

  test('lists the files on the left, numbers the lines, and reorders by keyboard and by dragging', async ({ page }) => {
    // Once highlighted: until then the lines are plain text, and swapping them can lose a click.
    await expect(block(page).locator('.hlx-code-body:visible')).toHaveAttribute('data-highlighted', '')
    await block(page).hover()
    await block(page).click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await expect(dialog(page).locator('.cm-lineNumbers .cm-gutterElement', { hasText: /^3$/ })).toBeVisible()
    expect(await fileNames(page)).toEqual(['main.ts', 'greet.ts', 'style.css'])
    await fileOption(page, 'main.ts').focus()
    await page.keyboard.press('Alt+ArrowDown')
    expect(await fileNames(page)).toEqual(['greet.ts', 'main.ts', 'style.css'])
    await expect(fileOption(page, 'main.ts')).toBeFocused()
    // Drag style.css by its grip to the top.
    const grip = fileOption(page, 'style.css').locator('.hlx-snippet-file-grip')
    await fileOption(page, 'style.css').hover()
    const from = (await grip.boundingBox())!
    const to = (await fileOption(page, 'greet.ts').boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2, to.y + 4, { steps: 6 })
    await page.mouse.up()
    expect(await fileNames(page)).toEqual(['style.css', 'greet.ts', 'main.ts'])
    await dialog(page).getByRole('button', { name: '儲存' }).click()
    await expect(block(page).getByRole('tab')).toHaveText(['style.css', 'greet.ts', 'main.ts'])
  })

  test('marks a line with a bar at the box\'s edge, set from a line number in the dialog', async ({ page }) => {
    // Once highlighted: until then the lines are plain text, and are swapped for the colored ones.
    await expect(block(page).locator('.hlx-code-body:visible')).toHaveAttribute('data-highlighted', '')
    const markedLine = block(page).locator('.hlx-code-body:visible .hlx-code-line[data-highlight]')
    await expect(markedLine).toHaveCount(1)
    expect(await markedLine.evaluate(line => getComputedStyle(line).boxShadow)).toMatch(/inset/)
    await block(page).hover()
    await block(page).click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await expect(dialog(page).locator('.cm-line.hlx-snippet-mark')).toHaveCount(1)
    await expect(dialog(page).getByText('點行號標記強調行')).toBeVisible()
    await dialog(page).locator('.cm-lineNumbers .cm-gutterElement', { hasText: /^1$/ }).click()
    await expect(dialog(page).locator('.cm-line.hlx-snippet-mark')).toHaveCount(2)
    // Alt+H on line 3 takes its mark away again.
    await code(page).locator('.cm-line').nth(2).click()
    await page.keyboard.press('Alt+KeyH')
    await expect(dialog(page).locator('.cm-line.hlx-snippet-mark')).toHaveCount(1)
    await dialog(page).getByRole('button', { name: '儲存' }).click()
    await expect.poll(async () => (await stored(page)).find(node => node.type === 'code-snippet') as Record<string, any>).toMatchObject({
      files: [
        {
          filename: 'main.ts',
          highlightLines: [1],
        },
        { filename: 'greet.ts' },
        { filename: 'style.css' },
      ],
    })
    await expect(block(page).locator('.hlx-code-body:visible .hlx-code-line[data-highlight]')).toHaveText('import { greet } from \'./greet\'')
  })

  test('shows a language icon for the language a file is given', async ({ page }) => {
    await block(page).hover()
    await block(page).click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await dialog(page).getByRole('button', { name: '選擇程式語言' }).click()
    await page.getByRole('option', { name: 'Vue', exact: true }).click()
    await expect(dialog(page).locator('.hlx-snippet-current-head svg.hlx-code-file-icon')).toHaveAttribute('data-icon', 'vue')
    await expect(fileOption(page, 'main.ts').locator('svg.hlx-code-file-icon')).toHaveAttribute('data-icon', 'vue')
  })

  test('shows the same in the preview', async ({ page }) => {
    await page.getByRole('tab', { name: '預覽' }).click()
    const preview = page.locator('.editor-frame:visible .hlx-snippet')
    await expect(preview.getByRole('tab')).toHaveCount(3)
    await preview.getByRole('tab', { name: 'style.css' }).click()
    await expect(preview.getByRole('tabpanel').locator('visible=true')).toContainText('tomato')
  })
})

test('works inside a step', async ({ page }) => {
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入提及、嵌入和步驟' }).click()
  await page.locator('.hlx-step-content .hlx-content').first().click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('/snippet')
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
  await code(page).click()
  await page.keyboard.type('步驟內')
  await dialog(page).getByRole('button', { name: '儲存' }).click()
  await expect(page.locator('.hlx-step-content .hlx-snippet')).toContainText('步驟內')
  await page.keyboard.press('ControlOrMeta+Z')
  await expect(page.locator('.hlx-step-content .hlx-snippet')).toHaveCount(0)
})
