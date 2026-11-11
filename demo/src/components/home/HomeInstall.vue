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
    <CodeSnippetView :files="files">
      <template #actions>
        <span class="home-install-note" title="這個指令要等發布後才能使用">尚未發布到 npm</span>
      </template>
    </CodeSnippetView>
    <!-- On a narrow screen the note would crowd out the tabs, so it goes below. -->
    <p class="home-install-below">
      尚未發布到 npm，這個指令要等發布後才能使用。
    </p>
  </div>
</template>

<style scoped>
.home-install {
  max-width: 460px;
}

.home-install-below {
  display: none;
  margin: 8px 0 0;
  color: var(--hlx-color-text-tertiary);
  font-size: 12px;
}

@media (max-width: 767px) {
  .home-install-note {
    display: none;
  }

  .home-install-below {
    display: block;
  }
}

.home-install-note {
  padding: 1px 8px;
  border: 1px solid var(--hlx-color-border);
  border-radius: 999px;
  color: var(--hlx-color-text-tertiary);
  font-size: 11px;
  white-space: nowrap;
}
</style>
