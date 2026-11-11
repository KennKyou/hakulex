import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/*
 * Pasting LiteXML through the real clipboard, and the demo's LiteXML tab. Chromium only: it is
 * the browser Playwright can grant clipboard permissions to.
 */

const editor = (page: Page) => page.locator('.editor-frame:visible .hlx-content').first()
const undo = (page: Page) => page.keyboard.press('ControlOrMeta+Z')

const errors = new WeakMap<Page, string[]>()

test.skip(({ browserName }) => browserName !== 'chromium', 'Needs clipboard permissions')

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource'))
      seen.push(message.text())
  })
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  await page.goto('/editor')
  await page.getByRole('button', { name: '清空文件' }).click()
  await editor(page).click()
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

async function paste(page: Page, text: string) {
  await page.evaluate(value => navigator.clipboard.writeText(value), text)
  await page.keyboard.press('ControlOrMeta+V')
}

// Indented as the serializer writes it, with CDATA holding a `>` that an HTML parser would cut.
const XML = `<doc>
  <p>開頭 <b>粗體</b> 和 <code>a &lt; b</code></p>
  <alert type="warning">
    <p>小心</p>
  </alert>
  <codeblock lang="ts"><![CDATA[if (a > b) console.log('<ok>')]]></codeblock>
  <table>
    <tr>
      <th><p>名稱</p></th>
      <th><p>值</p></th>
    </tr>
    <tr>
      <td><p>甲</p></td>
      <td><p>1</p></td>
    </tr>
  </table>
  <nested-doc>
    <p>巢狀內容</p>
  </nested-doc>
</doc>`

test('pasting LiteXML makes its blocks, and one undo takes them out', async ({ page }) => {
  await paste(page, XML)

  const content = editor(page)
  await expect(content.locator('strong, b').filter({ hasText: '粗體' })).toBeVisible()
  await expect(content.locator('.hlx-alert')).toContainText('小心')
  await expect(content.locator('.hlx-code-editor')).toContainText('if (a > b) console.log(\'<ok>\')')
  await expect(content.locator('table th')).toHaveText(['名稱', '值'])
  await expect(content.locator('table td')).toHaveText(['甲', '1'])
  await expect(content.locator('.hlx-nested-doc')).toContainText('巢狀內容')
  // Not pasted as text.
  await expect(content).not.toContainText('<alert')

  await undo(page)
  await expect(content.locator('.hlx-alert')).toHaveCount(0)
  await expect(content.locator('table')).toHaveCount(0)
  await expect(content).not.toContainText('開頭')
})

test('the LiteXML tab shows the document, and its copy pastes back to the same document', async ({ page }) => {
  await paste(page, XML)
  await expect(editor(page).locator('.hlx-nested-doc')).toContainText('巢狀內容')

  await page.getByRole('tab', { name: 'LiteXML' }).click()
  const shown = page.getByTestId('litexml')
  await expect(shown).toContainText('<alert type="warning">')
  await expect(shown).toContainText('<nested-doc>')
  const first = await shown.textContent()

  await page.getByRole('button', { name: '複製 LiteXML' }).click()
  await expect(page.getByRole('button', { name: '已複製' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first)

  await page.getByRole('tab', { name: '編輯' }).click()
  await page.getByRole('button', { name: '清空文件' }).click()
  await editor(page).click()
  await page.keyboard.press('ControlOrMeta+V')
  await expect(editor(page).locator('.hlx-nested-doc')).toContainText('巢狀內容')

  await page.getByRole('tab', { name: 'LiteXML' }).click()
  await expect(shown).toHaveText(first!)
})
