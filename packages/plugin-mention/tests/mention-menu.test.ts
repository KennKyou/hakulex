import type { LexicalEditor, TextNode } from 'lexical'
import { $isMentionNode, RichEditor } from '@hakulex/editor'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setCompositionKey,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_TAB_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { builtinSlashItems, SlashMenuPlugin } from '../../plugin-slash-menu/src'
import { matchMentionTrigger, MentionMenuPlugin } from '../src'

afterEach(() => {
  document.body.innerHTML = ''
})

function mountWithMenu(extra: () => unknown = () => null) {
  const wrapper = mount(RichEditor, {
    attachTo: document.body,
    slots: {
      default: () => [
        h(MentionMenuPlugin),
        extra(),
      ],
    },
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  editor.getRootElement()!.focus()
  return { wrapper, editor }
}

async function setText(editor: LexicalEditor, text: string, format?: 'code') {
  editor.update(() => {
    const node = $createTextNode(text)
    if (format)
      node.toggleFormat(format)
    $getRoot().clear().append($createParagraphNode().append(node))
    node.selectEnd()
  }, { discrete: true })
  await flushPromises()
}

const press = (editor: LexicalEditor, command: typeof KEY_ENTER_COMMAND) => editor.dispatchCommand(command, new KeyboardEvent('keydown'))
const menu = () => document.querySelector('.hlx-mention-menu')
function options() {
  return [
    ...document.querySelectorAll('.hlx-mention-item'),
  ]
}
const titles = () => options().map(option => option.querySelector('.hlx-mention-item-title')!.textContent)
const paragraphs = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getChildrenSize())
const textOf = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getTextContent())
function children(editor: LexicalEditor) {
  return editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow<any>().getChildren().map((node: any) => node.exportJSON()))
}

describe('the trigger', () => {
  it.each([
    ['@', ''],
    ['＠', ''],
    ['字 @in', 'in'],
    ['@GH:octocat', 'GH:octocat'],
  ])('matches %s', (text, query) => {
    expect(matchMentionTrigger(text)?.query).toBe(query)
  })

  it.each(['a@b.com', '字@', '@a b', '@@'])('doesn\'t match %s', (text) => {
    expect(matchMentionTrigger(text)).toBeNull()
  })
})

describe('the menu', () => {
  it('lists the platforms for a lone @, also a full-width one', async () => {
    const { editor } = mountWithMenu()
    for (const trigger of ['@', '前 ＠']) {
      await setText(editor, trigger)
      expect(titles()).toEqual([
        'Bilibili',
        'Discord',
        'GitHub',
        'Instagram',
        'Reddit',
        'Telegram',
        'Threads',
        'X',
        'YouTube',
      ])
    }
  })

  it('picking a platform (the first, A to Z) leaves @BL: and keeps waiting for the account', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '＠')
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    expect(textOf(editor)).toBe('@BL:')
    expect(menu()?.textContent).toContain('輸入帳號')
    expect(options()).toHaveLength(0)
    editor.getEditorState().read(() => {
      expect(($getSelection() as any).anchor.offset).toBe(4)
    })
  })

  it('doesn\'t take Enter while waiting for the account', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '@GH:')
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    expect(paragraphs(editor)).toBe(2)
    expect(textOf(editor).trim()).toBe('@GH:')
  })

  it('offers each platform for an account typed straight after the @', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '@octocat')
    expect(titles()).toEqual([
      'Bilibili',
      'Discord',
      'GitHub',
      'Instagram',
      'Reddit',
      'Telegram',
      'Threads',
      'X',
      'YouTube',
    ])
    press(editor, KEY_ARROW_DOWN_COMMAND)
    press(editor, KEY_TAB_COMMAND)
    await flushPromises()
    expect(children(editor)[0]).toMatchObject({ type: 'mention', platform: 'DC', handle: 'octocat' })
  })

  it('turns @GH:octocat into a mention and a space, with the caret after, as one undo step', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '前 @GH:octocat')
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    const nodes = children(editor)
    expect(nodes.map((node: any) => node.type)).toEqual(['text', 'mention', 'text'])
    expect(nodes[1]).toEqual({
      type: 'mention',
      version: 1,
      platform: 'GH',
      handle: 'octocat',
    })
    expect(nodes[2].text).toBe(' ')
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.isCollapsed()).toBe(true)
      expect((selection as any).anchor.getNode().getPreviousSibling()).toSatisfy($isMentionNode)
      expect((selection as any).anchor.offset).toBe(1)
    })
    expect(menu()).toBeNull()
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(textOf(editor)).toBe('前 @GH:octocat')
    expect(children(editor).map((node: any) => node.type)).toEqual(['text'])
  })

  it('keeps the case of the account and ignores the case of the platform', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '@gh:OctoCat')
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    expect(children(editor)[0]).toMatchObject({ platform: 'GH', handle: 'OctoCat' })
  })

  it('works with the mouse', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '@neo')
    ;(options()[2] as HTMLElement).click()
    await flushPromises()
    expect(children(editor)[0]).toMatchObject({ platform: 'GH', handle: 'neo' })
  })

  it.each([
    'a@b.com',
    '@weibo:octocat',
    '@__proto__:a',
    '@constructor:a',
  ])('stays closed for %s, and Enter does its usual thing', async (text) => {
    const { editor } = mountWithMenu()
    await setText(editor, text)
    expect(menu()).toBeNull()
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    expect(paragraphs(editor)).toBe(2)
    expect(textOf(editor).trim()).toBe(text)
  })

  it('stays closed in inline code', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '@', 'code')
    expect(menu()).toBeNull()
  })

  it('doesn\'t pick anything while composing', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '@in')
    editor.update(() => {
      const node = $getRoot().getFirstDescendant() as TextNode
      $setCompositionKey(node.getKey())
      node.setTextContent('@inn').selectEnd()
    }, { discrete: true })
    await flushPromises()
    expect(menu()).toBeNull()
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    expect(children(editor).map((node: any) => node.type)).not.toContain('mention')
  })

  it('stays closed after Esc until that @ is gone, even across composing', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '@')
    const key = editor.getEditorState().read(() => ($getRoot().getFirstDescendant() as TextNode).getKey())
    press(editor, KEY_ESCAPE_COMMAND)
    await flushPromises()
    expect(menu()).toBeNull()
    expect(textOf(editor)).toBe('@')

    const type = async (text: string) => {
      editor.update(() => {
        const node = $getRoot().getFirstDescendant() as TextNode
        expect(node.getKey()).toBe(key)
        node.setTextContent(text).selectEnd()
      }, { discrete: true })
      await flushPromises()
    }
    await type('@i')
    expect(menu()).toBeNull()
    editor.update(() => $setCompositionKey(key), { discrete: true })
    await type('@in')
    editor.update(() => $setCompositionKey(null), { discrete: true })
    await type('@inn')
    expect(menu()).toBeNull()
    await type('x')
    await type('@')
    expect(menu()).not.toBeNull()
  })
})

describe('the slash item', () => {
  it('starts a mention', async () => {
    const { editor } = mountWithMenu(() => h(SlashMenuPlugin))
    await setText(editor, '/mention')
    expect(document.querySelector('.hlx-slash-item')!.textContent).toContain('提及')
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    expect(textOf(editor)).toBe('@')
    expect(titles()).toEqual([
      'Bilibili',
      'Discord',
      'GitHub',
      'Instagram',
      'Reddit',
      'Telegram',
      'Threads',
      'X',
      'YouTube',
    ])
  })

  it('is listed', () => {
    expect(builtinSlashItems.map(item => item.key)).toContain('mention')
  })
})
