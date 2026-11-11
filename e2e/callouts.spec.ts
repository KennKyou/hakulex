import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { toLineStart } from './keys'

const editor = (page: Page) => page.locator('.hlx-content')
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')

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

async function insert(page: Page, query: string) {
  await page.keyboard.type(`/${query}`, { delay: 10 })
  await expect(page.locator('.hlx-slash-menu [role="option"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
}

/** Through the real system clipboard and keyboard shortcut. */
async function paste(page: Page, text: string) {
  await page.evaluate(value => navigator.clipboard.writeText(value), text)
  await page.keyboard.press('ControlOrMeta+V')
}

// Top-level blocks and their text, leaving out Lexical's invisible caret anchors.
function blockOrder(page: Page) {
  return editor(page).evaluate(root => [...root.children]
    .filter(child => !child.hasAttribute('data-lexical-decorator-boundary'))
    .map((child) => {
      const body = child.querySelector(':scope > .hlx-callout-body, :scope > .hlx-details-body')
      return body
        ? `[${body.textContent}]`
        : child.textContent ?? ''
    }))
}

/** The stored document, to tell a view change from a document change. */
function documentJson(page: Page) {
  return editor(page).evaluate(root =>
    JSON.stringify((root as unknown as { __lexicalEditor: { getEditorState: () => { toJSON: () => unknown } } }).__lexicalEditor.getEditorState().toJSON()))
}

test.describe('inserting', () => {
  for (const [query, selector] of [
    ['alert', '.hlx-alert[data-type="note"]'],
    ['banner', '.hlx-banner[data-type="note"]'],
    ['details', 'details.hlx-details[open]'],
  ]) {
    test(`inserts ${query} from the slash menu with the caret inside`, async ({ page }) => {
      await insert(page, query)
      const block = editor(page).locator(selector)
      await expect(block).toHaveCount(1)
      await expect(editor(page)).not.toContainText(`/${query}`)

      await page.keyboard.type('inside')
      await expect(block).toContainText('inside')
      await expect.poll(() => blockOrder(page)).toEqual(['[inside]'])

      await undo(page)
      await undo(page)
      await expect(block).toHaveCount(0)
    })
  }
})

test.describe('toolbar', () => {
  test('stays when pressed with a real mouse, and takes a new type', async ({ page }) => {
    await insert(page, 'banner')
    await page.keyboard.type('內容')
    const select = page.locator('.hlx-callout-bar select')
    await select.click()
    await expect(select).toBeFocused()
    await select.selectOption('warning')
    await expect(editor(page).locator('.hlx-banner')).toHaveAttribute('data-type', 'warning')
    await expect(editor(page)).toBeFocused()
  })

  test('takes a summary typed after clicking the input', async ({ page }) => {
    await insert(page, 'details')
    await page.keyboard.type('內容')
    const input = page.locator('.hlx-callout-bar input')
    await input.click()
    await expect(input).toBeFocused()
    await input.fill('新摘要')
    await page.keyboard.press('Enter')
    await expect(editor(page).locator('summary')).toHaveText('新摘要')
  })

  test('still goes away when focus really leaves the editor', async ({ page }) => {
    await insert(page, 'banner')
    await expect(page.locator('.hlx-callout-bar')).toBeVisible()
    await page.locator('h1').click()
    await expect(page.locator('.hlx-callout-bar')).toHaveCount(0)
  })

  test('switches the type, and returns focus to the same place', async ({ page }) => {
    await insert(page, 'alert')
    await page.keyboard.type('one')
    await page.locator('.hlx-callout-bar').getByLabel('區塊類型').selectOption('warning')

    const alert = editor(page).locator('.hlx-alert')
    await expect(alert).toHaveAttribute('data-type', 'warning')
    await expect(alert.locator('.hlx-callout-label')).toHaveText('警告')
    await expect(editor(page)).toBeFocused()
    await page.keyboard.type(' two')
    await expect.poll(() => blockOrder(page)).toEqual(['[one two]'])
  })

  test('undoes a type change in one step', async ({ page }) => {
    await insert(page, 'banner')
    await page.locator('.hlx-callout-bar').getByLabel('區塊類型').selectOption('caution')
    const banner = editor(page).locator('.hlx-banner')
    await expect(banner).toHaveAttribute('data-type', 'caution')
    await undo(page)
    await expect(banner).toHaveAttribute('data-type', 'note')
  })

  test('edits the details summary with the keyboard', async ({ page }) => {
    await insert(page, 'details')
    const input = page.getByLabel('摘要')
    await input.fill('新的摘要')
    await page.keyboard.press('Enter')
    await expect(editor(page).locator('summary')).toHaveText('新的摘要')
    await expect(editor(page)).toBeFocused()

    await page.keyboard.type('body')
    await expect.poll(() => blockOrder(page)).toEqual(['[body]'])
  })

  test('removes the block and keeps its content', async ({ page }) => {
    await insert(page, 'banner')
    await page.keyboard.type('keep')
    await page.getByRole('button', { name: '移除區塊' }).click()
    await expect(editor(page).locator('.hlx-banner')).toHaveCount(0)
    await expect.poll(() => blockOrder(page)).toEqual(['keep'])
    await expect(page.locator('.hlx-callout-bar')).toHaveCount(0)
  })

  test('goes away on another tab, and comes back in the block', async ({ page }) => {
    await insert(page, 'banner')
    await expect(page.locator('.hlx-callout-bar')).toBeVisible()
    await page.getByRole('tab', { name: '預覽' }).click()
    await expect(page.locator('.hlx-callout-bar')).toHaveCount(0)

    await page.getByRole('tab', { name: '編輯' }).click()
    await editor(page).locator('.hlx-banner p').click()
    await expect(page.locator('.hlx-callout-bar')).toBeVisible()
  })

  test('stays aligned with the block while scrolling', async ({ page }) => {
    await paste(page, Array.from({ length: 30 }, (_, i) => `para ${i}`).join('\n\n'))
    await page.keyboard.press('Enter')
    await insert(page, 'banner')
    const gap = async () => {
      const bar = (await page.locator('.hlx-callout-bar').boundingBox())!
      const block = (await editor(page).locator('.hlx-banner').boundingBox())!
      return Math.round(block.y - (bar.y + bar.height))
    }
    const before = await gap()
    await page.evaluate(() => window.scrollBy(0, -120))
    await expect.poll(gap).toBe(before)
  })
})

test.describe('details', () => {
  test('collapses from the summary, moves the caret out, and reopens', async ({ page }) => {
    await insert(page, 'details')
    await page.keyboard.type('hidden')
    const details = editor(page).locator('details')
    await details.locator('summary').click()

    await expect(details).not.toHaveAttribute('open')
    await expect(details.locator('.hlx-details-body')).toBeHidden()
    await page.keyboard.type('outside')
    await expect.poll(() => blockOrder(page)).toEqual(['[hidden]', 'outside'])

    await details.locator('summary').click()
    await expect(details).toHaveAttribute('open')
    await expect(details.locator('.hlx-details-body')).toBeVisible()
  })

  test('undoes a collapse', async ({ page }) => {
    await insert(page, 'details')
    const details = editor(page).locator('details')
    await details.locator('summary').click()
    await expect(details).not.toHaveAttribute('open')
    await undo(page)
    await expect(details).toHaveAttribute('open')
  })
})

test.describe('keyboard', () => {
  test('leaves with Enter on the last empty paragraph', async ({ page }) => {
    await insert(page, 'alert')
    await page.keyboard.type('one')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('outside')
    await expect.poll(() => blockOrder(page)).toEqual(['[one]', 'outside'])
    await expect(page.locator('.hlx-callout-bar')).toHaveCount(0)
  })

  test('turns an empty block back into a paragraph with Backspace', async ({ page }) => {
    await insert(page, 'banner')
    await page.keyboard.press('Backspace')
    await expect(editor(page).locator('.hlx-banner')).toHaveCount(0)
    await page.keyboard.type('plain')
    await expect.poll(() => blockOrder(page)).toEqual(['plain'])
  })

  test('does not leave with Backspace at the start of text', async ({ page }) => {
    await page.keyboard.type('before')
    await page.keyboard.press('Enter')
    await insert(page, 'banner')
    await page.keyboard.type('inside')
    await toLineStart(page)
    await page.keyboard.press('Backspace')
    await expect.poll(() => blockOrder(page)).toEqual(['before', '[inside]'])
  })

  test('adds a paragraph with the arrow keys at the edges of the document', async ({ page }) => {
    await insert(page, 'banner')
    await page.keyboard.type('inside')

    await page.keyboard.press('ArrowDown')
    await page.keyboard.type('below')
    await expect.poll(() => blockOrder(page)).toEqual(['[inside]', 'below'])

    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.type('above')
    await expect.poll(() => blockOrder(page)).toEqual(['above', '[inside]', 'below'])
  })

  test('moves through a block with the arrow keys, past its label', async ({ page }) => {
    await page.keyboard.type('above')
    await page.keyboard.press('Enter')
    await insert(page, 'alert')
    await page.keyboard.type('middle')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.type('below')
    await expect.poll(() => blockOrder(page)).toEqual(['above', '[middle]', 'below'])

    await page.keyboard.press('ArrowUp')
    await expect(page.locator('.hlx-callout-bar')).toBeVisible()
    await page.keyboard.type('!')
    await expect.poll(() => blockOrder(page).then(blocks => blocks[1])).toContain('!')

    await page.keyboard.press('ArrowUp')
    await expect(page.locator('.hlx-callout-bar')).toHaveCount(0)
    await page.keyboard.type('?')
    await expect.poll(() => blockOrder(page).then(blocks => blocks[0])).toContain('?')
    await expect.poll(() => blockOrder(page).then(blocks => blocks.length)).toBe(3)
  })

  test('does not put the caret in the label when clicking it', async ({ page }) => {
    await insert(page, 'alert')
    await page.keyboard.type('body')
    await editor(page).locator('.hlx-callout-label').click()
    await page.keyboard.type('!')
    await expect(editor(page).locator('.hlx-callout-label')).toHaveText('備註')
  })
})

test.describe('clicking below', () => {
  test('adds a paragraph after a trailing block, but not from inside it', async ({ page }) => {
    await insert(page, 'banner')
    await page.keyboard.type('inside')

    await editor(page).locator('.hlx-banner p').click()
    await expect.poll(() => blockOrder(page)).toEqual(['[inside]'])

    const box = (await editor(page).boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 4)
    await page.keyboard.type('below')
    await expect.poll(() => blockOrder(page)).toEqual(['[inside]', 'below'])
  })
})

test.describe('pasting', () => {
  test('pastes a GitHub alert in one undo step', async ({ page }) => {
    await page.keyboard.type('before')
    await page.keyboard.press('Enter')
    await paste(page, '> [!WARNING]\n> **careful** here\n>\n> - one\n> - two')

    const alert = editor(page).locator('.hlx-alert[data-type="warning"]')
    await expect(alert).toHaveCount(1)
    await expect(alert.locator('.hlx-bold')).toHaveText('careful')
    await expect(alert.locator('li')).toHaveCount(2)
    await expect(editor(page)).not.toContainText('[!WARNING]')

    await undo(page)
    await expect(alert).toHaveCount(0)
    await expect(editor(page)).toContainText('before')
  })

  test('keeps the caret visible after pasting a collapsed details', async ({ page }) => {
    await paste(page, '::: details{summary="更多"}\nhidden\n:::')
    await expect(editor(page).locator('details')).not.toHaveAttribute('open')
    await expect(page.locator('.hlx-callout-bar')).toHaveCount(0)
    await page.keyboard.type('outside')
    await expect.poll(() => blockOrder(page)).toEqual(['[hidden]', 'outside'])
  })

  test('pastes nested containers', async ({ page }) => {
    await paste(page, '::: danger\nouter\n\n::: details{summary="更多"}\ninner\n:::\n:::')
    const banner = editor(page).locator('.hlx-banner[data-type="caution"]')
    await expect(banner).toHaveCount(1)
    await expect(banner.locator('summary')).toHaveText('更多')
    await expect(editor(page)).not.toContainText(':::')
  })
})

test.describe('read-only, preview and SSR', () => {
  const SAMPLE = '> [!TIP]\n> tip text\n\n::: details{summary="更多"}\nhidden text\n:::'

  test('has no toolbar, and toggling details changes only the view', async ({ page }) => {
    await paste(page, SAMPLE)
    await expect(editor(page).locator('details')).toHaveCount(1)
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await expect(editor(page)).toHaveAttribute('contenteditable', 'false')
    const before = await documentJson(page)

    await editor(page).locator('.hlx-alert p').click()
    await expect(page.locator('.hlx-callout-bar')).toHaveCount(0)

    const details = editor(page).locator('details')
    await details.locator('summary').click()
    await expect(details).toHaveAttribute('open')
    expect(await documentJson(page)).toBe(before)
  })

  test('toggles details in the preview, and keeps the HTML escaped in SSR', async ({ page }) => {
    await paste(page, SAMPLE)
    await expect(editor(page).locator('details')).toHaveCount(1)

    await page.getByRole('tab', { name: '預覽' }).click()
    const details = page.locator('.hlx-renderer details')
    await expect(page.locator('.hlx-renderer .hlx-alert[data-type="tip"]')).toContainText('tip text')
    await expect(details.locator('.hlx-details-body')).toBeHidden()
    await details.locator('summary').click()
    await expect(details.locator('.hlx-details-body')).toBeVisible()

    await page.getByRole('tab', { name: 'SSR HTML' }).click()
    const html = page.locator('pre.code-block').first()
    await expect(html).toContainText('<details class="hlx-details">')
    await expect(html).toContainText('data-type="tip"')
  })
})

test.describe('stored documents', () => {
  interface Json {
    type: string
    children?: Json[]
    content?: { root: { children: Json[] } }
    text?: string
  }
  const stored = async (page: Page) => {
    const text = await page.locator('details.json pre').textContent()
    return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
  }

  test('edits what is stored in `content` and keeps the rest of the document where it was', async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入舊格式文件' }).click()
    const alert = editor(page).locator('.hlx-alert').first()
    await expect(alert).toContainText('存在 content 裡的提示')
    await expect(editor(page).locator('.hlx-banner').first()).toContainText('存在 content 裡的橫幅')

    await alert.locator('p').first().click()
    await page.keyboard.press('End')
    await page.keyboard.type('！')
    await expect(alert).toContainText('存在 content 裡的提示！')

    await expect.poll(async () => (await stored(page)).map(node => node.type)).toEqual([
      'alert-quote',
      'banner',
      'footnote-section',
      'table',
      'paragraph',
    ])
    const [storedAlert, , , table] = await stored(page)
    expect(storedAlert).not.toHaveProperty('children')
    expect(JSON.stringify(storedAlert.content)).toContain('存在 content 裡的提示！')
    const [cell] = table.children![0].children!
    expect(cell.children![0]).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'image' },
      ],
    })

    await page.getByRole('tab', { name: '預覽' }).click()
    await expect(page.locator('.hlx-alert').first()).toContainText('存在 content 裡的提示！')
  })
})
