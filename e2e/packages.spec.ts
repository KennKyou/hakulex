import type { Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'
import { findPackage, packages, packagesOf, packagesPath } from '../demo/src/site/packages'

/* The plugin and package pages: their overviews, what each page has, and every plugin at work. */

const nav = (page: Page) => page.getByRole('navigation', { name: '網站導覽' })
const tiles = (page: Page) => page.locator('.pkg-tile')
const demo = (page: Page) => page.locator('.pkg-demo')
const install = (page: Page) => page.locator('.pkg-install')
const usage = (page: Page) => page.locator('.pkg-usage')
const editor = (page: Page) => demo(page).locator('.hlx-content').first()

/** Leaves a page only once its code is highlighted: WebKit reports an import cut off by leaving. */
async function codeReady(page: Page) {
  await expect(page.locator('.hlx-code-body')).not.toHaveCount(0)
  await expect(page.locator('.hlx-code-body:not([data-highlighted])')).toHaveCount(0)
}

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
})

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([])
})

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

test.describe('the overviews', () => {
  for (const kind of ['plugin', 'package'] as const) {
    test(`${packagesPath(kind)} has a card for each, with its name, package and description`, async ({ page }) => {
      await page.goto(packagesPath(kind))
      await expect(tiles(page)).toHaveCount(packagesOf(kind).length)
      for (const entry of packagesOf(kind)) {
        const tile = tiles(page).filter({
          has: page.locator(`code:text-is("${entry.packageName}")`),
        })
        await expect(tile).toContainText(entry.label)
        await expect(tile).toContainText(entry.description)
      }
    })

    test(`an unknown address goes back to ${packagesPath(kind)}`, async ({ page }) => {
      await page.goto(`${packagesPath(kind)}/nope`)
      await expect(page).toHaveURL(new RegExp(`${packagesPath(kind)}$`))
      await expect(tiles(page)).toHaveCount(packagesOf(kind).length)
    })
  }

  test('opens a plugin without reloading the page', async ({ page }) => {
    await page.goto('/plugins')
    await page.evaluate(() => {
      (window as unknown as { marker: string }).marker = 'same page'
    })
    await tiles(page).filter({ hasText: '斜線選單' }).click()
    await expect(page).toHaveURL(/\/plugins\/slash-menu$/)
    await expect(page.getByRole('heading', { name: '斜線選單', level: 1 })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { marker?: string }).marker)).toBe('same page')
  })
})

test.describe('a page', () => {
  test('says what it is and has a demo with a hint', async ({ page }) => {
    await page.goto('/plugins/slash-menu')
    const entry = findPackage('plugin', 'slash-menu')!
    await expect(page.getByRole('heading', { name: '斜線選單', level: 1 })).toBeVisible()
    await expect(page.locator('.site-content')).toContainText(entry.description)
    await expect(page.locator('.pkg-meta')).toContainText('@hakulex/plugin-slash-menu')
    await expect(page.locator('.pkg-hint')).toContainText(entry.hint!)
    await expect(editor(page)).toBeVisible()
  })

  test('has the install command, and the source of the demo that runs', async ({ page }) => {
    await page.goto('/plugins/slash-menu')
    await expect(install(page)).toContainText('pnpm add @hakulex/plugin-slash-menu')
    await expect(install(page)).not.toContainText('尚未發布')
    await expect(usage(page)).toContainText('import { SlashMenuPlugin } from \'@hakulex/plugin-slash-menu\'')
    await expect(usage(page)).toContainText('<SlashMenuPlugin />')
    await expect(usage(page).getByRole('button', { name: /複製/ })).toBeVisible()
  })

  test('lists a plugin\'s props, or says there is nothing to set', async ({ page }) => {
    await page.goto('/plugins/floating-toolbar')
    const row = page.locator('.pkg-props tr', { hasText: 'validateUrl' })
    await expect(row).toContainText('(url: string) => boolean')
    await expect(row).toContainText('在連結進入編輯器前檢查網址')

    await codeReady(page)

    await page.goto('/plugins/table')
    await expect(page.locator('.pkg-props')).toContainText('不需要設定')
    await expect(page.locator('.pkg-props table')).toHaveCount(0)

    await codeReady(page)

    await page.goto('/packages/editor')
    await expect(page.getByRole('heading', { name: 'Props' })).toHaveCount(0)
  })

  test('shows commands instead of a demo for the command line tool', async ({ page }) => {
    await page.goto('/packages/litexml-cli')
    await expect(demo(page)).toHaveCount(0)
    await expect(page.locator('.site-content')).toContainText('終端機')
    await expect(install(page)).toContainText('pnpm add @hakulex/litexml-cli')
    await expect(usage(page)).toContainText('litexml post.xml --format html --open')
  })

  test('moves to the next and previous one of its kind, starting over', async ({ page }) => {
    await page.goto('/plugins/slash-menu')
    await editor(page).click()
    await page.keyboard.type('會消失')
    await expect(editor(page)).toContainText('會消失')

    await page.getByRole('link', { name: /下一個/ }).click()
    await expect(page).toHaveURL(/\/plugins\/mention$/)
    await page.getByRole('link', { name: /上一個/ }).click()
    await expect(page).toHaveURL(/\/plugins\/slash-menu$/)
    await expect(editor(page)).toBeVisible()
    await expect(editor(page)).not.toContainText('會消失')
  })

  test('stops at the ends of its kind', async ({ page }) => {
    const plugins = packagesOf('plugin')
    await page.goto(`/plugins/${plugins[0].id}`)
    await expect(page.getByRole('link', { name: /上一個/ })).toHaveCount(0)
    await codeReady(page)
    await page.goto(`/plugins/${plugins.at(-1)!.id}`)
    await expect(page.getByRole('link', { name: /下一個/ })).toHaveCount(0)

    const others = packagesOf('package')
    await codeReady(page)
    await page.goto(`/packages/${others[0].id}`)
    await expect(page.getByRole('link', { name: /上一個/ })).toHaveCount(0)
  })
})

