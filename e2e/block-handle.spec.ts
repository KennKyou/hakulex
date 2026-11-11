import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const editor = (page: Page) => page.locator('.hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')
const grip = (page: Page) => page.locator('.hlx-block-grip')
const add = (page: Page) => page.locator('.hlx-block-add')
const menuItem = (page: Page, name: string) => page.locator('.hlx-block-menu').getByRole('menuitem', { name }).or(page.locator('.hlx-block-menu').getByRole('menuitemradio', { name }))

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

async function paragraphs(page: Page, ...values: string[]) {
  for (const [index, value] of values.entries()) {
    if (index)
      await page.keyboard.press('Enter')
    await page.keyboard.type(value)
  }
  await expect(editor(page).locator('> p')).toHaveCount(values.length)
}

const lines = (page: Page) => editor(page).locator('> p, > h1, > h2, > h3, > blockquote, > ul').allTextContents()
const line = (page: Page, index: number) => editor(page).locator('> p').nth(index)

async function openMenu(page: Page, index: number) {
  await line(page, index).hover()
  await grip(page).click()
  await expect(page.locator('.hlx-block-menu')).toBeVisible()
}

async function drag(page: Page, fromIndex: number, toY: (box: { y: number, height: number }) => number, toIndex: number, finish: () => Promise<void>) {
  await line(page, fromIndex).hover()
  const handle = (await grip(page).boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  const target = (await line(page, toIndex).boundingBox())!
  await page.mouse.move(target.x + 20, toY(target), { steps: 6 })
  await finish()
}

test.describe('showing', () => {
  test('sits left of the block it follows, and leaves after the pointer does', async ({ page }) => {
    await paragraphs(page, '一', '二', '三')
    await line(page, 1).hover()
    await expect(grip(page)).toBeVisible()
    const block = (await line(page, 1).boundingBox())!
    const handle = (await grip(page).boundingBox())!
    expect(handle.x + handle.width).toBeLessThanOrEqual(block.x)
    expect(Math.abs((handle.y + handle.height / 2) - (block.y + block.height / 2))).toBeLessThan(12)

    // Crossing over to the handle doesn't lose it.
    await grip(page).hover()
    await expect(grip(page)).toBeVisible()

    await page.mouse.move(2, 2)
    await expect(grip(page)).toHaveCount(0)
  })

  test('follows the block when the page scrolls', async ({ page }) => {
    await paragraphs(page, ...Array.from({ length: 40 }, (_, i) => `行 ${i}`))
    await line(page, 3).hover()
    await page.evaluate(() => window.scrollBy(0, 50))
    // It may also have moved on: the page scrolling puts the pointer over another line.
    await expect.poll(async () => {
      const handle = await grip(page).boundingBox()
      if (!handle)
        return 0
      const blocks = await editor(page).locator('> p').evaluateAll(all => all.map((p) => {
        const { top, height } = p.getBoundingClientRect()
        return top + height / 2
      }))
      return Math.min(...blocks.map(center => Math.abs(handle.y + handle.height / 2 - center)))
    }).toBeLessThan(12)
  })

  test('is not there for footnotes or while read-only', async ({ page }) => {
    await page.evaluate(() => navigator.clipboard.writeText('甲[^1]\n\n[^1]: 內容'))
    await page.keyboard.press('ControlOrMeta+V')
    await page.locator('.hlx-footnotes').hover()
    await page.waitForTimeout(400)
    await expect(grip(page)).toHaveCount(0)

    await line(page, 0).hover()
    await expect(grip(page)).toBeVisible()
    await page.getByRole('checkbox', { name: '可編輯' }).uncheck()
    await expect(grip(page)).toHaveCount(0)
    await line(page, 0).hover()
    await page.waitForTimeout(100)
    await expect(grip(page)).toHaveCount(0)
  })
})

test('stays clear of a table\'s own handles', async ({ page }) => {
  await page.evaluate(() => navigator.clipboard.writeText('前\n\n| a | b |\n| --- | --- |\n| c | d |\n\n後'))
  await page.keyboard.press('ControlOrMeta+V')
  await editor(page).locator('th').first().hover()
  const row = page.getByRole('button', { name: '列操作' })
  await expect(row).toBeVisible()
  await expect(grip(page)).toBeVisible()
  const a = (await row.boundingBox())!
  const b = (await grip(page).boundingBox())!
  const c = (await add(page).boundingBox())!
  for (const other of [b, c]) {
    const apart = other.x + other.width <= a.x || a.x + a.width <= other.x || other.y + other.height <= a.y || a.y + a.height <= other.y
    expect(apart).toBe(true)
  }
  await row.click()
  await expect(page.getByRole('menuitem', { name: '刪除列' })).toBeVisible()
})

test.describe('the menu', () => {
  test('moves a block, gives focus back with the caret intact, and undoes in one step', async ({ page }) => {
    await paragraphs(page, '一', '二', '三')
    await openMenu(page, 1)
    await menuItem(page, '上移').click()
    await expect.poll(() => lines(page)).toEqual(['二', '一', '三'])
    await expect(editor(page)).toBeFocused()
    await undo(page)
    await expect.poll(() => lines(page)).toEqual(['一', '二', '三'])
  })

  test('stays on its block while the pointer moves, and disables what can not happen', async ({ page }) => {
    await paragraphs(page, '一', '二')
    await openMenu(page, 0)
    await expect(menuItem(page, '上移')).toHaveAttribute('data-disabled', '')
    await menuItem(page, '複製').click()
    await expect.poll(() => lines(page)).toEqual(['一', '一', '二'])
  })

  test('deletes, and turns a paragraph into a heading', async ({ page }) => {
    await paragraphs(page, '一', '二')
    await openMenu(page, 1)
    await menuItem(page, '刪除').click()
    await expect.poll(() => lines(page)).toEqual(['一'])

    await openMenu(page, 0)
    await expect(menuItem(page, '段落')).toHaveAttribute('aria-checked', 'true')
    await menuItem(page, '標題 2').click()
    await expect(editor(page).locator('h2')).toHaveText('一')
  })
})

test.describe('dragging', () => {
  test('shows where it goes, and moves there in one undo step', async ({ page }) => {
    await paragraphs(page, '一', '二', '三')
    await drag(page, 0, box => box.y + box.height - 2, 2, async () => {
      await expect(page.locator('.hlx-block-drop-line')).toBeVisible()
      await page.mouse.up()
    })
    await expect.poll(() => lines(page)).toEqual(['二', '三', '一'])
    await expect(page.locator('.hlx-block-drop-line')).toHaveCount(0)

    await editor(page).click()
    await undo(page)
    await expect.poll(() => lines(page)).toEqual(['一', '二', '三'])
  })

  test('changes nothing when dropped in place or outside', async ({ page }) => {
    await paragraphs(page, '一', '二')
    const before = await lines(page)
    await drag(page, 0, box => box.y + 1, 0, async () => {
      await page.mouse.up()
    })
    await expect.poll(() => lines(page)).toEqual(before)

    await drag(page, 0, () => 2000, 1, async () => {
      await page.mouse.move(2, 2)
      await expect(page.locator('.hlx-block-drop-line')).toHaveCount(0)
      await page.mouse.up()
    })
    await expect.poll(() => lines(page)).toEqual(before)
  })

  test('keeps a block above the footnotes', async ({ page, browserName }) => {
    // Known: WebKit sends no drop over the notes, so the block just stays where it was.
    test.fixme(browserName === 'webkit', 'no drop event over the footnote section in WebKit')
    await page.evaluate(() => navigator.clipboard.writeText('甲[^1]\n\n乙\n\n[^1]: 內容'))
    await page.keyboard.press('ControlOrMeta+V')
    await expect(page.locator('.hlx-footnotes')).toBeVisible()
    const notes = (await page.locator('.hlx-footnotes').boundingBox())!
    await drag(page, 0, () => notes.y + notes.height - 2, 1, async () => {
      await page.mouse.up()
    })
    await expect.poll(() => editor(page).locator('> p').allTextContents()).toEqual(['乙', '甲1'])
    await expect(editor(page).locator('.hlx-footnote-host ~ p')).toHaveCount(0)
  })
})

test.describe('adding a line', () => {
  test('adds below with the caret in it, reusing an empty one', async ({ page }) => {
    await paragraphs(page, '一', '二')
    await line(page, 0).hover()
    await add(page).click()
    await page.keyboard.type('新')
    await expect.poll(() => lines(page)).toEqual(['一', '新', '二'])
  })
})

test.describe('shortcuts', () => {
  test('moves and duplicates the block at the caret', async ({ page }) => {
    await paragraphs(page, '一', '二', '三')
    await page.keyboard.press('ControlOrMeta+Shift+ArrowUp')
    await expect.poll(() => lines(page)).toEqual(['一', '三', '二'])
    await page.keyboard.type('!')
    await expect.poll(() => lines(page)).toEqual(['一', '三!', '二'])
    await page.keyboard.press('ControlOrMeta+Shift+ArrowDown')
    await expect.poll(() => lines(page)).toEqual(['一', '二', '三!'])
    await page.keyboard.press('ControlOrMeta+D')
    await expect.poll(() => lines(page)).toEqual(['一', '二', '三!', '三!'])
    await undo(page)
    await expect.poll(() => lines(page)).toEqual(['一', '二', '三!'])
  })

  test('moves the selected blocks together', async ({ page }) => {
    await paragraphs(page, '一', '二', '三')
    await page.keyboard.press('Shift+ArrowUp')
    await page.keyboard.press('ControlOrMeta+Shift+ArrowUp')
    await expect.poll(() => lines(page)).toEqual(['二', '三', '一'])
    expect(await page.evaluate(() => getSelection()!.toString())).not.toBe('')
  })
})
