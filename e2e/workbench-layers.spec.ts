import { expect, test } from '@playwright/test'

/* The bar on top of the workbench stays under what floats over the editor. */

test('leaves a block\'s toolbar on top of it, and clickable', async ({ page }) => {
  await page.goto('/editor')
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入程式碼片段、圖庫和對話' }).click()
  const block = page.locator('.hlx-content').first().locator('.hlx-block-editor').first().locator('.hlx-code-body:visible')
  await block.click()
  const edit = page.locator('.hlx-block-toolbar').getByRole('button', { name: '編輯' })
  await expect(edit).toBeVisible()

  // Scrolled so that the block's toolbar is inside the bar.
  await edit.evaluate(button => window.scrollBy(0, button.getBoundingClientRect().top - 8))
  await expect.poll(async () => {
    const { y } = (await edit.boundingBox())!
    return y >= 0 && y < 44
  }).toBe(true)

  const onTop = await edit.evaluate((button) => {
    const box = button.getBoundingClientRect()
    return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
  })
  expect(onTop).toBe(true)
  await edit.click({ timeout: 3000 })
  await expect(page.locator('.hlx-block-dialog')).toBeVisible()
})

test('stays over the content and the editor\'s toolbar', async ({ page }) => {
  await page.goto('/editor')
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入圖表' }).click()
  await page.evaluate(() => window.scrollTo(0, 400))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const covered = await page.locator('.wb-bar').evaluate((bar) => {
    const box = bar.getBoundingClientRect()
    return bar.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2))
  })
  expect(covered).toBe(true)
})
