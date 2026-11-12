import type { AgentToolUse } from '@hakulex/agent-core'

const NAMES: Record<string, string> = {
  insert_blocks: '新增',
  replace_block: '修改',
  delete_block: '刪除',
}

/**
 * One tool call in plain words. What the tool was given (block IDs, LiteXML) is for the model:
 * the reader sees the edit itself in the editor.
 */
export function describeStep(use: AgentToolUse): string {
  const what = NAMES[use.name]
  if (!what) {
    return use.state === 'running'
      ? '正在處理'
      : use.state === 'failed'
        ? '這一步沒有成功'
        : '完成了一步'
  }
  if (use.state === 'running')
    return `正在${what}區塊`
  if (use.state === 'failed')
    return `${what}區塊沒有成功`

  const result = use.result ?? ''
  if (use.name === 'insert_blocks') {
    const count = /Proposed (\d+) new block/.exec(result)?.[1]
    return count
      ? `新增了 ${count} 個區塊`
      : '新增了區塊'
  }
  if (use.name === 'replace_block') {
    const more = /and (\d+) new block/.exec(result)?.[1]
    return more
      ? `修改了一個區塊，並新增了 ${more} 個區塊`
      : '修改了一個區塊'
  }
  return result.startsWith('Took back')
    ? '收回了一個新增的區塊'
    : '刪除了一個區塊'
}
