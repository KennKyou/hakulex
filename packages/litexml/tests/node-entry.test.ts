// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createDefaultRegistry, deserializeFromXml, serializeToXml } from '../src/index-node'

const XML = `<doc>
  <table>
    <tr><th><p>H</p></th></tr>
    <tr><td><p>a &lt; b</p></td></tr>
  </table>
  <alert type="note"><p>注意 <b>粗</b></p></alert>
  <steps><step id="s_a" title="一"><nested-doc><p>內</p></nested-doc></step></steps>
</doc>`

describe('the Node entry', () => {
  it('runs without a DOM and gives the same result as the browser entry', async () => {
    expect(typeof (globalThis as any).DOMParser).toBe('undefined')
    const registry = createDefaultRegistry()
    const state = deserializeFromXml(XML, registry)
    const root = state.root as any
    expect(root.children.map((node: any) => node.type)).toEqual(['table', 'alert-quote', 'steps'])
    expect(root.children[0].children[1].children[0].children[0].children[0].text).toBe('a < b')
    expect(root.children[2].steps[0].content.root.children[0].type).toBe('nested-doc')
    expect(deserializeFromXml(serializeToXml(state, registry), registry)).toEqual(state)
  })
})
