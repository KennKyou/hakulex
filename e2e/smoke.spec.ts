import { expect, test } from '@playwright/test'

test('the demo opens and accepts typing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/editor')

  const editor = page.locator('.hlx-content')
  await editor.click()
  await page.keyboard.type('hello')
  await expect(editor).toContainText('hello')
  expect(errors).toEqual([])
})

// Records whether this environment can exercise real paste; add-tables relies on the answer.
test('real clipboard paste reaches the editor', async ({ page }) => {
  await page.goto('/editor')
  const editor = page.locator('.hlx-content')
  await editor.click()
  await page.evaluate(() => navigator.clipboard.writeText('from the clipboard'))
  await page.keyboard.press('ControlOrMeta+V')
  await expect(editor).toContainText('from the clipboard')
})
