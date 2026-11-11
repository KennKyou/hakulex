import { defineConfig } from 'vite'
import { createLibraryConfig } from '../../vite.shared.ts'

export default defineConfig(createLibraryConfig({
  entry: {
    browser: 'src/index-browser.ts',
    node: 'src/index-node.ts',
  },
}))
