import { enableAutoUnmount } from '@vue/test-utils'
import { afterEach } from 'vitest'

// Unmount every mounted app before test files clear the DOM. Clearing first
// detaches teleport anchors (popovers, menus) from each other, and a leftover
// app reacting later then fails to remove its own nodes.
enableAutoUnmount(afterEach)
