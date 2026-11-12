import type { Locator, Page } from '@playwright/test'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { toLineEnd } from './keys'
import { setTheme } from './theme'

/*
 * The AI review plugin, on its demo page: what a model proposes shows beside the blocks it
 * would change. The model here answers from a script. These run in all three browsers,
 * because what matters is where things end up on the page.
 */

const demo = (page: Page) => page.locator('.pkg-demo')
const editor = (page: Page) => demo(page).locator('.hlx-content').first()
const blocks = (page: Page) => editor(page).locator('> [data-block-id]')
const cards = (page: Page) => demo(page).locator('.hlx-agent-card')
const bar = (page: Page) => demo(page).locator('.hlx-agent-bar')
const ask = (page: Page) => demo(page).getByRole('button', { name: '讓 AI 修改' })
function undo(page: Page) {
  return page.keyboard.press(process.platform === 'darwin'
    ? 'Meta+z'
    : 'Control+z')
}

const errors = new WeakMap<Page, string[]>()

test.beforeEach(async ({ page }) => {
  const seen: string[] = []
  errors.set(page, seen)
  page.on('pageerror', error => seen.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      seen.push(message.text())
  })
  await page.route(url => url.protocol.startsWith('http') && url.hostname !== 'localhost', route => route.abort())
  await page.goto('/plugins/agent')
  await expect(blocks(page)).not.toHaveCount(0)
})

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([])
})

interface Box { top: number, bottom: number, left: number, right: number }

/** Where every block and every card is, top to bottom. */
async function measure(page: Page) {
  return demo(page).evaluate((root) => {
    const box = (element: Element) => {
      const { top, bottom, left, right } = element.getBoundingClientRect()
      return { top, bottom, left, right }
    }
    const content = root.querySelector('.hlx-content')!
    return {
      content: box(content),
      blocks: [...content.children].map(element => ({
        id: (element as HTMLElement).dataset.blockId ?? '',
        hidden: getComputedStyle(element).visibility === 'hidden',
        ...box(element),
      })),
      cards: [
        ...root.querySelectorAll<HTMLElement>('.hlx-agent-card'),
      ].map(element => ({
        kind: element.dataset.kind!,
        state: element.dataset.state!,
        mode: element.dataset.mode!,
        anchor: element.dataset.anchor!,
        ...box(element),
      })),
    }
  })
}

/** Nothing on the page may sit on top of anything else: half a pixel is allowed for rounding. */
const SLACK = 0.5
const overlaps = (a: Box, b: Box) => a.top < b.bottom - SLACK && b.top < a.bottom - SLACK

