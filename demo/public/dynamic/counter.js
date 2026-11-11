/*
 * A sample dynamic component for the demo: plain JavaScript, no framework. It follows the
 * mount contract: mount(container, { props, host }) returns { unmount, update }.
 * It renders in the block's shadow root, so its styles stay its own.
 */

const STYLE = `
  :host { display: block; }
  .card {
    --bg: #ffffff;
    --fg: #0f172a;
    --muted: #64748b;
    --line: #e2e8f0;
    --soft: #f1f5f9;
    --accent: #6366f1;
    --accent-fg: #ffffff;
    --accent-soft: rgba(99, 102, 241, 0.12);
    box-sizing: border-box;
    display: grid;
    gap: 14px;
    padding: 16px 18px;
    border: 1px solid var(--line);
    border-radius: 14px;
    background:
      radial-gradient(120% 90% at 100% 0%, var(--accent-soft), transparent 60%),
      var(--bg);
    color: var(--fg);
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .card[data-theme="dark"] {
    --bg: #111827;
    --fg: #f1f5f9;
    --muted: #94a3b8;
    --line: #273244;
    --soft: #1e293b;
    --accent: #818cf8;
    --accent-fg: #0b1020;
    --accent-soft: rgba(129, 140, 248, 0.16);
  }
  .head { display: flex; align-items: center; gap: 8px; }
  .head strong { font-size: 15px; font-weight: 600; }
  .badge {
    margin-left: auto;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 12px;
    font-weight: 500;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-soft);
  }
  .body { display: flex; align-items: center; gap: 12px; }
  output {
    min-width: 3ch;
    font-size: 40px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  output.bump { animation: bump 180ms ease-out; }
  @keyframes bump { 50% { transform: scale(1.12); } }
  .controls { display: flex; gap: 6px; margin-left: auto; }
  button {
    min-width: 40px;
    height: 34px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--soft);
    color: var(--fg);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    transition: transform 80ms, background 120ms, border-color 120ms;
  }
  button:hover { border-color: var(--accent); }
  button:active { transform: translateY(1px); }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  button.primary { border-color: transparent; background: var(--accent); color: var(--accent-fg); }
  button.ghost { background: transparent; color: var(--muted); font-weight: 500; }
  input {
    box-sizing: border-box;
    width: 100%;
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: var(--soft);
    color: var(--fg);
    font: inherit;
  }
  input::placeholder { color: var(--muted); }
`

function element(tag, props = {}) {
  return Object.assign(document.createElement(tag), props)
}

export default {
  mount(container, { props, host }) {
    let count = Number(props.start) || 0

    const style = element('style', { textContent: STYLE })
    const root = element('div', { className: 'card' })
    root.dataset.counter = ''
    root.dataset.theme = host.theme

    const label = element('strong')
    const head = element('div', { className: 'head' })
    head.append(element('span', { className: 'dot' }), label, element('span', { className: 'badge', textContent: '動態元件' }))

    const output = element('output')
    output.setAttribute('aria-live', 'polite')
    const minus = element('button', { type: 'button', className: 'ghost', textContent: '−1' })
    const plus = element('button', { type: 'button', className: 'primary', textContent: '+1' })
    const reset = element('button', { type: 'button', className: 'ghost', textContent: '重設' })
    const controls = element('div', { className: 'controls' })
    controls.append(reset, minus, plus)
    const body = element('div', { className: 'body' })
    body.append(output, controls)

    const note = element('input', { type: 'text', placeholder: '在元件裡打字' })
    note.dataset.note = ''

    const show = () => {
      label.textContent = props.label ?? '計數器'
      output.textContent = String(count)
    }
    const change = (next) => {
      count = next
      show()
      output.classList.remove('bump')
      void output.offsetWidth
      output.classList.add('bump')
    }
    plus.addEventListener('click', () => change(count + 1))
    minus.addEventListener('click', () => change(count - 1))
    reset.addEventListener('click', () => change(Number(props.start) || 0))

    show()
    root.append(head, body, note)
    container.append(style, root)

    return {
      update(next) {
        // A new starting value starts the count again.
        if (Number(next.props.start) !== Number(props.start))
          count = Number(next.props.start) || 0
        props = next.props
        root.dataset.theme = next.host.theme
        show()
      },
      unmount() {
        style.remove()
        root.remove()
      },
    }
  },
}
