import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { setTheme } from './theme'

const editor = (page: Page) => page.locator('.hlx-content').first()

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

/** The computed look of an element: what a reader would compare by eye. */
function look(locator: Locator, names: string[]) {
  return locator.evaluate((element, list) => {
    const style = getComputedStyle(element)
    return Object.fromEntries(list.map(name => [
      name,
      style.getPropertyValue(name),
    ]))
  }, names)
}
const SURFACE = ['border-top-left-radius', 'box-shadow', 'border-top-width']
const FIELD = [
  'border-top-width',
  'border-top-left-radius',
  'box-shadow',
  'height',
  'background-color',
]
const PRIMARY = [
  'background-color',
  'color',
  'border-top-left-radius',
  'height',
]

async function galleryDialog(page: Page) {
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入程式碼片段、圖庫和對話' }).click()
  const gallery = editor(page).locator('.hlx-block-editor').nth(1)
  await gallery.locator('img').first().click()
  await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
  const dialog = page.locator('.hlx-block-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}
async function imageDialog(page: Page) {
  await page.getByRole('button', { name: '插入' }).click()
  await page.getByRole('menuitem', { name: '圖片' }).click()
  const dialog = page.locator('.hlx-image-dialog')
  await expect(dialog).toBeVisible()
  return dialog
}
async function chartPanel(page: Page) {
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入圖表' }).click()
  await editor(page).locator('.hlx-chart').first().click()
  await page.keyboard.press('Enter')
  const panel = page.locator('.hlx-chart-popover')
  await expect(panel).toBeVisible()
  return panel
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`in ${scheme} mode`, () => {
    test.beforeEach(async ({ page }) => {
      if (scheme === 'dark') {
        await setTheme(page, '深色')
        await editor(page).click()
      }
    })

    test('dialogs and the chart panel share their frame, fields and primary button', async ({ page }) => {
      const gallery = await galleryDialog(page)
      const galleryLook = {
        frame: await look(gallery, SURFACE),
        field: await look(gallery.locator('input[type="text"], input:not([type])').first(), FIELD),
        primary: await look(gallery.getByRole('button', { name: '儲存' }), PRIMARY),
        head: await look(gallery.locator('.hlx-dialog-head'), ['border-bottom-width', 'border-bottom-color']),
      }
      await gallery.getByRole('button', { name: '取消' }).click()
      await expect(gallery).toHaveCount(0)

      const image = await imageDialog(page)
      const imageLook = {
        frame: await look(image, SURFACE),
        // The drop zone has the focus, so the address field has no focus ring.
        field: await look(image.locator('input[name="src"]'), FIELD),
        primary: await look(image.locator('button[data-primary]'), PRIMARY),
        head: await look(image.locator('.hlx-dialog-head'), ['border-bottom-width', 'border-bottom-color']),
      }
      await page.keyboard.press('Escape')
      await expect(image).toHaveCount(0)

      const panel = await chartPanel(page)
      const panelLook = {
        frame: await look(panel, SURFACE),
        field: await look(panel.locator('[data-field="title"]'), FIELD),
      }

      expect(imageLook).toEqual(galleryLook)
      expect(panelLook.frame).toEqual(galleryLook.frame)
      expect(panelLook.field).toEqual(galleryLook.field)
      expect(galleryLook.frame['border-top-width']).toBe('0px')
      expect(galleryLook.field['border-top-width']).toBe('0px')
      expect(galleryLook.head['border-bottom-width']).toBe('1px')
      // The primary button takes the text's color.
      const text = await editor(page).evaluate(element => getComputedStyle(element).color)
      expect(galleryLook.primary['background-color']).toBe(text)
    })

    test('menus, toolbars and panels have the same corners and shadow', async ({ page }) => {
      await page.keyboard.type('/')
      const slash = page.locator('.hlx-slash-menu')
      await expect(slash).toBeVisible()
      const slashLook = await look(slash, SURFACE)
      await page.keyboard.press('Escape')

      await page.getByRole('button', { name: '插入' }).click()
      const insert = page.locator('.hlx-fixed-toolbar-menu')
      await expect(insert).toBeVisible()
      const insertLook = await look(insert, SURFACE)
      await page.keyboard.press('Escape')

      const panel = await chartPanel(page)
      const panelLook = await look(panel, SURFACE)
      const toolbarLook = await look(page.locator('.hlx-chart-toolbar'), SURFACE)

      expect(insertLook).toEqual(slashLook)
      expect(panelLook).toEqual(slashLook)
      expect(toolbarLook).toEqual(slashLook)
      expect(slashLook['border-top-left-radius']).toBe('12px')
    })

    test('toolbars look alike on every block, the chart\'s included', async ({ page }) => {
      const toolbar = page.locator('.hlx-block-toolbar')
      const lookOf = async () => ({
        bar: await look(toolbar, ['border-top-left-radius', 'box-shadow', 'background-color']),
        button: await look(toolbar.locator('button').first(), ['height', 'font-size', 'border-top-left-radius']),
      })
      // 測試用文件 start closed.
      await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
        element.open = true
      })
      await page.getByRole('button', { name: '載入程式碼片段、圖庫和對話' }).click()
      const blocks = editor(page).locator('.hlx-block-editor')
      // Once highlighted: until then the code's lines are swapped for colored ones, which can lose a click.
      await expect(blocks.nth(0).locator('.hlx-code-body:visible')).toHaveAttribute('data-highlighted', '')
      const seen = []
      for (const [index, part] of [
        [0, '.hlx-code-body'],
        [1, 'img'],
        [4, '.hlx-chat-row'],
      ] as const) {
        await blocks.nth(index).locator(part).first().click()
        await expect(toolbar).toBeVisible()
        seen.push(await lookOf())
      }
      // 測試用文件 start closed.
      await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
        element.open = true
      })
      await page.getByRole('button', { name: '載入圖表' }).click()
      await editor(page).locator('.hlx-chart').first().click()
      await expect(toolbar).toBeVisible()
      seen.push(await lookOf())
      expect(seen.every(item => JSON.stringify(item) === JSON.stringify(seen[0]))).toBe(true)
      expect(seen[0].button.height).toBe('28px')
      expect(seen[0].bar['border-top-left-radius']).toBe('12px')
    })
  })
}

