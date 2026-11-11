import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

/* What is hakulex's own: its license and its credits, and samples that speak for it. */

test('the license and notice are there', () => {
  const root = new URL('..', import.meta.url).pathname
  expect(readFileSync(join(root, 'LICENSE'), 'utf8')).toContain('MIT License')
  const notice = readFileSync(join(root, 'NOTICE'), 'utf8')
  expect(notice).toContain('https://github.com/Innei/haklex')
  expect(notice).toContain('Copyright (c) 2026 Innei')
  expect(notice).toContain('Permission is hereby granted')
  const readme = readFileSync(join(root, 'README.md'), 'utf8')
  expect(readme).toContain('## 致謝')
  expect(readme).toContain('(./NOTICE)')
  expect(readme).toContain('[MIT](./LICENSE)')
})

test('the panel\'s buttons and the comparison sample are the site\'s own', async ({ page }) => {
  await page.goto('/editor')
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await expect(page.getByRole('button', { name: '載入舊格式文件' })).toBeVisible()
  await page.getByRole('tab', { name: '比較', exact: true }).click()
  await page.getByRole('button', { name: '載入範例', exact: true }).click()
  const diff = page.locator('.diff-tab')
  await expect(diff).toContainText('文件編輯器')
})

test('the samples name hakulex and its author', async ({ page }) => {
  await page.goto('/nodes/mention')
  const sample = page.locator('.node-sample').first()
  await expect(sample).toContainText('Ken')
  await expect(sample.locator('a[href="https://github.com/KennKyou"]')).toBeVisible()

  await page.goto('/editor')
  // 測試用文件 start closed.
  await page.locator('details.dev-documents').evaluate((element: HTMLDetailsElement) => {
    element.open = true
  })
  await page.getByRole('button', { name: '載入自動抓資料的卡片' }).click()
  await expect(page.locator('.page a.hlx-link[href="https://github.com/KennKyou/hakulex"]')).toHaveText('hakulex')
})
