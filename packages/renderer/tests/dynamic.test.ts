import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, nextTick } from 'vue'
import { DynamicImportKey, dynamicUrlStatus, normalizeDynamic, RichRenderer } from '../src'

type Json = Record<string, any>

function value(...children: SerializedNode[]) {
  return {
    root: { type: 'root', children },
  }
}
function dynamic(extra: Json = {}): SerializedNode {
  return {
    type: 'dynamic',
    version: 1,
    url: '/widgets/counter.js',
    props: { start: 3 },
    initialHeight: 200,
    ...extra,
  }
}

/** A module that follows the contract, recording what it was given. */
function fakeModule() {
  const handle = {
    unmount: vi.fn(),
    update: vi.fn(),
  }
  const mountComponent = vi.fn((container: HTMLElement, _input: Json) => {
    container.textContent = '元件'
    return handle
  })
  return {
    module: {
      default: { mount: mountComponent },
    },
    mountComponent,
    handle,
  }
}

// Blocks wait until they come near the screen; here that is when a test says so.
let observed: { target: Element, callback: IntersectionObserverCallback }[] = []
class FakeObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    observed.push({ target, callback: this.callback })
  }

  disconnect() {
    observed = observed.filter(item => item.callback !== this.callback)
  }

  unobserve() {}
}
function comeIntoView() {
  for (const { target, callback } of [...observed]) {
    callback([
      { isIntersecting: true, target } as unknown as IntersectionObserverEntry,
    ], {} as IntersectionObserver)
  }
}

