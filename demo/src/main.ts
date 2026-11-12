/* eslint-disable perfectionist/sort-imports -- the order below is the order the styles apply in */

/*
 * Styles first, as anyone using the packages loads them: the editor's one stylesheet (tokens,
 * content and the editor itself), then one for each plugin and for the comparison view. They
 * come before the app, so that the site's own styles, loaded with its components, win a tie.
 */
import '@hakulex/editor/style.css'
import '@hakulex/plugin-floating-toolbar/style.css'
import '@hakulex/plugin-slash-menu/style.css'
import '@hakulex/plugin-toolbar/style.css'
import '@hakulex/plugin-mention/style.css'
import '@hakulex/plugin-link-edit/style.css'
import '@hakulex/plugin-block-handle/style.css'
import '@hakulex/plugin-table/style.css'
import '@hakulex/plugin-image-editor/style.css'
import '@hakulex/diff/style.css'

import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'

createApp(App).use(router).mount('#app')