test.describe('the navigation', () => {
  test('reaches each overview and page from inside its section, and marks the current one', async ({ page }) => {
    for (const [kind, path, last] of [
      ['plugin', '/plugins/table', '/plugins/litexml-paste'],
      ['package', '/packages/vue-lexical', '/packages/vue-lexical'],
    ] as const) {
      await page.goto(path)
      await codeReady(page)
      await expect(nav(page).locator(`.site-nav-leaf[href="${packagesPath(kind)}"]`)).toHaveText('概覽')
      for (const entry of packagesOf(kind))
        await expect(nav(page).locator(`.site-nav-leaf[href="${packagesPath(kind)}/${entry.id}"]`)).toHaveText(entry.label)
      await expect(nav(page).locator(`.site-nav-leaf[href="${last}"]`)).toBeAttached()
    }

    const current = nav(page).locator('.site-nav-leaf[href="/packages/vue-lexical"]')
    await expect(current).toHaveAttribute('aria-current', 'page')
    await expect(current).toBeInViewport({ ratio: 1 })
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1)
  })

  test.describe('on a narrow screen', () => {
    test.use({
      viewport: { width: 375, height: 812 },
    })

    test('has four ways in and no sideways scrolling, with wide code scrolling by itself', async ({ page }) => {
      await page.goto('/plugins/slash-menu')
      await expect(nav(page).getByRole('link')).toHaveText([
        '編輯器',
        '範例文件',
        '節點',
        '外掛',
        '套件',
        '圖表',
        'Token',
      ], { useInnerText: true })
      await expect(usage(page)).toContainText('SlashMenuPlugin')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
    })
  })
})

