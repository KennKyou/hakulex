/**
 * An id nobody else is likely to have: `p_` for polls, `o_` for options. On
 * its own so the poll dialog can use it without importing `PollNode`, whose component
 * imports the plugin that imports the dialog.
 */
export function createPollId(prefix: 'p' | 'o'): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return `${prefix}_${[...bytes].map(byte => '0123456789abcdefghijklmnopqrstuvwxyz'[byte % 36]).join('')}`
}
