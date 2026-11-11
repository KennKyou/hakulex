import { createRouter, createWebHistory } from 'vue-router'
import ChartKindPage from './pages/charts/ChartKindPage.vue'
import ChartsOverview from './pages/charts/ChartsOverview.vue'
import HomePage from './pages/HomePage.vue'
import NodesOverview from './pages/nodes/NodesOverview.vue'
import NodeTypePage from './pages/nodes/NodeTypePage.vue'
import PackagePage from './pages/packages/PackagePage.vue'
import PackagesOverview from './pages/packages/PackagesOverview.vue'
import PlaygroundPage from './pages/PlaygroundPage.vue'
import PresetPage from './pages/presets/PresetPage.vue'
import PresetsOverview from './pages/presets/PresetsOverview.vue'
import TokensPage from './pages/TokensPage.vue'
import { findChartKind } from './site/charts'
import { findNode } from './site/nodes'
import { findPackage } from './site/packages'
import { findPreset } from './site/presets'

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    { path: '/', component: HomePage },
    { path: '/editor', component: PlaygroundPage },
    { path: '/nodes', component: NodesOverview },
    {
      path: '/nodes/:type',
      component: NodeTypePage,
      beforeEnter: to => findNode(to.params.type)
        ? true
        : '/nodes',
    },
    {
      path: '/plugins',
      component: PackagesOverview,
      props: { kind: 'plugin' },
    },
    {
      path: '/plugins/:id',
      component: PackagePage,
      props: { kind: 'plugin' },
      beforeEnter: to => findPackage('plugin', to.params.id)
        ? true
        : '/plugins',
    },
    {
      path: '/packages',
      component: PackagesOverview,
      props: { kind: 'package' },
    },
    {
      path: '/packages/:id',
      component: PackagePage,
      props: { kind: 'package' },
      beforeEnter: to => findPackage('package', to.params.id)
        ? true
        : '/packages',
    },
    { path: '/charts', component: ChartsOverview },
    {
      path: '/charts/:id',
      component: ChartKindPage,
      beforeEnter: to => findChartKind(to.params.id)
        ? true
        : '/charts',
    },
    { path: '/tokens', component: TokensPage },
    { path: '/presets', component: PresetsOverview },
    {
      path: '/presets/:id',
      component: PresetPage,
      beforeEnter: to => findPreset(to.params.id)
        ? true
        : '/presets',
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})