async function expectNothingOverlaps(page: Page) {
  const { content, blocks: blockBoxes, cards: cardBoxes } = await measure(page)
  expect(cardBoxes.length).toBeGreaterThan(0)
  for (const card of cardBoxes) {
    expect(card.bottom - card.top, `a ${card.kind} card has no height`).toBeGreaterThan(18)
    // A merged replacement stands on the block it covers, and a deletion's answers on the block
    // that would go; apart from that, a card touches no block and no other card.
    const onItsBlock = card.mode === 'inline' || card.mode === 'delete'
    for (const block of blockBoxes) {
      if (onItsBlock && block.id === card.anchor)
        continue
      expect(overlaps(card, block), `the ${card.mode} card at ${card.top} covers the block ${block.id} at ${block.top}`).toBe(false)
    }
    for (const other of cardBoxes) {
      if (other !== card)
        expect(overlaps(card, other), `two cards overlap at ${card.top}`).toBe(false)
    }
    // As wide as the document, and inside it.
    expect(Math.abs(card.left - content.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(card.right - content.right)).toBeLessThanOrEqual(1)

    if (card.anchor === 'start') {
      expect(card.bottom).toBeLessThanOrEqual(blockBoxes[0].top + SLACK)
      continue
    }
    const index = blockBoxes.findIndex(block => block.id === card.anchor)
    expect(index, `no block ${card.anchor}`).toBeGreaterThanOrEqual(0)
    const block = blockBoxes[index]
    if (onItsBlock) {
      // Exactly where the block is: it reads as that block.
      expect(Math.abs(card.top - block.top)).toBeLessThanOrEqual(1)
      expect(block.hidden).toBe(card.mode === 'inline')
    }
    else {
      expect(card.top).toBeGreaterThanOrEqual(block.bottom - SLACK)
    }
    if (blockBoxes[index + 1])
      expect(card.bottom).toBeLessThanOrEqual(blockBoxes[index + 1].top + SLACK)
  }
}

async function propose(page: Page) {
  await ask(page).click()
  await expect(cards(page)).toHaveCount(4)
  await expect(bar(page)).toBeVisible()
}
function card(page: Page, kind: string, anchorStart = false): Locator {
  return cards(page).and(page.locator(anchorStart
    ? `[data-kind="${kind}"][data-anchor="start"]`
    : `[data-kind="${kind}"]:not([data-anchor="start"])`))
}

test('what the model proposes shows in the document, in the place of what it changes', async ({ page }) => {
  const before = await measure(page)
  expect(before.cards).toEqual([])

  await propose(page)

  const shown = (await measure(page)).cards.map(entry => `${entry.kind}:${entry.mode}:${entry.state}`)
  expect(shown).toEqual([
    'insert:insert:pending',
    'replace:inline:pending',
    'delete:delete:pending',
    'insert:insert:pending',
  ])
  await expectNothingOverlaps(page)

  // The document itself is untouched: the same blocks, with the same text.
  await expect(blocks(page)).toHaveCount(before.blocks.length)
  await expect(editor(page)).not.toContainText('定稿')

  // The replaced paragraph reads as one: what goes is struck through, what comes is marked,
  // and both in colors the browser actually paints.
  const pieces = await card(page, 'replace').locator('.hlx-renderer [style]').evaluateAll(elements => elements.map((element) => {
    const style = getComputedStyle(element)
    return {
      text: element.textContent ?? '',
      struck: style.textDecorationLine.includes('line-through'),
      background: style.backgroundColor,
    }
  }))
  const gone = pieces.filter(piece => piece.struck).map(piece => piece.text).join('')
  const come = pieces.filter(piece => !piece.struck).map(piece => piece.text).join('')
  expect(gone).toContain('草')
  expect(gone).toContain('週五前要改完')
  expect(come).toContain('已經定')
  expect(come).toContain('今天就能發布')
  for (const piece of pieces)
    expect(piece.background).not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/)
  await expect(card(page, 'replace')).toContainText('這篇')

  // The block it stands for is covered; the one to be removed is struck through where it is.
  await expect(editor(page).locator('> [data-agent-hidden]')).toHaveCount(1)
  await expect(editor(page).locator('> [data-agent-hidden]')).toBeHidden()
  const removed = editor(page).locator('> [data-agent-change="delete"]')
  await expect(removed).toHaveCount(1)
  expect(await removed.evaluate(element => getComputedStyle(element).textDecorationLine)).toContain('line-through')
})

