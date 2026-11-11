// @vitest-environment node
import { createDefaultRegistry, deserializeFromXml } from '@hakulex/litexml'
import { describe, expect, it } from 'vitest'
import { renderJson } from '../src/formats/json'
import { run } from '../src/run'
import { fakeIO, SAMPLE_XML } from './helpers'

/* --format json. */

const state = deserializeFromXml(SAMPLE_XML, createDefaultRegistry())

describe('renderJson', () => {
  const hello = deserializeFromXml('<doc><p>Hello</p></doc>', createDefaultRegistry())

  it('emits pretty JSON by default', () => {
    const out = renderJson(hello, false)
    expect(out).toContain('\n  ')
    expect(JSON.parse(out).root.type).toBe('root')
  })

  it('emits compact JSON when requested', () => {
    const out = renderJson(hello, true)
    expect(out).not.toContain('\n')
    expect(JSON.parse(out).root.type).toBe('root')
  })

  it('round-trips through stringify', () => {
    expect(JSON.parse(renderJson(hello, true))).toEqual(hello)
  })
})

describe('--format json', () => {
  it('gives what @hakulex/litexml reads, with a newline at the end', async () => {
    const io = fakeIO()
    expect(await run([SAMPLE_XML, '--format', 'json'], io)).toBe(0)
    expect(io.out).toBe(`${JSON.stringify(state, null, 2)}\n`)
    expect(io.err).toBe('')

    const compact = fakeIO()
    expect(await run([
      SAMPLE_XML,
      '--format',
      'json',
      '--compact',
    ], compact)).toBe(0)
    expect(compact.out).toBe(`${JSON.stringify(state)}\n`)
  })

  it('gives JSON input back as it was', async () => {
    const io = fakeIO()
    const json = JSON.stringify({
      root: {
        type: 'root',
        version: 1,
        children: [
          { type: 'future', version: 3, x: 1 },
        ],
      },
    })
    expect(await run([json, '-f', 'json', '--compact'], io)).toBe(0)
    expect(io.out).toBe(`${json}\n`)
  })

  it('writes to a file with -o', async () => {
    const io = fakeIO()
    expect(await run([
      SAMPLE_XML,
      '-f',
      'json',
      '-o',
      'out.json',
    ], io)).toBe(0)
    expect(io.out).toBe('')
    expect(io.written).toEqual({ 'out.json': `${JSON.stringify(state, null, 2)}\n` })
  })
})