/*
 * A control's ring is a shadow drawn outside it. In a box that scrolls, a control flush with the
 * edge would have its ring cut off. Each control is focused from the keyboard, so it shows the
 * ring it would show a reader, and its outer shadow is checked against the box it scrolls in.
 */
async function clippedRings(root: Locator) {
  return root.evaluate((element) => {
    const reach = (shadow: string) => shadow === 'none'
      ? 0
      : Math.max(0, ...shadow.split(/,(?![^(]*\))/).filter(part => !part.includes('inset')).map((part) => {
          const lengths = [
            ...part.matchAll(/(-?[\d.]+)px/g),
          ].map(match => Number(match[1]))
          const [x = 0, y = 0, blur = 0, spread = 0] = lengths
          return Math.max(Math.abs(x), Math.abs(y)) + spread + (blur > 0
            ? 0
            : 0)
        }))
    const found: string[] = []
    for (const control of element.querySelectorAll<HTMLElement>('input:not([type="hidden"], [type="file"], [type="radio"], [type="checkbox"]), select, textarea, button, [role="tab"]')) {
      const size = control.getBoundingClientRect()
      if (!size.width || !size.height || (control as HTMLButtonElement).disabled)
        continue
      // As a keyboard user gets there: a box that scrolls brings the control into view.
      control.focus()
      const box = control.getBoundingClientRect()
      const ring = Math.max(reach(getComputedStyle(control).boxShadow))
      control.blur()
      if (!ring)
        continue
      let parent = control.parentElement
      while (parent && parent !== document.body) {
        const style = getComputedStyle(parent)
        if (style.overflowX !== 'visible' || style.overflowY !== 'visible')
          break
        parent = parent.parentElement
      }
      if (!parent || parent === document.body)
        continue
      const outer = parent.getBoundingClientRect()
      const left = outer.left + parent.clientLeft
      const top = outer.top + parent.clientTop
      const right = left + parent.clientWidth
      const bottom = top + parent.clientHeight
      const sides = [
        box.left - ring < left - 0.5 && 'left',
        box.right + ring > right + 0.5 && 'right',
        box.top >= top - 1 && box.top - ring < top - 0.5 && 'top',
        box.bottom <= bottom + 1 && box.bottom + ring > bottom + 0.5 && 'bottom',
      ].filter(Boolean)
      if (sides.length)
        found.push(`${control.getAttribute('aria-label') || control.getAttribute('data-field') || control.textContent!.trim()} (${sides.join(', ')})`)
    }
    return found
  })
}

test.describe('rings are never cut off', () => {
  test('in every block dialog', async ({ page }) => {
    const loaded: [string, number][] = [
      ['載入程式碼片段、圖庫和對話', 0],
      ['載入程式碼片段、圖庫和對話', 1],
      ['載入程式碼片段、圖庫和對話', 4],
    ]
    const cut: Record<string, string[]> = {}
    for (const [sample, index] of loaded) {
      // 測試用文件 start closed.
      await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
        element.open = true
      })
      await page.getByRole('button', { name: sample }).click()
      const block = editor(page).locator('.hlx-block-editor').nth(index)
      await block.click()
      await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
      const dialog = page.locator('.hlx-block-dialog')
      await expect(dialog).toBeVisible()
      // A Tab first, so focused buttons show the ring a keyboard user sees.
      await page.keyboard.press('Tab')
      const title = (await dialog.locator('.hlx-block-dialog-title').textContent())!.trim()
      cut[title] = await clippedRings(dialog)
      await dialog.getByRole('button', { name: '取消' }).click()
      await expect(dialog).toHaveCount(0)
    }
    expect(cut).toEqual(Object.fromEntries(Object.keys(cut).map(title => [title, []])))
  })

  test('in every block panel', async ({ page }) => {
    const loaded: [string, string][] = [
      ['載入投票', '.hlx-poll'],
      ['載入連結卡片和繞排圖片', '.hlx-link-card'],
      ['載入連結卡片和繞排圖片', 'img.hlx-image'],
    ]
    const cut: Record<string, string[]> = {}
    for (const [sample, target] of loaded) {
      // 測試用文件 start closed.
      await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
        element.open = true
      })
      await page.getByRole('button', { name: sample }).click()
      await editor(page).locator(target).first().click()
      await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
      const panel = page.locator('.hlx-block-panel')
      await expect(panel).toBeVisible()
      // A Tab first, so focused buttons show the ring a keyboard user sees.
      await page.keyboard.press('Tab')
      const title = (await panel.getAttribute('aria-label'))!
      cut[title] = await clippedRings(panel)
      await page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' }).click()
      await expect(panel).toHaveCount(0)
    }
    expect(cut).toEqual({ 投票: [], 連結卡片: [], 圖片: [] })
  })

  test('in the chart panel', async ({ page }) => {
    const panel = await chartPanel(page)
    const cut: Record<string, string[]> = {}
    for (const name of ['設定', '資料', '樣式']) {
      await panel.getByRole('tab', { name }).click()
      await page.keyboard.press('Tab')
      cut[name] = await clippedRings(panel)
    }
    expect(cut).toEqual({ 設定: [], 資料: [], 樣式: [] })
  })
})