test('the caret passes over a covered block, and nothing can be typed into it', async ({ page }) => {
  await propose(page)
  const covered = editor(page).locator('> [data-agent-hidden]')
  const original = (await covered.textContent())!
  const [aboveId, belowId] = await covered.evaluate(element => [
    (element.previousElementSibling as HTMLElement).dataset.blockId,
    (element.nextElementSibling as HTMLElement).dataset.blockId,
  ])
  const above = editor(page).locator(`> [data-block-id="${aboveId}"]`)
  const below = editor(page).locator(`> [data-block-id="${belowId}"]`)

  // Down from the block above lands in the block below, not in the covered one.
  await above.click()
  await toLineEnd(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('DOWN')
  await expect(below).toContainText('DOWN')
  // And up from there lands back above.
  await page.keyboard.press('ArrowUp')
  await page.keyboard.type('UP')
  await expect(above).toContainText('UP')
  expect(await covered.textContent()).toBe(original)

  // Pressing on the merged text puts no caret in the document, and typing then goes nowhere new.
  await card(page, 'replace').locator('.hlx-renderer').click()
  await page.keyboard.type('NOWHERE')
  expect(await covered.textContent()).toBe(original)
  await expect(card(page, 'replace')).not.toContainText('NOWHERE')
  await expect(card(page, 'replace')).toHaveAttribute('data-state', 'pending')

  // Typing elsewhere, enough to wrap, moves everything along without anything overlapping.
  await above.click()
  await toLineEnd(page)
  await page.keyboard.press('Enter')
  await page.keyboard.type('a new paragraph, long enough to wrap onto another line of the editor for sure, so that everything under it has to move down the page')
  await expect(blocks(page).filter({ hasText: 'a new paragraph' })).toHaveCount(1)
  await expectNothingOverlaps(page)
})

test('rejecting gives the room back, exactly', async ({ page }) => {
  // Measured from the top of the document: the browser may scroll the page to keep what is on
  // screen in place when room opens up above it.
  const fromTop = (measured: Awaited<ReturnType<typeof measure>>) => measured.blocks.map(block => ({
    id: block.id,
    hidden: block.hidden,
    top: block.top - measured.content.top,
    bottom: block.bottom - measured.content.top,
  }))
  const before = fromTop(await measure(page))
  await propose(page)
  // The blocks do move to make room, a moment after the cards appear: what follows has something to undo.
  await expect.poll(async () => fromTop(await measure(page)).at(-1)!.bottom).toBeGreaterThan(before.at(-1)!.bottom + 20)

  await bar(page).getByRole('button', { name: '拒絕全部修改' }).click()
  await expect(cards(page)).toHaveCount(0)
  await expect(bar(page)).toHaveCount(0)

  const after = fromTop(await measure(page))
  expect(after.map(block => block.id)).toEqual(before.map(block => block.id))
  for (const [index, block] of after.entries()) {
    expect(Math.abs(block.top - before[index].top)).toBeLessThanOrEqual(SLACK)
    expect(Math.abs(block.bottom - before[index].bottom)).toBeLessThanOrEqual(SLACK)
    expect(block.hidden).toBe(false)
  }
  await expect(editor(page).locator('[data-agent-change], [data-agent-hidden]')).toHaveCount(0)
})

test('accepting writes into the document, and undo and redo take the item along', async ({ page }) => {
  await propose(page)

  await card(page, 'replace').getByRole('button', { name: '接受這項修改' }).click()
  await expect(editor(page)).toContainText('定稿')
  await expect(cards(page)).toHaveCount(3)
  await expectNothingOverlaps(page)

  // Straight away, with the keyboard still on the cards: undo reaches the document from there.
  expect(await page.evaluate(() => !!document.activeElement?.closest('.hlx-agent-card'))).toBe(true)
  await undo(page)
  await expect(editor(page)).not.toContainText('定稿')
  await expect(cards(page)).toHaveCount(4)
  await expect(card(page, 'replace')).toHaveAttribute('data-state', 'pending')
  await expectNothingOverlaps(page)

  await bar(page).getByRole('button', { name: '接受全部待審的修改' }).click()
  await expect(cards(page)).toHaveCount(0)
  await expect(editor(page)).toContainText('定稿')
  await expect(blocks(page).first()).toContainText('AI 加在開頭')
  await expect(blocks(page).last()).toContainText('AI 加在結尾')

  // One undo takes all of it back.
  await editor(page).click()
  await undo(page)
  await expect(cards(page)).toHaveCount(4)
  await expect(editor(page)).not.toContainText('AI 加在')
})

test('the bar steps through the items and brings each one into view', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 420 })
  await propose(page)
  await expect(bar(page)).toContainText('4')

  const next = bar(page).getByRole('button', { name: '下一項修改' })
  for (let index = 0; index < 4; index++) {
    await next.click()
    const current = cards(page).and(page.locator('[data-current="true"]'))
    await expect(current).toHaveCount(1)
    await expect(current).toBeInViewport()
    expect(await cards(page).evaluateAll(all => all.findIndex(element => (element as HTMLElement).dataset.current === 'true'))).toBe(index)
  }
  await next.click()
  expect(await cards(page).evaluateAll(all => all.findIndex(element => (element as HTMLElement).dataset.current === 'true'))).toBe(0)
})

test('an item can be answered with the keyboard alone', async ({ page, browserName }) => {
  await propose(page)
  const accept = cards(page).first().getByRole('button', { name: '接受這項修改' })
  await accept.focus()
  await expect(accept).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(cards(page)).toHaveCount(3)
  // The keyboard is still on something to answer.
  expect(await page.evaluate(() => !!document.activeElement?.closest('.hlx-agent-card'))).toBe(true)

  // From there Tab reaches the next answer, and Space presses it.
  // Safari moves between buttons with Option+Tab unless the user has set Tab to do it.
  await page.keyboard.press(browserName === 'webkit'
    ? 'Alt+Tab'
    : 'Tab')
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON')
  await page.keyboard.press('Space')
  await expect(cards(page)).toHaveCount(2)
})

test('in the dark theme the proposed text is drawn dark too', async ({ page }) => {
  await setTheme(page, '深色')
  await propose(page)

  await expect(demo(page).locator('.hlx-editor')).toHaveAttribute('data-color-scheme', 'dark')
  await expect(card(page, 'replace').locator('.hlx-renderer')).toHaveAttribute('data-color-scheme', 'dark')
  const seen = await card(page, 'replace').evaluate((element) => {
    const parse = (color: string) => (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    const light = (color: string) => parse(color).reduce((sum, part) => sum + part, 0) / 3
    return {
      text: light(getComputedStyle(element.querySelector('.hlx-renderer p')!).color),
      page: light(getComputedStyle(element.closest('.hlx-editor')!).backgroundColor || 'rgb(0,0,0)'),
    }
  })
  // Light text: readable on the dark page.
  expect(seen.text).toBeGreaterThan(150)
  await expectNothingOverlaps(page)
})
