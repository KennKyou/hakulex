import type { Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const dialog = (page: Page) => page.locator('.hlx-media-dialog')

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    // A video or file that isn't there is what some of these tests are about.
    if (message.type() === 'error' && !message.text().includes('404'))
      seen.push(message.text())
  })
  await page.goto('/editor')
  await editor(page).click()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

interface Json { type: string, text?: string, src?: string, name?: string, children?: Json[] }

function documentJson(page: Page) {
  return editor(page).evaluate(root =>
    (root as unknown as { __lexicalEditor: { getEditorState: () => { toJSON: () => { root: unknown } } } }).__lexicalEditor.getEditorState().toJSON().root) as Promise<Json>
}
const blockTypes = async (page: Page) => ((await documentJson(page)).children ?? []).map(child => child.type)

/** A real, short WebM made in the page, as Playwright's Chromium has no H.264. */
async function makeWebm(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 360
    const context = canvas.getContext('2d')!
    const recorder = new MediaRecorder(canvas.captureStream(10), { mimeType: 'video/webm' })
    const chunks: Blob[] = []
    recorder.ondataavailable = event => chunks.push(event.data)
    const done = new Promise(resolve => recorder.addEventListener('stop', resolve))
    recorder.start()
    for (let i = 0; i < 6; i++) {
      context.fillStyle = i % 2
        ? '#f00'
        : '#00f'
      context.fillRect(0, 0, 640, 360)
      await new Promise(resolve => setTimeout(resolve, 60))
    }
    recorder.stop()
    await done
    const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer())
    return btoa(String.fromCharCode(...bytes))
  })
  return Buffer.from(base64, 'base64')
}

