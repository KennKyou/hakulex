import type { Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

/*
 * `pickImages` in a real browser: the demo's media library is the site's own dialog, over the
 * editor's. It has to get focus, clicks and Esc while the editor's dialog waits under it.
 */

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

const editor = (page: Page) => page.locator('.hlx-content').first()
const imageDialog = (page: Page) => page.locator('.hlx-image-dialog')
const blockDialog = (page: Page) => page.locator('.hlx-block-dialog')
const picker = (page: Page) => page.locator('.site-picker')

interface Json { type: string, src?: string, fileId?: string, images?: { src: string, fileId?: string }[] }
async function stored(page: Page): Promise<Json[]> {
  const text = await page.locator('details.json pre').textContent()
  return (JSON.parse(text!) as { root: { children: Json[] } }).root.children
}

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
  await page.route(/picsum\.photos/, route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  await page.goto('/editor')
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function slash(page: Page, query: string) {
  await editor(page).click()
  await page.keyboard.type(query, { delay: 10 })
  await expect(page.locator('.hlx-slash-menu [role="option"]').first()).toBeVisible()
  await page.keyboard.press('Enter')
}

test('the image dialog waits under the site\'s dialog, then inserts what was chosen', async ({ page }) => {
  await slash(page, '/image')
  await expect(imageDialog(page)).toBeVisible()
  const pick = imageDialog(page).getByRole('button', { name: '選擇圖片' })
  await pick.click()

  await expect(picker(page)).toBeVisible()
  await expect(imageDialog(page)).toContainText('選擇圖片中…')
  // The site's dialog keeps the focus it took.
  await expect(picker(page).locator('button').first()).toBeFocused()
  // Esc closes the site's dialog only.
  await page.keyboard.press('Escape')
  await expect(picker(page)).toHaveCount(0)
  await expect(imageDialog(page)).toBeVisible()
  await expect(pick).toBeFocused()

  await pick.click()
  await picker(page).getByRole('button', { name: '河谷' }).click()
  await picker(page).getByRole('button', { name: '瀑布' }).click()
  await picker(page).getByRole('button', { name: '選擇 2 張' }).click()
  await expect(picker(page)).toHaveCount(0)
  await expect(imageDialog(page).locator('[data-image-dialog-row]')).toHaveCount(2)
  await expect(imageDialog(page).locator('button[data-primary]')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(imageDialog(page)).toHaveCount(0)

  await expect.poll(async () => (await stored(page)).filter(node => node.type === 'image').map(node => node.fileId))
    .toEqual(['media-1015', 'media-1035'])
})

test('the gallery\'s buttons are the same size and line up', async ({ page }) => {
  await slash(page, '/gallery')
  await expect(blockDialog(page)).toBeVisible()
  const buttons = [
    blockDialog(page).getByRole('button', { name: '新增圖片' }),
    blockDialog(page).locator('.hlx-gallery-upload'),
    blockDialog(page).getByRole('button', { name: '選擇圖片' }),
  ]
  const boxes = await Promise.all(buttons.map(item => item.boundingBox()))
  const looks = await Promise.all(buttons.map(item => item.evaluate((element) => {
    const style = getComputedStyle(element)
    return `${style.paddingLeft} ${style.paddingRight} ${style.fontWeight}`
  })))
  for (const box of boxes) {
    expect(box!.height).toBe(boxes[0]!.height)
    expect(box!.y).toBe(boxes[0]!.y)
  }
  expect(boxes[0]!.height).toBe(28)
  expect(new Set(looks)).toEqual(new Set(['10px 10px 500']))
})

test('the gallery adds what was chosen at the end, with file ids', async ({ page }) => {
  await slash(page, '/gallery')
  await blockDialog(page).getByRole('button', { name: '選擇圖片' }).click()
  await expect(picker(page)).toBeVisible()
  // Esc closes the site's dialog only.
  await page.keyboard.press('Escape')
  await expect(picker(page)).toHaveCount(0)
  await expect(blockDialog(page)).toBeVisible()

  await blockDialog(page).getByRole('button', { name: '選擇圖片' }).click()
  await picker(page).getByRole('button', { name: '小狗' }).click()
  await picker(page).getByRole('button', { name: '選擇 1 張' }).click()
  await expect(blockDialog(page).locator('.hlx-gallery-row')).toHaveCount(1)
  await blockDialog(page).getByRole('button', { name: '儲存' }).click()
  await expect.poll(async () => (await stored(page)).find(node => node.type === 'gallery')?.images)
    .toEqual([
      {
        src: 'https://picsum.photos/id/1025/800/600',
        alt: '小狗',
        width: 800,
        height: 600,
        fileId: 'media-1025',
      },
    ])
})
