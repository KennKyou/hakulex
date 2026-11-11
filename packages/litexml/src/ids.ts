const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/**
 * A random id of `length` characters from one alphabet, made with nanoid's
 * `customAlphabet`. Only used for ids an author or a model left out.
 */
export function randomId(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return [...bytes].map(byte => ALPHABET[byte % ALPHABET.length]).join('')
}
