import type { Model, ScriptOptions, ScriptStep } from './types'

const CLOSING = '(The script has nothing more to say.)'

function pieces(text: string, size: number): string[] {
  // By code point, so that a character outside the basic plane is never cut in half.
  const characters = Array.from(text)
  const out: string[] = []
  for (let at = 0; at < characters.length; at += size)
    out.push(characters.slice(at, at + size).join(''))
  return out
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted)
    return Promise.resolve()
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    timer = setTimeout(done, ms)
    signal.addEventListener('abort', done)
  })
}

/**
 * A model that answers from a script instead of a service: one list of steps for each time it
 * is asked. For demos, and for testing what you build on an agent without a network or a key.
 * Past the end of the script it only says that it has nothing more to say.
 */
export function scriptedModel(script: ScriptStep[][], options: ScriptOptions = {}): Model {
  const delay = options.delay ?? 0
  const size = Math.max(1, options.chunkSize ?? 8)
  let asked = 0

  return async function* (request) {
    const round = asked++
    const steps = script[round] ?? [
      { text: CLOSING },
    ]
    const { signal } = request
    let calls = 0

    for (const step of steps) {
      if ('tool' in step) {
        const id = `call_${round + 1}_${++calls}`
        const input = JSON.stringify(typeof step.input === 'function'
          ? step.input(request)
          : step.input)
        yield { type: 'tool_call_start', id, name: step.tool }
        await pause(delay, signal)
        for (const upTo of [
          Math.floor(input.length / 2),
          input.length,
        ]) {
          if (signal.aborted)
            return
          yield {
            type: 'tool_call_partial',
            id,
            name: step.tool,
            input: input.slice(0, upTo),
          }
          await pause(delay, signal)
        }
        if (signal.aborted)
          return
        yield {
          type: 'tool_call',
          id,
          name: step.tool,
          input,
        }
        continue
      }
      const type = 'thinking' in step
        ? 'thinking' as const
        : 'text' as const
      for (const piece of pieces('thinking' in step
        ? step.thinking
        : step.text, size)) {
        if (signal.aborted)
          return
        yield { type, text: piece }
        await pause(delay, signal)
      }
    }
    if (!signal.aborted)
      yield { type: 'done' }
  }
}