async function openFromMenu(page: Page, query: 'video' | 'file') {
  await page.keyboard.type(`/${query}`, { delay: 10 })
  await expect(page.locator('.hlx-slash-menu [role="option"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).locator('input[name="src"]')).toBeFocused()
}

async function uploadVideo(page: Page) {
  await openFromMenu(page, 'video')
  await dialog(page).locator('input[type="file"]').setInputFiles({ name: 'clip.webm', mimeType: 'video/webm', buffer: await makeWebm(page) })
  await dialog(page).getByRole('button', { name: '插入' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(editor(page).locator('video')).toHaveCount(1)
}

async function uploadFile(page: Page, name = 'report.pdf') {
  await openFromMenu(page, 'file')
  await dialog(page).locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer: Buffer.from('內容 of the file'),
  })
  await dialog(page).getByRole('button', { name: '插入' }).click()
  await expect(dialog(page)).toHaveCount(0)
  await expect(editor(page).locator('.hlx-file')).toHaveCount(1)
}

test.describe('with a URL', () => {
  test('refuses an unsafe address, then inserts with the caret below, undoing in one step', async ({ page }) => {
    await openFromMenu(page, 'video')
    await page.keyboard.type('javascript:alert(1)')
    await page.keyboard.press('Enter')
    await expect(dialog(page).getByRole('alert')).toBeVisible()

    await dialog(page).locator('input[name="src"]').fill('/nothing-here.webm')
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toHaveCount(0)
    await expect(editor(page).locator('video')).toHaveAttribute('src', '/nothing-here.webm')
    expect(await blockTypes(page)).toEqual(['video', 'paragraph'])

    await page.keyboard.type('下一行')
    await expect(editor(page).locator('p')).toHaveText('下一行')
    // Browsers group typing into undo steps differently, but the video is a step of its own.
    await expect(async () => {
      await undo(page)
      await expect(editor(page).locator('video')).toHaveCount(0, { timeout: 200 })
    }).toPass({ timeout: 5000 })
  })

  test('cancels with Escape, leaving the document and the caret alone', async ({ page }) => {
    await page.keyboard.type('前 ')
    await openFromMenu(page, 'file')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(editor(page)).toBeFocused()
    await page.keyboard.type('後')
    await expect(editor(page).locator('p')).toHaveText('前 後')
    expect(await blockTypes(page)).toEqual(['paragraph'])
  })

  test('names a file from its address, and edits it in its panel from Enter', async ({ page }) => {
    await openFromMenu(page, 'file')
    await page.keyboard.type('/docs/%E5%A0%B1%E5%91%8A.pdf')
    await page.keyboard.press('Enter')
    const card = editor(page).locator('.hlx-file')
    await expect(card.locator('.hlx-file-name')).toHaveText('報告.pdf')

    await card.click()
    await expect(editor(page).locator('.hlx-media-editor')).toHaveAttribute('data-selected')
    await page.keyboard.press('Enter')
    // Edited in the panel beside it, as it is typed.
    const panel = page.locator('.hlx-block-panel[aria-label="檔案"]')
    await expect(panel.locator('input[name="name"]')).toHaveValue('報告.pdf')
    await panel.locator('input[name="name"]').fill('年報.pdf')
    await expect(card.locator('.hlx-file-name')).toHaveText('年報.pdf')
    await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
    await expect(panel).toHaveCount(0)
    await expect(editor(page).locator('.hlx-media-editor')).toHaveAttribute('data-selected')
    // Not just for a moment: the keyboard stays in the editor once the panel is gone.
    await page.waitForTimeout(300)
    await expect(editor(page)).toBeFocused()

    await undo(page)
    await expect(card.locator('.hlx-file-name')).toHaveText('報告.pdf')
    await expect(editor(page).locator('.hlx-file')).toHaveCount(1)
  })
})

test.describe('uploading', () => {
  test('uploads a video that really loads and plays, sized from the file', async ({ page }) => {
    await uploadVideo(page)
    const video = editor(page).locator('video')
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThan(0)
    await expect(video).toHaveAttribute('width', '640')
    await expect(video).toHaveAttribute('height', '360')

    const before = await documentJson(page)
    await video.evaluate((element: HTMLVideoElement) => element.scrollIntoView())
    const box = (await video.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused || element.ended)).toBe(true)
    expect(await documentJson(page)).toEqual(before)
  })

  test('takes everything about a file from the file, and only downloads for readers', async ({ page }) => {
    await uploadFile(page)
    const card = editor(page).locator('.hlx-file')
    await expect(card.locator('.hlx-file-meta')).toContainText('PDF')
    await expect(card).toHaveAttribute('href', '/__uploads/report.pdf')

    let downloads = 0
    page.on('download', () => downloads++)
    await card.click()
    await expect(editor(page).locator('.hlx-media-editor')).toHaveAttribute('data-selected')
    await page.waitForTimeout(300)
    expect(downloads).toBe(0)

    await page.getByRole('tab', { name: '預覽' }).click()
    const waiting = page.waitForEvent('download')
    await page.locator('.hlx-renderer .hlx-file').click()
    const download = await waiting
    expect(download.suggestedFilename()).toBe('report.pdf')
  })

  test('shows a failed upload in the dialog and allows a retry', async ({ page }) => {
    await page.getByLabel('模擬上傳失敗').check()
    await editor(page).click()
    await openFromMenu(page, 'file')
    await dialog(page).locator('input[type="file"]').setInputFiles({
      name: 'a.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('x'),
    })
    await dialog(page).getByRole('button', { name: '插入' }).click()
    await expect(dialog(page).getByRole('alert')).toContainText('模擬的上傳失敗')
    expect(await blockTypes(page)).toEqual(['paragraph'])

    // The dialog is modal, so this can't be a real click.
    await page.getByLabel('模擬上傳失敗').evaluate((box: HTMLInputElement) => box.click())
    await dialog(page).getByRole('button', { name: '插入' }).click()
    await expect(dialog(page)).toHaveCount(0)
    await expect(editor(page).locator('.hlx-file-name')).toHaveText('a.pdf')
  })
})

test.describe('dropping', () => {
  test('sends each kind to its own place', async ({ page }) => {
    const webm = await makeWebm(page)
    const dataTransfer = await page.evaluateHandle(async (bytes) => {
      const data = new DataTransfer()
      data.items.add(new File([
        new Uint8Array(bytes),
      ], 'clip.webm', { type: 'video/webm' }))
      data.items.add(new File(['x'], 'notes.txt', { type: 'text/plain' }))
      return data
    }, [...webm])
    const paragraph = editor(page).locator('p').first()
    const box = (await paragraph.boundingBox())!
    const point = { clientX: box.x + 5, clientY: box.y + 5 }
    await paragraph.dispatchEvent('dragenter', { dataTransfer, ...point })
    await expect(editor(page)).toHaveAttribute('data-media-drop', '')
    await paragraph.dispatchEvent('drop', { dataTransfer, ...point })
    await expect(editor(page)).not.toHaveAttribute('data-media-drop')

    await expect(editor(page).locator('video')).toHaveCount(1)
    await expect(editor(page).locator('.hlx-file-name')).toHaveText('notes.txt')

    await undo(page)
    await expect(editor(page).locator('video, .hlx-file')).toHaveCount(0)
  })
})

test.describe('keyboard', () => {
  test('moves through blocks, deletes, and undoes', async ({ page }) => {
    await page.keyboard.type('上')
    await page.keyboard.press('Enter')
    await openFromMenu(page, 'file')
    await page.keyboard.type('/a.pdf')
    await page.keyboard.press('Enter')
    await expect(dialog(page)).toHaveCount(0)
    await page.keyboard.type('下')
    expect(await blockTypes(page)).toEqual(['paragraph', 'file', 'paragraph'])

    const selected = editor(page).locator('.hlx-media-editor')
    await page.keyboard.press('ArrowUp')
    await expect(selected).toHaveAttribute('data-selected')
    await page.keyboard.press('ArrowUp')
    await expect(selected).not.toHaveAttribute('data-selected')
    await page.keyboard.type('一')
    await expect(editor(page).locator('p').first()).toHaveText('上一')

    await page.keyboard.press('ArrowDown')
    await expect(selected).toHaveAttribute('data-selected')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.type('二')
    await expect(editor(page).locator('p').nth(1)).toContainText('二')

    await page.keyboard.press('ArrowUp')
    await expect(selected).toHaveAttribute('data-selected')
    await page.keyboard.press('Delete')
    expect(await blockTypes(page)).toEqual(['paragraph', 'paragraph'])
    await undo(page)
    await expect(editor(page).locator('.hlx-file')).toHaveCount(1)
  })
})

test.describe('readers', () => {
  test('downloads while read-only, with nothing to change', async ({ page }) => {
    await uploadFile(page)
    const before = await documentJson(page)
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    const card = editor(page).locator('.hlx-file')
    await expect(editor(page).locator('.hlx-media-edit')).toHaveCount(0)

    const waiting = page.waitForEvent('download')
    await card.click()
    expect((await waiting).suggestedFilename()).toBe('report.pdf')
    await expect(editor(page).locator('.hlx-media-editor')).not.toHaveAttribute('data-selected')
    expect(await documentJson(page)).toEqual(before)
  })

  test('shows notes instead of unsafe sources, in the editor and the preview', async ({ page }) => {
    await page.evaluate(() => navigator.clipboard.writeText('<video src="/ok.webm" controls></video>\n\n正常文字'))
    await page.keyboard.press('ControlOrMeta+V')
    await expect(editor(page).locator('video')).toHaveCount(1)
    await editor(page).evaluate((root) => {
      const lexical = (root as unknown as { __lexicalEditor: { getEditorState: () => { toJSON: () => { root: { children: Record<string, unknown>[] } } }, parseEditorState: (json: string) => unknown, setEditorState: (state: unknown) => void } }).__lexicalEditor
      const json = lexical.getEditorState().toJSON()
      json.root.children[0].src = 'javascript:alert(1)'
      json.root.children.push({
        type: 'file',
        version: 1,
        src: 'data:text/html,x',
        name: '壞檔案.html',
        display: 'block',
      })
      lexical.setEditorState(lexical.parseEditorState(JSON.stringify(json)))
    })
    await expect(editor(page).locator('video')).toHaveCount(0)
    await expect(editor(page).locator('.hlx-media-invalid')).toBeVisible()
    await expect(editor(page).locator('.hlx-file--invalid')).toContainText('壞檔案.html')

    await page.getByRole('tab', { name: '預覽' }).click()
    const preview = page.locator('.hlx-renderer')
    await expect(preview.locator('video, a.hlx-file')).toHaveCount(0)
    await expect(preview.locator('.hlx-media-invalid')).toBeVisible()
    await expect(preview.locator('.hlx-file--invalid')).toContainText('壞檔案.html')
  })

  test('is in the server output', async ({ page }) => {
    await uploadFile(page)
    await page.getByRole('tab', { name: 'SSR HTML' }).click()
    await expect(page.locator('pre.code-block').first()).toContainText('hlx-file')
    await expect(page.locator('pre.code-block').first()).toContainText('download="report.pdf"')
  })
})
