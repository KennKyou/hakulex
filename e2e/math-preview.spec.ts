import { expect, test } from '@playwright/test'

/* The equation panel keeps its buttons where they are while the preview comes in. */

test('keeps 套用 still while a one-line preview is typeset, and applies it', async ({ page }) => {
  await page.goto('/editor')
  const editor = page.locator('.hlx-content').first()
  await editor.click()
  await page.keyboard.type('/math')
  const option = page.locator('.hlx-slash-menu [role="option"]').first()
  await expect(option).toBeVisible()
  await option.click()

  const popover = page.locator('.hlx-math-popover')
  const apply = popover.getByRole('button', { name: '套用' })
  await expect(apply).toBeVisible()
  const before = (await apply.boundingBox())!

  await page.getByLabel('LaTeX 數學式').fill('a+b')
  await expect(popover.locator('.hlx-math-preview .katex').first()).toBeVisible()
  await expect.poll(async () => (await apply.boundingBox())!.y).toBeCloseTo(before.y, 0)

  await apply.click()
  await expect(popover).toHaveCount(0)
  await expect(editor.locator('.hlx-math-editor .katex').first()).toBeVisible()
})
