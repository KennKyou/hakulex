import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const dialog = (page: Page) => page.locator('.hlx-block-dialog')
const preview = (page: Page) => page.locator('.hlx-renderer:visible')
const previewPoll = (page: Page, pollId: string) => preview(page).locator(`[data-poll-id="${pollId}"]`)

interface Json { type: string, pollId?: string, question?: string, mode?: string, options?: { id: string, label: string }[] }
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
  await editor(page).click()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

// A poll is edited in the panel beside it, each change as it is made.
const panel = (page: Page) => page.locator('.hlx-block-panel[aria-label="投票"]')
/** Puts the panel away from the poll's toolbar, keeping what was written. */
async function closePanel(page: Page) {
  await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
  await expect(panel(page)).toHaveCount(0)
}
/** Adds a poll from the menu: an example goes in, with its panel open, then this is written over it. */
async function insert(page: Page, question: string, ...options: string[]) {
  await page.keyboard.type('/poll')
  await expect(page.locator('.hlx-slash-menu [role="option"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(panel(page)).toBeVisible()
  await expect(dialog(page)).toHaveCount(0)
  await panel(page).locator('[data-field="question"]').fill(question)
  for (const [index, option] of options.entries()) {
    if (index >= 2)
      await panel(page).getByRole('button', { name: '新增選項' }).click()
    await panel(page).locator('[data-field="option"]').nth(index).fill(option)
  }
  await closePanel(page)
}

test.describe('writing a poll', () => {
  test('inserts one from the menu and writes it in its panel; the insert is one undo step', async ({ page }) => {
    await insert(page, '午餐吃什麼？', '麵', '飯', '沙拉')
    await expect(editor(page).locator('.hlx-poll')).toContainText('沙拉')
    await expect(editor(page).locator('.hlx-poll input')).toHaveCount(0)
    await expect.poll(async () => (await stored(page)).find(node => node.type === 'poll')?.pollId).toMatch(/^p_/)

    await page.keyboard.press('Delete')
    await expect(editor(page).locator('.hlx-poll')).toHaveCount(0)
    await page.keyboard.type('/poll')
    await page.keyboard.press('Enter')
    await expect(editor(page).locator('.hlx-poll')).toContainText('你比較喜歡哪一個？')
    await closePanel(page)
    await undo(page)
    await expect(editor(page).locator('.hlx-poll')).toHaveCount(0)
  })

  test('is reached by the arrow keys and edited in its panel from Enter', async ({ page }) => {
    await page.keyboard.type('前')
    await page.keyboard.press('Enter')
    await insert(page, '午餐？', '麵', '飯')
    // The poll stays picked once its panel is put away; the line after it is one key down.
    await page.keyboard.press('ArrowDown')
    await page.keyboard.type('後')
    await page.keyboard.press('ArrowUp')
    await expect(editor(page).locator('.hlx-block-editor[data-selected]')).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(panel(page).locator('[data-field="question"]')).toHaveValue('午餐？')
    await panel(page).locator('[data-field="mode"]').selectOption('multiple')
    // Just added here, so nobody has voted yet: nothing to warn about.
    await expect(panel(page).locator('[role="status"]')).toHaveCount(0)
    await expect(editor(page).locator('.hlx-poll')).toContainText('可複選')
    await closePanel(page)
    await expect.poll(async () => (await stored(page)).find(node => node.type === 'poll')?.mode).toBe('multiple')
  })
})

test.describe('voting in the preview', () => {
  test.beforeEach(async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入投票' }).click()
    await expect(editor(page).locator('.hlx-poll')).toHaveCount(3)
    await page.getByRole('tab', { name: '預覽' }).click()
  })

  test('votes for one option and shows the results', async ({ page }) => {
    const poll = previewPoll(page, 'p_demo_lunch')
    await expect(poll).toContainText('共 5 票')
    await poll.getByLabel('飯').check()
    await poll.getByRole('button', { name: '投票' }).click()
    await expect(poll).toContainText('共 6 票')
    await expect(poll.locator('.hlx-poll-option[data-chosen]')).toContainText('飯')
    await poll.getByLabel('麵').check()
    await poll.getByRole('button', { name: '更改投票' }).click()
    await expect(poll.locator('.hlx-poll-option[data-chosen]')).toContainText('麵')
    await expect(poll).toContainText('共 6 票')
  })

  test('shows the results only after voting when asked to', async ({ page }) => {
    const poll = previewPoll(page, 'p_demo_pets')
    await expect(poll.locator('.hlx-poll-count')).toHaveCount(0)
    await poll.getByLabel('貓').check()
    await poll.getByLabel('魚').check()
    await poll.getByRole('button', { name: '投票' }).click()
    await expect(poll.locator('.hlx-poll-count')).toHaveCount(4)
    await expect(poll.locator('.hlx-poll-option[data-chosen]')).toHaveCount(2)
  })

  test('says a closed poll is closed, with nothing to vote with', async ({ page }) => {
    const poll = previewPoll(page, 'p_demo_closed')
    await expect(poll).toContainText('已截止')
    await expect(poll.locator('input')).toHaveCount(0)
    await expect(poll.locator('.hlx-poll-count')).toHaveCount(2)
  })

  test('starts the server output with the results', async ({ page }) => {
    await page.getByRole('tab', { name: 'SSR HTML' }).click()
    await expect(page.locator('pre.code-block').first()).toContainText('共 5 票')
  })
})
