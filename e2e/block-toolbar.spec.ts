import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const editor = (page: Page) => page.locator('.hlx-content').first()
const toolbar = (page: Page) => page.locator('.hlx-block-toolbar')

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

async function fromMenu(page: Page, query: string) {
  await page.keyboard.type(`/${query}`)
  const option = page.locator('.hlx-slash-menu [role="option"]').first()
  await expect(option).toBeVisible()
  await option.click()
}

interface Case {
  /** Puts the block in the document, and leaves nothing open. */
  load: (page: Page) => Promise<void>
  /** The part of the block a press picks it by. */
  target: (page: Page) => Locator
  /** What its editing is, once open. */
  editing: string
  label: string
}

function sample(name: string) {
  return async (page: Page) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name }).click()
  }
}
const blocks = (page: Page) => editor(page).locator('.hlx-block-editor')
// Once highlighted: until then the code's lines are swapped for colored ones, which can lose a click.
function highlighted(load: (page: Page) => Promise<void>) {
  return async (page: Page) => {
    await load(page)
    await expect(editor(page).locator('.hlx-code-body:visible').first()).toHaveAttribute('data-highlighted', '')
  }
}

const CASES: Record<string, Case> = {
  'code snippet': {
    load: highlighted(sample('載入程式碼片段、圖庫和對話')),
    target: page => blocks(page).nth(0).locator('.hlx-code-body:visible'),
    editing: '.hlx-block-dialog',
    label: '程式碼片段',
  },
  'gallery': {
    load: sample('載入程式碼片段、圖庫和對話'),
    target: page => blocks(page).nth(1).locator('img').first(),
    editing: '.hlx-block-dialog',
    label: '圖庫',
  },
  'chat': {
    load: sample('載入程式碼片段、圖庫和對話'),
    target: page => blocks(page).nth(4).locator('.hlx-chat-row').first(),
    editing: '.hlx-block-dialog',
    label: '對話',
  },
  'poll': {
    load: sample('載入投票'),
    target: page => editor(page).locator('.hlx-poll').first(),
    editing: '.hlx-block-panel[aria-label="投票"]',
    label: '投票',
  },
  'link card': {
    load: sample('載入連結卡片和繞排圖片'),
    target: page => editor(page).locator('.hlx-link-card').first(),
    editing: '.hlx-block-panel[aria-label="連結卡片"]',
    label: '連結卡片',
  },
  'image': {
    load: sample('載入連結卡片和繞排圖片'),
    target: page => editor(page).locator('img.hlx-image').first(),
    editing: '.hlx-block-panel[aria-label="圖片"]',
    label: '圖片',
  },
  'file': {
    load: async (page) => {
      await fromMenu(page, 'file')
      const dialog = page.locator('.hlx-media-dialog')
      await dialog.locator('input[name="src"]').fill('/a.pdf')
      await dialog.getByRole('button', { name: '插入' }).click()
      await expect(dialog).toHaveCount(0)
    },
    target: page => editor(page).locator('.hlx-media-editor').first(),
    editing: '.hlx-block-panel[aria-label="檔案"]',
    label: '檔案',
  },
  'Mermaid diagram': {
    load: async (page) => {
      await fromMenu(page, 'mermaid')
      await expect(page.locator('.hlx-mermaid-dialog')).toBeVisible()
      await page.locator('.hlx-mermaid-source').fill('graph TD\n  A --> B')
      await page.keyboard.press('ControlOrMeta+Enter')
      await expect(page.locator('.hlx-mermaid-dialog')).toHaveCount(0)
      // Once drawn: the diagram replaces what stood in for it, which can lose a click.
      await expect(editor(page).locator('.hlx-mermaid-editor .hlx-mermaid-svg svg')).toBeVisible()
    },
    target: page => editor(page).locator('.hlx-mermaid-editor').first(),
    editing: '.hlx-mermaid-dialog',
    label: 'Mermaid 圖表',
  },
  'equation': {
    load: async (page) => {
      await fromMenu(page, 'math')
      await page.getByLabel('LaTeX 數學式').fill('a+b')
      await page.locator('.hlx-math-popover').getByRole('button', { name: '套用' }).click()
      await expect(page.locator('.hlx-math-popover')).toHaveCount(0)
    },
    target: page => editor(page).locator('.hlx-math-editor').first(),
    editing: '.hlx-math-popover',
    label: '數學式',
  },
}

async function closeEditing(page: Page, editing: string) {
  await page.keyboard.press('Escape')
  await expect(page.locator(editing)).toHaveCount(0)
}

for (const [name, item] of Object.entries(CASES)) {
  test.describe(`a ${name}`, () => {
    test.beforeEach(async ({ page }) => {
      await item.load(page)
    })

    test('is picked by a click, with its toolbar at its top right and nothing opened', async ({ page }) => {
      await item.target(page).click()
      await expect(toolbar(page)).toBeVisible()
      await expect(toolbar(page)).toHaveAttribute('aria-label', item.label)
      await expect(page.locator(item.editing)).toHaveCount(0)
      const [bar, box] = await Promise.all([
        toolbar(page).boundingBox(),
        item.target(page).locator('xpath=ancestor-or-self::*[@data-selected][1]').boundingBox(),
      ])
      expect(bar!.y + bar!.height).toBeLessThanOrEqual(box!.y + 1)
      expect(Math.abs(bar!.x + bar!.width - (box!.x + box!.width))).toBeLessThan(2)
    })

    test('opens its editing from the toolbar, on Enter, and on a double click', async ({ page }) => {
      await item.target(page).click()
      await toolbar(page).getByRole('button', { name: '編輯' }).click()
      await expect(page.locator(item.editing)).toBeVisible()
      await closeEditing(page, item.editing)

      await item.target(page).click()
      await expect(toolbar(page)).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(page.locator(item.editing)).toBeVisible()
      await closeEditing(page, item.editing)

      await item.target(page).dblclick()
      await expect(page.locator(item.editing)).toBeVisible()
      await closeEditing(page, item.editing)
    })

    test('has no toolbar when read-only', async ({ page }) => {
      await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
      await item.target(page).click({ modifiers: [] }).catch(() => {})
      await expect(toolbar(page)).toHaveCount(0)
      await expect(page.locator(item.editing)).toHaveCount(0)
    })
  })
}

test('a link card\'s toolbar opens its link in a new tab', async ({ page, context }) => {
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入連結卡片和繞排圖片' }).click()
  await editor(page).locator('.hlx-link-card').first().click()
  const opened = context.waitForEvent('page')
  await toolbar(page).getByRole('button', { name: '開啟連結' }).click()
  const tab = await opened
  expect(tab.url()).toContain('lexical.dev')
  await tab.close()
  await expect(page.locator('.hlx-block-dialog')).toHaveCount(0)
})
