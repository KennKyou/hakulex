import type { Page } from '@playwright/test'
import process from 'node:process'

// On macOS, Home and End scroll the page in Firefox and Safari instead of moving the caret.
const isMac = process.platform === 'darwin'

export const toLineStart = (page: Page) => page.keyboard.press(isMac ? 'Meta+ArrowLeft' : 'Home')
export const toLineEnd = (page: Page) => page.keyboard.press(isMac ? 'Meta+ArrowRight' : 'End')
