import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { setTheme } from './theme'

const editor = (page: Page) => page.locator('.hlx-content').first()
const panel = (page: Page) => page.locator('.hlx-chart-popover')
const toolbar = (page: Page) => page.locator('.hlx-chart-toolbar')
const charts = (page: Page) => page.locator('.hlx-renderer:visible .hlx-chart')

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

test.describe('the chart sample', () => {
  test.beforeEach(async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入圖表' }).click()
    await page.getByRole('tab', { name: '預覽' }).click()
    await expect(charts(page)).toHaveCount(7)
  })

  test('draws each kind, wide when there is room', async ({ page }) => {
    for (const [index, type] of ['bar', 'line', 'area', 'pie'].entries()) {
      const chart = charts(page).nth(index)
      await expect(chart).toHaveAttribute('data-type', type)
      await expect(chart.locator('svg[data-size="wide"]')).toBeVisible()
      await expect(chart.locator('svg[data-size="compact"]')).toBeHidden()
    }
    expect(await charts(page).nth(0).locator('svg[data-size="wide"] rect.hlx-chart-mark').count()).toBeGreaterThan(4)
    expect(await charts(page).nth(3).locator('svg[data-size="wide"] path.hlx-chart-mark').count()).toBe(4)
  })

  test('switches to the compact drawing in a narrow space', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 })
    const chart = charts(page).first()
    await expect(chart.locator('svg[data-size="compact"]')).toBeVisible()
    await expect(chart.locator('svg[data-size="wide"]')).toBeHidden()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })

  test('changes colors with the color scheme', async ({ page }) => {
    const bar = charts(page).first().locator('svg[data-size="wide"] rect.hlx-chart-mark').first()
    const light = await bar.evaluate(element => getComputedStyle(element).fill)
    await setTheme(page, '深色')
    await expect.poll(() => bar.evaluate(element => getComputedStyle(element).fill)).not.toBe(light)
  })

  test('keeps the numbers for screen readers', async ({ page }) => {
    const table = charts(page).first().locator('table.hlx-chart-table')
    await expect(table).toBeAttached()
    await expect(table).toContainText('1.2k')
  })
})

async function insertChart(page: Page) {
  await page.keyboard.type('/圖表')
  await page.locator('.hlx-slash-menu [role="option"]', { hasText: /^圖表/ }).first().click()
  await expect(panel(page).locator('.hlx-chart-panel')).toBeVisible()
}
/** The spec as the document holds it, read from the raw data panel. */
async function storedSpec(page: Page) {
  await toolbar(page).getByRole('button', { name: '原始資料' }).click()
  const spec = JSON.parse(await panel(page).locator('[data-field="spec"]').inputValue())
  await toolbar(page).getByRole('button', { name: '原始資料' }).click()
  return spec
}

