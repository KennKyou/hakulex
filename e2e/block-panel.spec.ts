import type { Locator, Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

/*
 * Images, videos, files, link cards and polls are edited in a panel beside them: each change
 * goes in as it is made, Esc puts it all back, a press outside keeps it.
 */

const editor = (page: Page) => page.locator('.hlx-content').first()
const toolbar = (page: Page) => page.locator('.hlx-block-toolbar')
const panel = (page: Page) => page.locator('.hlx-block-panel')
const field = (page: Page, name: string) => panel(page).locator(`[name="${name}"], [data-field="${name}"]`).first()

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

async function fromMenu(page: Page, query: string) {
  await page.keyboard.type(`/${query}`)
  const option = page.locator('.hlx-slash-menu [role="option"]').first()
  await expect(option).toBeVisible()
  await option.click()
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

interface Case {
  load: (page: Page) => Promise<void>
  target: (page: Page) => Locator
  label: string
  /** The field the panel opens on. */
  first: string
}

async function addMedia(page: Page, kind: 'video' | 'file', src: string) {
  await fromMenu(page, kind)
  const dialog = page.locator('.hlx-media-dialog')
  await dialog.locator('input[name="src"]').fill(src)
  await dialog.getByRole('button', { name: '插入' }).click()
  await expect(dialog).toHaveCount(0)
}

const CASES: Record<string, Case> = {
  'image': {
    load: sample('載入連結卡片和繞排圖片'),
    target: page => editor(page).locator('img.hlx-image').first(),
    label: '圖片',
    first: 'src',
  },
  'video': {
    load: page => addMedia(page, 'video', '/a.webm'),
    target: page => editor(page).locator('.hlx-media-editor').first(),
    label: '影片',
    first: 'src',
  },
  'file': {
    load: page => addMedia(page, 'file', '/a.pdf'),
    target: page => editor(page).locator('.hlx-media-editor').first(),
    label: '檔案',
    first: 'name',
  },
  'link card': {
    load: sample('載入連結卡片和繞排圖片'),
    target: page => editor(page).locator('.hlx-link-card').first(),
    label: '連結卡片',
    first: 'url',
  },
  'poll': {
    load: sample('載入投票'),
    target: page => editor(page).locator('.hlx-poll').first(),
    label: '投票',
    first: 'question',
  },
}

/** Picks the block: the video's player keeps clicks to itself, so it has a button for that. */
async function pick(page: Page, name: string) {
  if (name === 'video') {
    await CASES[name].target(page).hover()
    await editor(page).locator('.hlx-media-pick').click()
  }
  else {
    await CASES[name].target(page).click()
  }
  await expect(toolbar(page)).toHaveAttribute('aria-label', CASES[name].label)
}
async function openPanel(page: Page, name: string) {
  await pick(page, name)
  await toolbar(page).getByRole('button', { name: '編輯' }).click()
  await expect(panel(page)).toHaveAttribute('aria-label', CASES[name].label)
}

for (const name of Object.keys(CASES)) {
  test.describe(`a ${name}`, () => {
    test('opens its panel beside it, on screen, following the page as it scrolls', async ({ page }) => {
      await CASES[name].load(page)
      await openPanel(page, name)
      await expect(page.locator('.hlx-dialog, .hlx-block-dialog')).toHaveCount(0)
      await expect(panel(page).locator('.hlx-chart-panel-head')).toContainText(CASES[name].label)
      await expect(panel(page).locator('.hlx-block-panel-foot')).toHaveText('改了就會套用 · Esc 還原')
      await expect(field(page, CASES[name].first)).toBeFocused()

      const block = await CASES[name].target(page).boundingBox()
      const box = (await panel(page).boundingBox())!
      const viewport = page.viewportSize()!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      expect(box.y).toBeGreaterThanOrEqual(0)
      // Beside it, or else under or over it: never covering it from the left.
      expect(box.x >= block!.x + block!.width - 1 || box.y >= block!.y + block!.height - 1 || box.y <= block!.y + 8).toBe(true)

      // Scrolled, it moves as far as the block does, and stops at the top of the window.
      await page.evaluate(() => document.body.style.setProperty('padding-bottom', '2000px'))
      await page.evaluate(() => window.scrollBy(0, 120))
      await expect.poll(async () => (await CASES[name].target(page).boundingBox())!.y).toBeLessThan(block!.y - 20)
      // Beside it at its top, under it, or over its top: wherever there is room now.
      const attached = async () => {
        const now = (await CASES[name].target(page).boundingBox())!
        const top = (await panel(page).boundingBox())!.y
        return [
          Math.max(8, now.y),
          now.y + now.height + 8,
          Math.max(8, now.y + 4),
        ].some(spot => Math.abs(spot - top) <= 2)
      }
      await expect.poll(attached).toBe(true)
    })

    test('has no panel when read-only', async ({ page }) => {
      await CASES[name].load(page)
      await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
      await CASES[name].target(page).dblclick()
      await expect(panel(page)).toHaveCount(0)
      await expect(toolbar(page)).toHaveCount(0)
    })
  })
}

test('writes a link card\'s title as it is typed, fast, without the caret jumping, as one step', async ({ page }) => {
  await CASES['link card'].load(page)
  await openPanel(page, 'link card')
  const title = field(page, 'title')
  await title.click()
  await title.press('ControlOrMeta+a')
  await page.keyboard.type('一個很長的新標題 typed quickly', { delay: 0 })
  await expect(title).toHaveValue('一個很長的新標題 typed quickly')
  expect(await title.evaluate((input: HTMLInputElement) => input.selectionStart)).toBe('一個很長的新標題 typed quickly'.length)
  await expect(CASES['link card'].target(page)).toContainText('一個很長的新標題 typed quickly')
  // Out of the panel: the change stays, and comes off in one undo.
  await page.mouse.click(5, 5)
  await expect(panel(page)).toHaveCount(0)
  await expect(CASES['link card'].target(page)).toContainText('一個很長的新標題 typed quickly')
  await editor(page).click({
    position: { x: 5, y: 5 },
  })
  await page.keyboard.press('ControlOrMeta+z')
  await expect(CASES['link card'].target(page)).not.toContainText('一個很長的新標題')
})

test('puts a poll back as it was on Esc, and keeps the block picked', async ({ page }) => {
  await CASES.poll.load(page)
  const poll = CASES.poll.target(page)
  const count = await editor(page).locator('.hlx-poll').count()
  const question = await poll.locator('.hlx-poll-question').textContent()
  await openPanel(page, 'poll')
  await page.keyboard.type('改過的題目')
  await expect(poll).toContainText('改過的題目')
  await panel(page).getByRole('button', { name: '新增選項' }).click()
  await panel(page).locator('[data-field="option"]').last().fill('新的選項')
  await expect(poll).toContainText('新的選項')
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await expect(poll).not.toContainText('改過的題目')
  await expect(poll).not.toContainText('新的選項')
  await expect(poll).toContainText(question!.trim())
  await expect(toolbar(page)).toHaveAttribute('aria-label', '投票')
  // The keyboard is back in the editor: Delete removes the picked poll.
  await page.keyboard.press('Delete')
  await expect(editor(page).locator('.hlx-poll')).toHaveCount(count - 1)
})

test('adds a poll as an example, with its panel open on the question', async ({ page }) => {
  await fromMenu(page, 'poll')
  await expect(panel(page)).toHaveAttribute('aria-label', '投票')
  await expect(page.locator('.hlx-block-dialog')).toHaveCount(0)
  await expect(editor(page).locator('.hlx-poll')).toContainText('你比較喜歡哪一個？')
  await page.keyboard.type('午餐吃什麼？')
  await expect(editor(page).locator('.hlx-poll')).toContainText('午餐吃什麼？')
})

test('refuses an image address that is not safe, leaving the image as it is', async ({ page }) => {
  await CASES.image.load(page)
  const image = CASES.image.target(page)
  const before = await image.getAttribute('src')
  await openPanel(page, 'image')
  await field(page, 'src').fill('https://example.com/half')
  await expect(image).toHaveAttribute('src', before!)
  await field(page, 'src').fill('javascript:alert(1)')
  await field(page, 'src').press('Enter')
  await expect(panel(page).getByRole('alert')).toHaveText('這個網址無法使用。')
  await expect(field(page, 'src')).toHaveAttribute('aria-invalid', 'true')
  await expect(image).toHaveAttribute('src', before!)
})

test('replaces a file from the panel once its upload is done, and keeps it when closed', async ({ page }) => {
  await CASES.file.load(page)
  await openPanel(page, 'file')
  await panel(page).locator('input[type="file"]').setInputFiles({
    name: 'report.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4'),
  })
  const card = CASES.file.target(page)
  await expect(card).toContainText('report.pdf')
  await page.mouse.click(5, 5)
  await expect(panel(page)).toHaveCount(0)
  await expect(card).toContainText('report.pdf')
})

test('closes the panel when the editor turns read-only, keeping what was written', async ({ page }) => {
  await CASES['link card'].load(page)
  await openPanel(page, 'link card')
  await field(page, 'title').fill('唯讀前的標題')
  await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
  await expect(panel(page)).toHaveCount(0)
  await expect(CASES['link card'].target(page)).toContainText('唯讀前的標題')
})
