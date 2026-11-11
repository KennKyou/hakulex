import { defineConfig } from 'vite'
import { createLibraryConfig } from '../../vite.shared.ts'

export default defineConfig(createLibraryConfig({
  entry: {
    index: 'src/index.ts',
    transformers: 'src/transformers.ts',
  },
}))