test('inserts an example chart picked, with its panel beside it, and takes it back with one undo', async ({ page }) => {
  await insertChart(page)
  await expect(page.locator('.hlx-block-dialog')).toHaveCount(0)
  await expect(editor(page).locator('.hlx-chart-title')).toHaveText('標題')
  await expect(toolbar(page)).toBeVisible()
  await expect(panel(page).getByRole('tab', { name: '設定' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor(page).locator('.hlx-chart')).toHaveCount(0)
})

test('writes a chart in the raw data, with problems listed until it is valid', async ({ page }) => {
  await insertChart(page)
  await toolbar(page).getByRole('button', { name: '原始資料' }).click()
  const source = panel(page).locator('[data-field="spec"]')
  await expect(source).toBeFocused()
  await source.fill('{ "type": "radar" }')
  await expect(panel(page).locator('[role="alert"]')).toContainText('type')
  await expect(panel(page).getByRole('button', { name: '套用' })).toBeDisabled()
  await source.fill(JSON.stringify({
    version: 1,
    type: 'pie',
    title: '我的圓餅',
    x: 'k',
    series: [
      { key: 'v' },
    ],
    data: [
      { k: '甲', v: 1 },
      { k: '乙', v: 3 },
    ],
  }))
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(editor(page).locator('.hlx-chart-title')).toHaveText('我的圓餅')
  await expect(editor(page).locator('.hlx-chart svg[data-size="wide"] path.hlx-chart-mark')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(editor(page).locator('.hlx-chart-title')).toHaveText('標題')
})

test.describe('the chart form', () => {
  test.beforeEach(async ({ page }) => {
    await insertChart(page)
  })

  test('builds a chart without writing JSON', async ({ page }) => {
    await panel(page).getByRole('radio', { name: '折線' }).click()
    await panel(page).locator('[data-field="title"]').fill('表單做的圖')
    await panel(page).locator('[data-field="series-label"]').first().fill('第一組')
    await panel(page).getByRole('tab', { name: '資料' }).click()
    const header = panel(page).locator('[data-field="header"][data-key="month"]')
    await header.fill('月份')
    await page.keyboard.press('Tab')
    const cell = panel(page).locator('[data-field="cell"][data-row="0"][data-key="a"]')
    await cell.fill('1,500')
    await panel(page).getByRole('button', { name: '新增一列' }).click()
    await panel(page).locator('[data-field="cell"][data-row="3"][data-key="month"]').fill('四月')
    await panel(page).locator('[data-field="cell"][data-row="3"][data-key="a"]').fill('abc')
    await expect(panel(page).locator('[data-field="cell"][data-row="3"][data-key="a"]')).toHaveAttribute('data-invalid', 'true')
    await page.keyboard.press('Tab')
    await expect(panel(page).locator('[data-field="cell"][data-row="3"][data-key="a"]')).toHaveValue('')
    await panel(page).getByRole('tab', { name: '樣式' }).click()
    await panel(page).locator('[data-field="unit"]').fill('人')
    await page.keyboard.press('Tab')
    await expect(editor(page).locator('.hlx-chart-title')).toHaveText('表單做的圖')
    await expect(editor(page).locator('.hlx-chart svg[data-size="wide"]')).toContainText('單位：人')
    const spec = await storedSpec(page)
    expect(spec).toMatchObject({
      type: 'line',
      title: '表單做的圖',
      x: 'month',
      xLabel: '月份',
      format: { unit: '人' },
    })
    expect(spec.series[0].label).toBe('第一組')
    expect(spec.data[0]).toMatchObject({ month: '一月', a: 1500 })
    expect(spec.data[3]).toMatchObject({ month: '四月', a: null })
  })

  test('takes data pasted from a spreadsheet', async ({ page, browserName }) => {
    test.skip(browserName === 'firefox', 'Firefox empties the data of a paste event made by script; real pasting is checked by hand')
    await panel(page).getByRole('tab', { name: '資料' }).click()
    await panel(page).locator('[data-field="cell"]').first().focus()
    // What a spreadsheet puts on the clipboard: tab-separated rows.
    await page.evaluate(() => {
      const clipboard = new DataTransfer()
      clipboard.setData('text/plain', '城市\t人口\t面積\n台北\t2,500,000\t271\n高雄\t2,700,000\tn/a\n')
      document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }))
    })
    await expect(panel(page).locator('[data-field="header"]')).toHaveCount(3)
    await expect(panel(page).locator('[data-field="cell"][data-row="1"][data-key="人口"]')).toHaveValue('2700000')
    await expect(panel(page).locator('[role="status"]')).toContainText('n/a')
    await expect(editor(page).locator('.hlx-chart svg[data-size="wide"] rect.hlx-chart-mark')).toHaveCount(3)
  })
})

test.describe('numbers readers can trust', () => {
  test.beforeEach(async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入圖表' }).click()
    await page.getByRole('tab', { name: '預覽' }).click()
    await expect(charts(page)).toHaveCount(7)
  })

  test('a pie with eight rows shows five and the rest, adding up to 100%', async ({ page }) => {
    const pie = charts(page).nth(4)
    await expect(pie.locator('.hlx-chart-error')).toHaveCount(0)
    await expect(pie.locator('svg[data-size="wide"] path.hlx-chart-mark')).toHaveCount(6)
    await expect(pie.locator('.hlx-chart-legend')).toContainText('其他')
    const shares = await pie.locator('svg[data-size="wide"] text.hlx-chart-slice-label').allTextContents()
    expect(shares.reduce((sum, share) => sum + Number.parseInt(share), 0)).toBeLessThanOrEqual(100)
    await expect(pie.locator('table.hlx-chart-table tbody tr')).toHaveCount(8)
  })

  test('a long unit sits above the axis, and a short one on every tick', async ({ page }) => {
    const bar = charts(page).nth(5)
    await expect(bar.locator('svg[data-size="wide"]')).toContainText('單位：ms')
    const ticks = await bar.locator('svg[data-size="wide"] text.hlx-chart-tick').allTextContents()
    expect(ticks.filter(tick => tick.includes('ms'))).toEqual(['單位：ms'])
    const area = charts(page).nth(2)
    const percents = await area.locator('svg[data-size="wide"] text.hlx-chart-tick').allTextContents()
    expect(percents.every(tick => tick.endsWith('%'))).toBe(true)
  })

  test('the axis keeps its labels in a narrow space', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 900 })
    const area = charts(page).nth(2).locator('svg[data-size="compact"]')
    await area.scrollIntoViewIfNeeded()
    const svg = (await area.boundingBox())!
    const ticks = await area.locator('text.hlx-chart-tick').evaluateAll(items => items.map(item => item.getBoundingClientRect().left))
    expect(Math.min(...ticks)).toBeGreaterThanOrEqual(svg.x - 1)
  })
})

