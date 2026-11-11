import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/*
 * Heading levels marked on the left while editing, giving way to the block
 * handle that sits in the same place.
 */

const editor = (page: Page) => page.locator('.hlx-content').first()
const errors = new WeakMap<Page, string[]>()
const LEVELS = [1, 2, 3, 4, 5, 6]

function heading(level: number) {
  return {
    type: 'heading',
    tag: `h${level}`,
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children: [
      {
        type: 'text',
        text: `Level ${level}`,
        format: 0,
        style: '',
        mode: 'normal',
        detail: 0,
        version: 1,
      },
    ],
  }
}
const DOC = {
  root: {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: 'ltr',
    children: [
      ...LEVELS.map(heading),
      {
        type: 'paragraph',
        version: 1,
        format: '',
        indent: 0,
        direction: 'ltr',
        textFormat: 0,
        textStyle: '',
        children: [
          {
            type: 'text',
            text: 'Body text.',
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
            version: 1,
          },
        ],
      },
    ],
  },
}

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error')
      seen.push(message.text())
  })
  await page.goto('/editor')
  await page.evaluate((doc) => {
    ;(document.querySelector('#app') as any).__vue_app__._instance.setupState.doc = doc
  }, DOC)
  await expect(editor(page).locator('.hlx-h6')).toBeVisible()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

const badge = (locator: Locator, name: string) => locator.evaluate((element, property) => getComputedStyle(element, '::before').getPropertyValue(property), name)

test('marks each heading\'s level on its left while editing, small and faint', async ({ page }) => {
  for (const level of LEVELS) {
    const title = editor(page).locator(`.hlx-h${level}`)
    expect(await badge(title, 'content')).toBe(`"H${level}"`)
    expect(await badge(title, 'left')).toBe('-24px')
    expect(await badge(title, 'bottom')).toBe('8px')
    expect(await badge(title, 'font-size')).toBe('8px')
    expect(await badge(title, 'opacity')).toBe('0.6')
    expect(await badge(title, 'color')).toBe('rgb(64, 64, 64)')
  }
  // Not part of the text: selecting a heading gives only its words.
  const selected = await editor(page).locator('.hlx-h1').evaluate((element) => {
    const range = document.createRange()
    range.selectNodeContents(element)
    const selection = getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    return selection.toString()
  })
  expect(selected).toBe('Level 1')
})

test('has no badges for readers, read only, or on a narrow screen', async ({ page }) => {
  await page.getByRole('tab', { name: '預覽' }).click()
  expect(await badge(page.locator('.hlx-renderer .hlx-h1'), 'content')).toBe('none')
  await page.getByRole('tab', { name: '編輯' }).click()
  await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
  await expect.poll(() => badge(editor(page).locator('.hlx-h1'), 'content')).toBe('none')
  await page.getByRole('checkbox', { name: '可編輯' }).check()
  await expect.poll(() => badge(editor(page).locator('.hlx-h1'), 'content')).toBe('"H1"')
  await page.setViewportSize({ width: 600, height: 800 })
  expect(await badge(editor(page).locator('.hlx-h1'), 'display')).toBe('none')
})

test('gives way to the block handle beside a heading, and comes back when it goes', async ({ page }) => {
  const second = editor(page).locator('.hlx-h2')
  await second.hover()
  await expect(page.locator('.hlx-block-grip')).toBeVisible()
  await expect.poll(() => badge(second, 'opacity')).toBe('0')
  // Only that heading's.
  expect(await badge(editor(page).locator('.hlx-h3'), 'opacity')).toBe('0.6')
  await editor(page).locator('.hlx-h3').hover()
  await expect.poll(() => badge(second, 'opacity')).toBe('0.6')
  await expect.poll(() => badge(editor(page).locator('.hlx-h3'), 'opacity')).toBe('0')
  await page.mouse.move(5, 5)
  await expect(page.locator('.hlx-block-grip')).toBeHidden()
  await expect.poll(() => badge(editor(page).locator('.hlx-h3'), 'opacity')).toBe('0.6')
})
