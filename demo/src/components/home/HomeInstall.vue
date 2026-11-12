<script setup lang="ts">
import { CodeSnippetView, normalizeSnippetFiles } from '@hakulex/renderer'
import { INSTALL_PACKAGE } from '../../site/home'

/*
 * The install command for each package manager, shown with the editor's own code snippet:
 * its tabs pick the manager, and its button copies the command.
 */
const files = normalizeSnippetFiles([
  { filename: 'pnpm', language: 'bash', code: `pnpm add ${INSTALL_PACKAGE}` },
  { filename: 'npm', language: 'bash', code: `npm install ${INSTALL_PACKAGE}` },
  { filename: 'yarn', language: 'bash', code: `yarn add ${INSTALL_PACKAGE}` },
])
</script>

<template>
  <div class="home-install">
    <CodeSnippetView :files="files" />
  </div>
</template>

<style scoped>
.home-install {
  max-width: 460px;
}
</style>