test.describe('the chart form, tidied', () => {
  test.beforeEach(async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入圖表' }).click()
    await editor(page).locator('.hlx-chart').first().click()
    await page.keyboard.press('Enter')
    await expect(panel(page).locator('.hlx-chart-panel')).toBeVisible()
  })

  test('picks a color from the swatches with the mouse and the keyboard', async ({ page }) => {
    const swatch = panel(page).locator('[data-field="series-swatch"][data-series="0"]')
    await swatch.click()
    await expect(swatch).toHaveAttribute('aria-expanded', 'true')
    await panel(page).getByRole('radiogroup', { name: '系列 1 的顏色' }).getByLabel('顏色 3').click({ force: true })
    await expect(swatch).toBeFocused()
    await expect(panel(page).getByRole('radiogroup', { name: '系列 1 的顏色' })).toHaveCount(0)
    // From the keyboard: open it again, and move to the next color with an arrow.
    await page.keyboard.press('Enter')
    await expect(panel(page).getByLabel('顏色 3')).toBeChecked()
    await panel(page).getByLabel('顏色 3').focus()
    await page.keyboard.press('ArrowRight')
    await expect(swatch).toBeFocused()
    expect((await storedSpec(page)).series[0].color).toBe(4)
  })

  test('a pie asks for one value field, and keeps the other series', async ({ page }) => {
    await panel(page).getByRole('radio', { name: '圓餅' }).click()
    await expect(panel(page).locator('[data-field="series-label"]')).toHaveCount(0)
    await expect(panel(page)).toContainText('保留')
    await panel(page).getByRole('tab', { name: '資料' }).click()
    await expect(panel(page).locator('[data-field="header"]')).toHaveCount(2)
    await expect(panel(page).locator('th[data-category]')).toContainText('分類')
    await expect(editor(page).locator('.hlx-chart').first().locator('svg[data-size="wide"] path.hlx-chart-mark').first()).not.toHaveAttribute('data-muted', 'true')
  })

  test('explains a bad axis range and keeps it out', async ({ page }) => {
    await panel(page).getByRole('tab', { name: '樣式' }).click()
    await panel(page).locator('[data-field="y-min"]').fill('abc')
    await expect(panel(page).locator('.hlx-chart-form [role="alert"]')).toContainText('數字')
    await page.keyboard.press('Tab')
    await expect(panel(page).locator('[data-field="y-min"]')).toHaveValue('')
    await expect(panel(page).locator('.hlx-chart-form [role="alert"]')).toHaveCount(0)
  })
})

test.describe('editing in place', () => {
  test.beforeEach(async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入圖表' }).click()
  })

  test('shows each edit in the chart at once, keeps the chart in view, and undoes it in one step', async ({ page }) => {
    // With room beside the chart; without it, the panel goes over the chart's top.
    await page.setViewportSize({ width: 1900, height: 900 })
    const chart = editor(page).locator('.hlx-chart').first()
    await chart.click()
    await toolbar(page).getByRole('button', { name: '編輯圖表' }).click()
    const title = panel(page).locator('[data-field="title"]')
    await title.fill('')
    await title.pressSequentially('新的標題')
    await expect(chart.locator('.hlx-chart-title')).toHaveText('新的標題')
    // Beside or below the chart where there is room, so the edit can be seen.
    const [panelBox, chartBox] = [await panel(page).boundingBox(), await chart.locator('svg:visible').boundingBox()]
    expect(panelBox!.x >= chartBox!.x + chartBox!.width - 1 || panelBox!.y >= chartBox!.y + chartBox!.height - 1).toBe(true)
    await page.keyboard.press('Escape')
    await expect(panel(page)).toHaveCount(0)
    await expect(toolbar(page)).toBeVisible()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(chart.locator('.hlx-chart-title')).toHaveText('首次繪製的提交次數')
  })

  test('closes the panel on a press elsewhere', async ({ page }) => {
    await editor(page).locator('.hlx-chart').first().click()
    await page.keyboard.press('Enter')
    await expect(panel(page)).toBeVisible()
    await page.locator('h1, header').first().click()
    await expect(panel(page)).toHaveCount(0)
  })

  test('shows the data from the toolbar', async ({ page }) => {
    const chart = editor(page).locator('.hlx-chart').first()
    await chart.click()
    await expect(chart.locator('.hlx-chart-toggle')).toHaveCount(0)
    await toolbar(page).getByRole('button', { name: '檢視資料' }).click()
    await expect(chart.locator('table.hlx-chart-table')).toBeVisible()
    await toolbar(page).getByRole('button', { name: '檢視圖表' }).click()
    await expect(chart.locator('svg[data-size="wide"]')).toBeVisible()
  })

  test('keeps the panel on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await editor(page).locator('.hlx-chart').first().click()
    await page.keyboard.press('Enter')
    const box = (await panel(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(390)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  })
})

