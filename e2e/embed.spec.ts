import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const row = (page: Page) => editor(page).locator('.hlx-embed-editor')
const input = (page: Page) => row(page).locator('.hlx-embed-input')

const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const SPOTIFY = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'

interface Json { type: string, url?: string, source?: string | null, children?: Json[] }

async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}
const types = async (page: Page) => (await stored(page)).map(node => node.type)

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    // Third-party pages are blocked here, which browsers report as errors.
    if (message.type() === 'error' && !/ERR_|Failed to load|blocked/i.test(message.text()))
      seen.push(message.text())
  })
  // Tests don't depend on third parties, and only check what was asked for.
  await page.route(/youtube\.com|bilibili\.com|spotify\.com|apple\.com|codesandbox\.io|gist\.github\.com/, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }))
  await page.goto('/editor')
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function insert(page: Page) {
  await editor(page).click()
  await page.keyboard.type('/embed')
  await expect(page.locator('.hlx-slash-menu [role="option"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(row(page)).toBeVisible()
}

async function paste(page: Page, text: string) {
  await page.evaluate(value => navigator.clipboard.writeText(value), text)
  await page.keyboard.press('ControlOrMeta+V')
}

test.describe('inserting', () => {
  test('from the slash menu, with focus in the input', async ({ page }) => {
    await insert(page)
    await expect(input(page)).toBeFocused()
    await page.keyboard.insertText(YOUTUBE)
    await page.keyboard.press('Enter')
    await expect(row(page).locator('.hlx-embed-label')).toHaveText('YouTube')
    await expect.poll(async () => (await stored(page))[0]).toEqual({
      type: 'embed',
      version: 1,
      url: YOUTUBE,
      source: 'youtube',
    })
    await page.keyboard.type('下一段')
    await expect(editor(page).locator('p')).toHaveText('下一段')
    await expect(page.locator('iframe')).toHaveCount(0)
  })

  test('from the toolbar', async ({ page }) => {
    await editor(page).click()
    await page.getByRole('button', { name: '插入' }).click()
    await page.getByRole('menuitem', { name: '嵌入' }).click()
    await expect(input(page)).toBeFocused()
  })

  test('outputs nothing while empty', async ({ page }) => {
    await insert(page)
    await page.getByRole('tab', { name: '預覽' }).click()
    await expect(page.locator('.hlx-embed')).toHaveCount(0)
  })
})

test.describe('changing the URL', () => {
  test.beforeEach(async ({ page }) => {
    await insert(page)
    await page.keyboard.insertText(YOUTUBE)
    await page.keyboard.press('Enter')
    await expect(row(page).locator('.hlx-embed-label')).toHaveText('YouTube')
  })

  test('undo takes back one change', async ({ page }) => {
    await input(page).fill(SPOTIFY)
    await input(page).press('Enter')
    await expect(row(page).locator('.hlx-embed-label')).toHaveText('Spotify')
    await undo(page)
    await expect(input(page)).toHaveValue(YOUTUBE)
    await expect(row(page).locator('.hlx-embed-label')).toHaveText('YouTube')
  })

  test('clicking elsewhere saves, with the caret where it was clicked', async ({ page }) => {
    await editor(page).locator('p').click()
    await page.keyboard.type('上')
    await input(page).fill(SPOTIFY)
    await editor(page).locator('p').click()
    await expect.poll(async () => (await stored(page))[0].source).toBe('spotify')
    await page.keyboard.type('下')
    await expect(editor(page).locator('p')).toContainText('下')
  })

  test('Esc throws it away', async ({ page }) => {
    await input(page).fill(SPOTIFY)
    await input(page).press('Escape')
    await expect(input(page)).toHaveValue(YOUTUBE)
  })

  test('won\'t take an unsafe URL', async ({ page }) => {
    await input(page).fill('javascript:alert(1)')
    await input(page).press('Enter')
    await expect(row(page).locator('.hlx-embed-error')).toBeVisible()
    expect((await stored(page))[0].url).toBe(YOUTUBE)
  })

  test('typing in the input stays in the input', async ({ page }) => {
    await input(page).click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('Backspace')
    await expect(input(page)).toHaveValue('')
    await expect(row(page)).toBeVisible()
  })
})

test.describe('as a block', () => {
  test.beforeEach(async ({ page }) => {
    await insert(page)
    await page.keyboard.insertText(YOUTUBE)
    await page.keyboard.press('Enter')
    await page.keyboard.type('下')
  })

  test('arrow up reaches it, Delete removes it, undo brings it back', async ({ page }) => {
    await page.keyboard.press('ArrowUp')
    await expect(row(page)).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Delete')
    await expect(row(page)).toHaveCount(0)
    await undo(page)
    await expect(row(page)).toHaveCount(1)
    await expect(input(page)).toHaveValue(YOUTUBE)
  })

  test('a click on the label picks it', async ({ page }) => {
    await row(page).locator('.hlx-embed-label').click()
    await expect(row(page)).toHaveAttribute('data-selected', 'true')
    await page.keyboard.press('Delete')
    await expect(row(page)).toHaveCount(0)
  })

  test('is left read-only with no way to remove it', async ({ page }) => {
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await expect(input(page)).not.toBeEditable()
    await expect(row(page).getByRole('button', { name: '刪除' })).toHaveCount(0)
    await expect(row(page).getByRole('button', { name: '開啟' })).toBeVisible()
  })
})

test.describe('pasting', () => {
  test('becomes an embed on an empty line, as one undo step', async ({ page }) => {
    await editor(page).click()
    await paste(page, YOUTUBE)
    await expect(row(page)).toHaveCount(1)
    await page.keyboard.type('下')
    await expect(editor(page).locator('p')).toHaveText('下')
    await page.waitForTimeout(350)
    await undo(page)
    await undo(page)
    await expect(row(page)).toHaveCount(0)
  })

  test('stays a link in the middle of a line, which isn\'t split', async ({ page }) => {
    await editor(page).click()
    await page.keyboard.type('前後')
    await page.keyboard.press('ArrowLeft')
    await paste(page, YOUTUBE)
    await expect(row(page)).toHaveCount(0)
    await expect.poll(async () => (await types(page))).toEqual(['paragraph'])
    await expect(editor(page).locator('p')).toContainText(YOUTUBE)
  })

  test('leaves other URLs alone', async ({ page }) => {
    await editor(page).click()
    await paste(page, 'https://example.com/')
    await expect(row(page)).toHaveCount(0)
    await expect(editor(page)).toContainText('https://example.com/')
  })
})

test.describe('the preview', () => {
  test.beforeEach(async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入提及、嵌入和步驟' }).click()
    await expect(row(page)).toHaveCount(8)
    await expect(page.locator('iframe')).toHaveCount(0)
    await page.getByRole('tab', { name: '預覽' }).click()
  })

  test('has limited iframes with fixed addresses', async ({ page }) => {
    const frames = page.locator('iframe.hlx-embed-frame')
    await expect(frames).toHaveCount(6)
    const srcs = await frames.evaluateAll(list => list.map(frame => frame.getAttribute('src')))
    expect(srcs).toEqual([
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://player.bilibili.com/player.html?bvid=BV1xx411c7mD&autoplay=0',
      'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC',
      'https://embed.music.apple.com/us/album/1989-taylors-version/1708308989',
      'https://codesandbox.io/embed/new?fontsize=14&hidenavigation=1',
      'https://gist.github.com/mbostock/4063269.pibb',
    ])
    for (const frame of await frames.all()) {
      await expect(frame).toHaveAttribute('sandbox', /allow-scripts/)
      await expect(frame).toHaveAttribute('loading', 'lazy')
    }
  })

  test('shows other URLs as links', async ({ page }) => {
    const links = page.locator('.hlx-embed--link')
    await expect(links).toHaveCount(2)
    await expect(links.nth(0)).toContainText('X 貼文')
    await expect(links.nth(1).locator('a')).toHaveAttribute('href', 'https://example.com/')
  })
})