beforeEach(() => {
  observed = []
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

function show(node: SerializedNode, importModule: (url: string) => Promise<unknown>, props: Json = {}) {
  return mount(RichRenderer, {
    props: {
      value: value(node),
      ...props,
    },
    global: {
      provide: { [DynamicImportKey as symbol]: importModule },
    },
    attachTo: document.body,
  })
}
const box = () => document.querySelector<HTMLElement>('.hlx-dynamic')!
const shadowContainer = () => box().querySelector('.hlx-dynamic-host')!.shadowRoot!.firstElementChild as HTMLElement

describe('the stored data', () => {
  it('takes bad values as missing', () => {
    expect(normalizeDynamic({
      type: 'dynamic',
      url: 3,
      props: [1],
      initialHeight: 0,
    })).toEqual({ url: '', props: {}, initialHeight: 320 })
    expect(normalizeDynamic({
      type: 'dynamic',
      url: ' /a.js ',
      props: { a: 1 },
      initialHeight: 'x',
    })).toEqual({
      url: '/a.js',
      props: { a: 1 },
      initialHeight: 320,
    })
    expect(normalizeDynamic(dynamic())).toEqual({
      url: '/widgets/counter.js',
      props: { start: 3 },
      initialHeight: 200,
    })
  })
})

describe('which addresses load', () => {
  const base = 'https://blog.example.com/post/1'
  it.each([
    ['/widgets/a.js', 'ok'],
    ['widgets/a.js', 'ok'],
    ['https://blog.example.com/a.js', 'ok'],
    ['https://cdn.example.net/a.js', 'not-allowed'],
    ['', 'empty'],
    ['javascript:alert(1)', 'unsafe'],
    ['data:text/javascript,alert(1)', 'unsafe'],
    ['blob:https://blog.example.com/1', 'unsafe'],
    ['ftp://blog.example.com/a.js', 'unsafe'],
  ])('%s is %s without a rule of the site\'s', (url, status) => {
    expect(dynamicUrlStatus(url, base)).toBe(status)
  })

  it('lets the site allow another origin, and never an unsafe one', () => {
    const allow = vi.fn((url: string) => url.startsWith('https://cdn.example.net/'))
    expect(dynamicUrlStatus('https://cdn.example.net/a.js', base, allow)).toBe('ok')
    expect(dynamicUrlStatus('https://evil.example.org/a.js', base, allow)).toBe('not-allowed')
    allow.mockClear()
    expect(dynamicUrlStatus('javascript:alert(1)', base, () => true)).toBe('unsafe')
    expect(dynamicUrlStatus('data:text/javascript,1', base, allow)).toBe('unsafe')
    expect(allow).not.toHaveBeenCalled()
  })
})

describe('in the browser', () => {
  it('reserves its height, says it is loading, then mounts the component in a shadow root with its props and theme', async () => {
    const { module, mountComponent } = fakeModule()
    const importModule = vi.fn(async () => module)
    show(dynamic(), importModule)
    await flushPromises()
    expect(box().style.minHeight).toBe('200px')
    expect(box().textContent).toContain('載入元件中')
    expect(importModule).not.toHaveBeenCalled()
    comeIntoView()
    await flushPromises()
    expect(importModule).toHaveBeenCalledWith(new URL('/widgets/counter.js', location.href).href)
    expect(mountComponent).toHaveBeenCalledOnce()
    const [container, input] = mountComponent.mock.calls[0]
    expect(container).toBe(shadowContainer())
    expect(container.style.minHeight).toBe('200px')
    expect(input).toEqual({
      props: { start: 3 },
      host: { theme: 'light' },
    })
    expect(box().textContent).not.toContain('載入元件中')
  })

  it('tells the component of a new theme or props, without loading it again', async () => {
    const { module, mountComponent, handle } = fakeModule()
    const importModule = vi.fn(async () => module)
    const wrapper = show(dynamic(), importModule)
    await flushPromises()
    comeIntoView()
    await flushPromises()
    await wrapper.setProps({ colorScheme: 'dark' })
    await flushPromises()
    expect(handle.update).toHaveBeenLastCalledWith({
      props: { start: 3 },
      host: { theme: 'dark' },
    })
    await wrapper.setProps({
      value: value(dynamic({
        props: { start: 9 },
      })),
    })
    await flushPromises()
    expect(handle.update).toHaveBeenLastCalledWith({
      props: { start: 9 },
      host: { theme: 'dark' },
    })
    expect(importModule).toHaveBeenCalledOnce()
    expect(mountComponent).toHaveBeenCalledOnce()
  })

  it.each([
    [
      'a module that will not load',
      async () => {
        throw new TypeError('Failed to fetch dynamically imported module')
      },
    ],
    [
      'a module without mount',
      async () => ({
        default: {
          render() {},
        },
      }),
    ],
  ])('shows %s as failed, with its address and a retry', async (_name, failing) => {
    const { module, mountComponent } = fakeModule()
    const importModule = vi.fn(failing as (url: string) => Promise<unknown>)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    show(dynamic(), importModule)
    await flushPromises()
    comeIntoView()
    await flushPromises()
    expect(box().textContent).toContain('無法載入元件')
    expect(box().textContent).toContain('/widgets/counter.js')
    importModule.mockImplementation(async () => module)
    box().querySelector<HTMLButtonElement>('button')!.click()
    await flushPromises()
    expect(mountComponent).toHaveBeenCalledOnce()
    expect(box().textContent).not.toContain('無法載入元件')
  })

  it('hints at CORS when a module from another origin fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    show(dynamic({ url: 'https://cdn.example.net/a.js' }), async () => {
      throw new TypeError('Failed to fetch')
    }, {
      allowDynamicUrl: () => true,
    })
    await flushPromises()
    comeIntoView()
    await flushPromises()
    expect(box().textContent).toContain('CORS')
  })

  it('unmounts the component when the block goes, and mounts nothing that loads after', async () => {
    const { module, mountComponent, handle } = fakeModule()
    const wrapper = show(dynamic(), async () => module)
    await flushPromises()
    comeIntoView()
    await flushPromises()
    wrapper.unmount()
    expect(handle.unmount).toHaveBeenCalledOnce()

    let finish!: (value: unknown) => void
    const late = show(dynamic(), () => new Promise((resolve) => {
      finish = resolve
    }))
    await flushPromises()
    comeIntoView()
    await flushPromises()
    late.unmount()
    finish(module)
    await flushPromises()
    expect(mountComponent).toHaveBeenCalledOnce()
  })

  it('loads nothing from an address it may not, saying why', async () => {
    const importModule = vi.fn()
    show(dynamic({ url: 'https://cdn.example.net/a.js' }), importModule)
    await flushPromises()
    comeIntoView()
    await flushPromises()
    expect(box().textContent).toContain('未允許載入')
    expect(box().textContent).toContain('https://cdn.example.net/a.js')

    document.body.innerHTML = ''
    show(dynamic({ url: 'https://cdn.example.net/a.js' }), importModule, {
      allowDynamicUrl: () => false,
    })
    await flushPromises()
    comeIntoView()
    await flushPromises()
    expect(box().textContent).toContain('未允許載入')

    document.body.innerHTML = ''
    show(dynamic({ url: 'javascript:alert(1)' }), importModule, {
      allowDynamicUrl: () => true,
    })
    await flushPromises()
    comeIntoView()
    await flushPromises()
    expect(box().textContent).toContain('網址無法使用')
    expect(importModule).not.toHaveBeenCalled()
  })

  it('loads one from another origin that the site allows', async () => {
    const { module, mountComponent } = fakeModule()
    show(dynamic({ url: 'https://cdn.example.net/a.js' }), async () => module, {
      allowDynamicUrl: (url: string) => url.startsWith('https://cdn.example.net/'),
    })
    await flushPromises()
    comeIntoView()
    await flushPromises()
    expect(mountComponent).toHaveBeenCalledOnce()
  })

  it('says there is no address when it has none', async () => {
    show(dynamic({ url: '' }), vi.fn())
    await flushPromises()
    expect(box().textContent).toContain('沒有元件網址')
  })
})

describe('server rendering', () => {
  it('outputs a placeholder of the reserved height, loads nothing, and hydrates without warnings', async () => {
    const importModule = vi.fn()
    const app = () => createSSRApp({
      render: () => h(RichRenderer, {
        value: value(dynamic()),
      }),
    })
    const server = app()
    server.provide(DynamicImportKey, importModule)
    const html = await renderToString(server)
    expect(html).toContain('hlx-dynamic')
    expect(html).toContain('min-height:200px')
    expect(html).toContain('互動元件')
    expect(html).not.toContain('<p')
    expect(importModule).not.toHaveBeenCalled()

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const client = app()
    client.provide(DynamicImportKey, importModule)
    client.mount(container)
    await nextTick()
    expect(warn).not.toHaveBeenCalled()
    client.unmount()
  })
})