test.describe('readers', () => {
  test('switch a chart to its data and back', async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入圖表' }).click()
    await page.getByRole('tab', { name: '預覽' }).click()
    const chart = charts(page).first()
    await chart.getByRole('button', { name: '檢視資料' }).click()
    await expect(chart.locator('table.hlx-chart-table')).toBeVisible()
    await expect(chart.locator('table.hlx-chart-table')).toContainText('1.2k')
    await expect(chart.locator('.hlx-chart-plot')).toHaveCount(0)
    await chart.getByRole('button', { name: '檢視圖表' }).click()
    await expect(chart.locator('svg[data-size="wide"]')).toBeVisible()
  })

  test('see a chart with no data say so', async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入圖表' }).click()
    await page.getByRole('tab', { name: '預覽' }).click()
    const empty = charts(page).nth(6)
    await expect(empty.locator('.hlx-chart-title')).toHaveText('下個月的投票數')
    await expect(empty.locator('.hlx-chart-empty')).toHaveText('還沒有資料')
    await expect(empty.locator('svg')).toHaveCount(0)
    await expect(empty.getByRole('button', { name: '檢視資料' })).toHaveCount(0)
  })
})

test.describe('the panel, laid out', () => {
  test.beforeEach(async ({ page }) => {
    // 測試用文件 start closed.
    await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
      element.open = true
    })
    await page.getByRole('button', { name: '載入圖表' }).click()
    await editor(page).locator('.hlx-chart').first().click()
    await page.keyboard.press('Enter')
    await expect(panel(page).locator('.hlx-chart-panel')).toBeVisible()
  })

  test('has a head, tabs filling the width, and keeps to its size', async ({ page }) => {
    await expect(panel(page).locator('.hlx-chart-panel-head')).toContainText('編輯圖表')
    const box = (await panel(page).boundingBox())!
    expect(Math.round(box.width)).toBe(400)
    expect(box.height).toBeLessThanOrEqual(520)
    const tabs = (await panel(page).locator('.hlx-chart-tabs').boundingBox())!
    expect(tabs.width).toBeGreaterThan(box.width - 32)
    // Inputs are drawn by a shadow, not a border.
    const title = panel(page).locator('[data-field="title"]')
    expect(await title.evaluate(element => getComputedStyle(element).borderTopWidth)).toBe('0px')
    expect(await title.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none')
  })

  test('switches the type with the arrow keys', async ({ page }) => {
    const bar = panel(page).getByRole('radio', { name: '長條' })
    await bar.focus()
    await page.keyboard.press('ArrowRight')
    await expect(panel(page).getByRole('radio', { name: '折線' })).toBeChecked()
    await expect(editor(page).locator('.hlx-chart').first()).toHaveAttribute('data-type', 'line')
  })

  test('edits the data in a framed grid that scrolls, and adds a series below it', async ({ page }) => {
    await panel(page).getByRole('tab', { name: '資料' }).click()
    const frame = panel(page).locator('.hlx-chart-data-frame')
    const cell = frame.locator('[data-field="cell"][data-row="0"][data-key="before"]')
    expect(await cell.evaluate(element => getComputedStyle(element).textAlign)).toBe('right')
    await cell.fill('99')
    await page.keyboard.press('Tab')
    await expect(editor(page).locator('.hlx-chart').first().locator('table.hlx-chart-table')).toContainText('99')
    for (let i = 0; i < 12; i++)
      await panel(page).getByRole('button', { name: '新增一列' }).click()
    const box = (await frame.boundingBox())!
    expect(box.height).toBeLessThanOrEqual(302)
    expect(await frame.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
    await panel(page).locator('.hlx-chart-data-actions').getByRole('button', { name: '新增系列' }).click()
    await expect(frame.locator('thead [data-field="header"]')).toHaveCount(4)
  })

  test('copies the raw data from its head', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Reading the clipboard back needs a permission only Chromium grants here')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.keyboard.press('Escape')
    await toolbar(page).getByRole('button', { name: '原始資料' }).click()
    await panel(page).locator('.hlx-chart-panel-head').getByRole('button', { name: '複製' }).click()
    await expect(panel(page).getByRole('status')).toHaveText('已複製')
    expect(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())).title).toBe('首次繪製的提交次數')
  })
})
