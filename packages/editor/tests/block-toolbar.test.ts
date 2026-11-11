import { flushPromises, mount } from '@vue/test-utils'
import { createEditor } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'
import BlockToolbar from '../src/components/BlockToolbar.vue'
import { useBlockFloating, useOutsidePress } from '../src/media/floating'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('the shared block toolbar', () => {
  function shown(actions: unknown[], extra: Record<string, unknown> = {}) {
    return mount(BlockToolbar, {
      props: {
        label: '圖庫',
        actions,
        style: { top: '10px', left: '20px' },
        ...extra,
      } as never,
      attachTo: document.body,
    })
  }
  const toolbar = () => document.querySelector<HTMLElement>('[role="toolbar"]')!

  it('is a toolbar over the page, named, in the chrome\'s look, with one button per action', async () => {
    const select = vi.fn()
    shown([
      { id: 'edit', label: '編輯', onSelect: select },
      {
        id: 'open',
        label: '開啟連結',
        onSelect: vi.fn(),
      },
    ], { class: 'hlx-chart-toolbar' })
    await flushPromises()
    expect(toolbar().parentElement).toBe(document.body)
    expect(toolbar().getAttribute('aria-label')).toBe('圖庫')
    expect(toolbar().classList.contains('hlx-root')).toBe(true)
    expect(toolbar().classList.contains('hlx-block-toolbar')).toBe(true)
    expect(toolbar().classList.contains('hlx-chart-toolbar')).toBe(true)
    expect(toolbar().style.top).toBe('10px')
    expect([
      ...toolbar().querySelectorAll('button'),
    ].map(button => button.textContent!.trim())).toEqual(['編輯', '開啟連結'])
    toolbar().querySelector('button')!.click()
    expect(select).toHaveBeenCalledOnce()
  })

  it('says which action is on, and keeps a press from taking the editor\'s selection', async () => {
    shown([
      {
        id: 'edit',
        label: '編輯',
        expanded: true,
        onSelect: vi.fn(),
      },
      {
        id: 'data',
        label: '檢視資料',
        pressed: false,
        onSelect: vi.fn(),
      },
    ])
    await flushPromises()
    const [edit, data] = toolbar().querySelectorAll('button')
    expect(edit.getAttribute('aria-expanded')).toBe('true')
    expect(data.getAttribute('aria-pressed')).toBe('false')
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    edit.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
  })
})

describe('placing things by a block', () => {
  function harness(active: boolean) {
    const state = shallowRef(active)
    let api!: ReturnType<typeof useBlockFloating>
    const editor = createEditor({
      onError: (error) => { throw error },
    })
    const wrapper = mount(defineComponent({
      setup() {
        const element = shallowRef<HTMLElement | null>(null)
        api = useBlockFloating(editor, element, state)
        return () => h('div', { ref: element })
      },
    }), { attachTo: document.body })
    return {
      wrapper,
      state,
      api: () => api,
    }
  }
  function boxAt(top: number, left: number, width: number, height: number) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top,
      left,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect)
  }

  it('measures only while active, and puts a toolbar at the block\'s top right', async () => {
    boxAt(100, 50, 300, 200)
    const { state, api } = harness(false)
    await flushPromises()
    expect(api().box.value).toBeNull()
    state.value = true
    await nextTick()
    await flushPromises()
    expect(api().toolbarStyle.value).toEqual({ top: '100px', left: '350px' })
  })

  it('follows the block when the page scrolls', async () => {
    boxAt(100, 50, 300, 200)
    const { api } = harness(true)
    await flushPromises()
    boxAt(40, 50, 300, 200)
    window.dispatchEvent(new Event('scroll'))
    await flushPromises()
    expect(api().toolbarStyle.value.top).toBe('40px')
  })

  it('puts a panel beside the block if there is room, else under it, else over its top', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1600)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(900)
    boxAt(100, 50, 300, 200)
    const { api } = harness(true)
    await flushPromises()
    expect(api().panelStyle(400).value).toMatchObject({ left: '362px', top: '100px', width: '400px' })
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(700)
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(api().panelStyle(400).value).toMatchObject({ top: '308px' })
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(500)
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(api().panelStyle(400).value).toMatchObject({ top: '104px' })
  })
})

describe('a press elsewhere', () => {
  it('calls back for presses outside the given elements, only while on', async () => {
    const inside = document.createElement('div')
    const outside = document.createElement('div')
    document.body.append(inside, outside)
    const on = shallowRef(false)
    const pressed = vi.fn()
    mount(defineComponent({
      setup() {
        useOutsidePress(() => [inside], on, pressed)
        return () => null
      },
    }))
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    on.value = true
    await nextTick()
    await flushPromises()
    inside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(pressed).toHaveBeenCalledOnce()
  })
})
