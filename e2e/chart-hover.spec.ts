import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

const charts = (page: Page) => page.locator('.hlx-renderer:visible .hlx-chart')
const tip = (page: Page) => page.locator('.hlx-renderer:visible .hlx-chart-tooltip')

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
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入圖表' }).click()
  await page.getByRole('tab', { name: '預覽' }).click()
  await expect(charts(page)).toHaveCount(7)
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

/** Moves to the middle of category `index` of a chart, in whichever drawing shows. */
async function pointAt(page: Page, chart: number, index: number) {
  await charts(page).nth(chart).scrollIntoViewIfNeeded()
  const svg = charts(page).nth(chart).locator('svg.hlx-chart-svg:visible')
  // The marks of one category share its band: aim at the middle of the first one's.
  const x = await svg.evaluate((element, i) => {
    const count = element.closest('.hlx-chart')!.querySelectorAll('table.hlx-chart-table tbody tr').length
    const grid = element.querySelector('line.hlx-chart-grid, line.hlx-chart-zero') as SVGLineElement
    const left = grid.x1.baseVal.value
    const right = grid.x2.baseVal.value
    const box = element.getBoundingClientRect()
    const scale = box.width / (element as SVGSVGElement).viewBox.baseVal.width
    return box.left + (left + (right - left) * (i + 0.5) / count) * scale
  }, index)
  const box = (await svg.boundingBox())!
  await page.mouse.move(x, box.y + box.height / 2)
}

test('shows a bar category\'s values, and hides when the pointer leaves', async ({ page }) => {
  await pointAt(page, 0, 0)
  await expect(tip(page)).toBeVisible()
  await expect(tip(page)).toContainText('編輯器')
  await expect(tip(page)).toContainText('2.4k')
  await expect(charts(page).first().locator('.hlx-chart-hover-band')).toHaveCount(1)
  await page.mouse.move(5, 5)
  await expect(tip(page)).toHaveCount(0)
})

test('puts the tip on the left near the right edge, inside the chart', async ({ page }) => {
  await pointAt(page, 0, 3)
  await expect(tip(page)).toHaveAttribute('data-side', 'left')
  const chart = (await charts(page).first().boundingBox())!
  const box = (await tip(page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(chart.x - 1)
  expect(box.x + box.width).toBeLessThanOrEqual(chart.x + chart.width + 1)
})

test('follows a line with a guide, sorted, in a narrow space too', async ({ page }) => {
  await pointAt(page, 1, 4)
  await expect(tip(page)).toContainText('五月')
  await expect(charts(page).nth(1).locator('.hlx-chart-hover-guide')).toHaveCount(1)
  const labels = await tip(page).locator('.hlx-chart-tooltip-label').allTextContents()
  expect(labels).toEqual(['網頁', 'RSS'])
  await page.mouse.move(5, 5)
  await page.setViewportSize({ width: 420, height: 900 })
  await charts(page).nth(1).scrollIntoViewIfNeeded()
  await expect(charts(page).nth(1).locator('svg[data-size="compact"]')).toBeVisible()
  await pointAt(page, 1, 0)
  await expect(tip(page)).toContainText('一月')
})

test('shows the slice in a donut\'s middle', async ({ page }) => {
  const donut = charts(page).nth(3)
  await expect(donut.locator('svg[data-size="wide"] .hlx-chart-center')).toContainText('總計')
  await donut.scrollIntoViewIfNeeded()
  // Where a reader points: at the slice's percentage, which sits on it.
  // Measured in the page: Playwright's box for SVG text is off in WebKit.
  const label = await donut.locator('svg[data-size="wide"] text.hlx-chart-slice-label', { hasText: '21%' }).evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  await page.mouse.move(label.x, label.y)
  await expect(donut.locator('svg[data-size="wide"] .hlx-chart-center')).toContainText('Safari · 21%')
  await expect(donut.locator('svg[data-size="wide"] path[data-index="0"]')).toHaveAttribute('data-dimmed', 'true')
})

test('steps through categories with the keyboard', async ({ page }) => {
  const plot = charts(page).first().locator('.hlx-chart-plot')
  await plot.focus()
  await page.keyboard.press('ArrowRight')
  await expect(tip(page)).toContainText('編輯器')
  await page.keyboard.press('ArrowRight')
  await expect(tip(page)).toContainText('工具列')
  await expect(plot.locator('[aria-live="polite"]')).toContainText('工具列')
  await page.keyboard.press('Escape')
  await expect(tip(page)).toHaveCount(0)
})

test.describe('on a touch screen', () => {
  test.use({ hasTouch: true })
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no touch emulation in Playwright')

  test('shows on a tap and hides on a tap elsewhere', async ({ page }) => {
    const svg = charts(page).first().locator('svg.hlx-chart-svg:visible')
    const box = (await svg.boundingBox())!
    await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height / 2)
    await expect(tip(page)).toBeVisible()
    await page.touchscreen.tap(5, 5)
    await expect(tip(page)).toHaveCount(0)
  })
})

test('says what the merged slice holds', async ({ page }) => {
  const pie = charts(page).nth(4)
  await pie.scrollIntoViewIfNeeded()
  const label = await pie.locator('svg[data-size="wide"] text.hlx-chart-slice-label').last().evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  await page.mouse.move(label.x, label.y)
  await expect(tip(page)).toContainText('其他（3 項）')
})
