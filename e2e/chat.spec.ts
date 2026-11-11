import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const block = (page: Page) => editor(page).locator('.hlx-block-editor:has(.hlx-chat), .hlx-block-editor:has(.hlx-block-empty)')
const dialog = (page: Page) => page.locator('.hlx-block-dialog')
const messages = (page: Page) => dialog(page).locator('.hlx-chat-edit-message')

interface Json { type: string, variant?: string, messages?: { content: string, participantId: string }[], participants?: { id: string, kind: string, name?: string }[] }

async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}
const chats = async (page: Page) => (await stored(page)).filter(node => node.type === 'chat')

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error')
      seen.push(message.text())
  })
  page.on('dialog', (alert) => {
    seen.push(`a dialog opened: ${alert.message()}`)
    void alert.dismiss()
  })
  await page.route(/picsum\.photos/, route => route.abort())
  await page.goto('/editor')
})

test.afterEach(({ page }) => {
  expect(errors.get(page).filter(item => !/ERR_FAILED|Failed to load/.test(item))).toEqual([])
})

async function insert(page: Page) {
  await editor(page).click()
  await page.keyboard.type('/chat')
  await expect(page.locator('.hlx-slash-menu [role="option"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
}

test.describe('writing a chat', () => {
  test('messages with Enter for new lines, saved with the keyboard, as one undo step', async ({ page }) => {
    await insert(page)
    await dialog(page).getByRole('button', { name: '新增訊息' }).click()
    await messages(page).first().locator('textarea').click()
    await page.keyboard.type('第一行')
    await page.keyboard.press('Enter')
    await page.keyboard.type('**第二行**')
    await expect(dialog(page)).toBeVisible()
    await page.keyboard.press('ControlOrMeta+Enter')
    await expect(dialog(page)).toHaveCount(0)
    await expect(block(page).locator('.hlx-chat-bubble strong')).toHaveText('第二行')
    await expect.poll(async () => (await chats(page))[0]?.messages?.[0].content).toBe('第一行\n**第二行**')
    await undo(page)
    await expect(block(page)).toHaveCount(0)
  })

  test('changes who said it, and the variant', async ({ page }) => {
    await insert(page)
    await dialog(page).getByRole('button', { name: '新增訊息' }).click()
    await messages(page).first().locator('textarea').fill('嗨')
    await messages(page).first().locator('select').selectOption({ index: 1 })
    await dialog(page).getByRole('button', { name: '儲存' }).click()
    await expect(block(page).locator('.hlx-chat-row')).toHaveAttribute('data-side', 'left')
    await block(page).click()
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await dialog(page).locator('[data-field="variant"]').selectOption('user-user')
    await dialog(page).getByRole('button', { name: '儲存' }).click()
    await expect(block(page).locator('.hlx-chat-row')).toHaveAttribute('data-side', 'right')
    await expect.poll(async () => (await chats(page))[0].participants?.map(person => person.kind)).toEqual(['user', 'user'])
  })

  test('Esc asks before throwing changes away', async ({ page }) => {
    await insert(page)
    await dialog(page).getByRole('button', { name: '新增訊息' }).click()
    await messages(page).first().locator('textarea').fill('嗨')
    await page.keyboard.press('Escape')
    await expect(dialog(page).getByText('有未儲存的修改')).toBeVisible()
    await dialog(page).getByRole('button', { name: '放棄' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(block(page)).toHaveCount(0)
  })

  test('won\'t take an unsafe avatar', async ({ page }) => {
    await insert(page)
    await dialog(page).locator('[data-field="avatar"]').first().fill('javascript:alert(1)')
    await dialog(page).getByRole('button', { name: '儲存' }).click()
    await expect(dialog(page).getByRole('alert')).toBeVisible()
  })
})

test.describe('the sample', () => {
  test.beforeEach(async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入程式碼片段、圖庫和對話' }).click()
    await expect(block(page)).toHaveCount(2)
  })

  test('runs nothing from a message, in the editor or the preview', async ({ page }) => {
    const check = async (root: ReturnType<Page['locator']>) => {
      const hostile = root.locator('.hlx-chat-row').nth(2)
      await expect(hostile).toContainText('onerror')
      await expect(hostile.locator('img, script, a')).toHaveCount(0)
    }
    await check(editor(page))
    await page.getByRole('tab', { name: '預覽' }).click()
    await check(page.locator('.editor-frame:visible'))
  })

  test('formats messages the same in the preview', async ({ page }) => {
    await expect(editor(page).locator('.hlx-chat-article strong')).toHaveText('粗體')
    await page.getByRole('tab', { name: '預覽' }).click()
    const preview = page.locator('.editor-frame:visible')
    await expect(preview.locator('.hlx-chat-article strong')).toHaveText('粗體')
    await expect(preview.locator('.hlx-chat-article a')).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(preview.locator('.hlx-chat-row').nth(0)).toHaveAttribute('data-side', 'right')
    await expect(preview.locator('.hlx-chat').nth(1).locator('.hlx-chat-row').nth(1)).toHaveAttribute('data-side', 'right')
  })

  test('is reached by the arrow keys, and removed, and brought back', async ({ page }) => {
    await editor(page).locator('> p', { hasText: '使用者之間' }).click()
    await page.keyboard.press('ArrowDown')
    await expect(block(page).nth(1)).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Delete')
    await expect(block(page)).toHaveCount(1)
    await undo(page)
    await expect(block(page)).toHaveCount(2)
  })

  test('is read only with everything else', async ({ page }) => {
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await expect(block(page).first().getByRole('button', { name: '編輯' })).toHaveCount(0)
  })
})
