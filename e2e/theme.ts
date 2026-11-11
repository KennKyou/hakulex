import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export type ThemeName = '系統' | '淺色' | '深色'

/** The site's theme button: it names the theme in use, and a press goes to the next. */
export const themeButton = (page: Page) => page.getByRole('button', { name: /^主題：/ })

/** Presses the theme button until the site is on the theme named. */
export async function setTheme(page: Page, name: ThemeName) {
  const button = themeButton(page)
  for (let presses = 0; presses < 3; presses++) {
    if ((await button.getAttribute('aria-label'))?.includes(name))
      break
    await button.click()
  }
  await expect(button).toHaveAccessibleName(new RegExp(name))
}