test.describe('each plugin at work', () => {
  test('toolbar makes the selected text bold', async ({ page }) => {
    await page.goto('/plugins/toolbar')
    await editor(page).click()
    await page.keyboard.type('hello')
    await page.keyboard.press('ControlOrMeta+A')
    await demo(page).locator('.hlx-fixed-toolbar').getByRole('button', { name: '粗體', exact: true }).click()
    await expect(editor(page).locator('strong, .hlx-bold').first()).toHaveText('hello')
  })

  test('floating-toolbar appears over a selection', async ({ page }) => {
    await page.goto('/plugins/floating-toolbar')
    await editor(page).locator('p').first().dblclick({
      position: { x: 24, y: 10 },
    })
    await expect(page.locator('.hlx-floating-toolbar')).toBeVisible()
  })

  test('slash-menu opens on /', async ({ page }) => {
    await page.goto('/plugins/slash-menu')
    await editor(page).click()
    await page.keyboard.type('/')
    await expect(page.locator('.hlx-slash-menu [role="option"]').first()).toBeVisible()
  })

  test('mention opens on @', async ({ page }) => {
    await page.goto('/plugins/mention')
    await editor(page).click()
    await page.keyboard.type('@')
    await expect(page.locator('.hlx-mention-menu')).toBeVisible()
  })

  test('link-edit shows its panel on a link', async ({ page }) => {
    await page.goto('/plugins/link-edit')
    await editor(page).locator('a.hlx-link').click()
    await expect(page.locator('.hlx-link-panel')).toBeVisible()
  })

  test('block-handle shows its grip on a block', async ({ page }) => {
    await page.goto('/plugins/block-handle')
    await editor(page).locator('p').first().hover()
    await expect(page.locator('.hlx-block-grip')).toBeVisible()
  })

  test('table shows its handles in a cell', async ({ page }) => {
    await page.goto('/plugins/table')
    await editor(page).locator('td').first().click()
    await expect(page.locator('.hlx-table-handle').first()).toBeVisible()
  })

  test('image-editor opens on a chosen picture', async ({ page }) => {
    await page.goto('/plugins/image-editor')
    await editor(page).click()
    await page.getByRole('button', { name: '插入' }).click()
    await page.getByRole('menuitem', { name: '圖片' }).click()
    const list = page.locator('.hlx-image-dialog')
    await list.locator('input[type="file"]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG })
    await list.locator('[data-image-dialog-row]').first().getByRole('button', { name: '編輯' }).click()
    await expect(page.locator('.hlx-picture-editor')).toBeVisible()
  })

  test('litexml-paste turns the sample into blocks', async ({ page }) => {
    await page.goto('/plugins/litexml-paste')
    const xml = findPackage('plugin', 'litexml-paste')!.tryText!
    await expect(page.locator('.pkg-try')).toContainText('<alert type="warning">')
    await editor(page).click()
    await editor(page).evaluate((element, value) => {
      const data = new DataTransfer()
      data.setData('text/plain', value)
      // Firefox takes the text from `data`, and ignores `clipboardData` in the constructor.
      const init = {
        clipboardData: data,
        data: value,
        dataType: 'text/plain',
        bubbles: true,
        cancelable: true,
      }
      element.dispatchEvent(new ClipboardEvent('paste', init))
    }, xml)
    await expect(editor(page).locator('h2')).toHaveText('發布前的檢查')
    await expect(editor(page).locator('.hlx-alert')).toContainText('還沒有人審過')
    await expect(editor(page)).not.toContainText('<doc>')
  })
})

test.describe('every page', () => {
  const expected = [
    'toolbar',
    'floating-toolbar',
    'slash-menu',
    'mention',
    'link-edit',
    'block-handle',
    'table',
    'image-editor',
    'litexml-paste',
    'editor',
    'renderer',
    'diff',
    'diff-core',
    'litexml',
    'litexml-cli',
    'headless',
    'style-token',
    'vue-lexical',
  ]

  test('the list is all the plugins and packages', () => {
    expect(packages.map(entry => entry.id)).toEqual(expected)
  })

  for (const entry of packages) {
    test(`${entry.id} loads, with its install command and code`, async ({ page }) => {
      await page.goto(`${packagesPath(entry.kind)}/${entry.id}`)
      await expect(page.getByRole('heading', { name: entry.label, level: 1, exact: true })).toBeVisible()
      await expect(install(page)).toContainText(`pnpm add ${entry.packageName}`)
      await expect(page.locator('.hlx-unknown')).toHaveCount(0)
      if (entry.commands)
        return
      await expect(usage(page)).toContainText(entry.packageName)
      await expect(demo(page)).not.toBeEmpty()
      await expect(demo(page).locator('pre, [contenteditable="true"], .hlx-root').first()).toBeVisible()
    })
  }

  test('headless, litexml and diff-core show a result worked out in the page', async ({ page }) => {
    await page.goto('/packages/headless')
    await expect(demo(page).locator('pre')).toContainText('# ')
    await codeReady(page)
    await page.goto('/packages/litexml')
    await expect(demo(page).locator('pre')).toContainText('<doc>')
    await codeReady(page)
    await page.goto('/packages/diff-core')
    await expect(demo(page).locator('pre')).not.toBeEmpty()
  })
})
