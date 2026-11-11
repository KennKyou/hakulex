import type { EditorState, Extension } from '@codemirror/state'
import type { DecorationSet } from '@codemirror/view'
import { invertedEffects } from '@codemirror/commands'
import { StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, keymap, lineNumbers } from '@codemirror/view'

/*
 * Marked lines in a code snippet (its `highlightLines`): kept as line decorations, so they move
 * with the lines they are on as the code changes. A line number toggles its line, and so does
 * Alt+H for the line the cursor is on. A toggle is its own undo.
 */

/** Toggles the mark on the line that starts at this position. */
const toggleMark = StateEffect.define<number>({
  map: (position, mapping) => mapping.mapPos(position),
})

const mark = Decoration.line({ class: 'hlx-snippet-mark' })

function hasMark(marks: DecorationSet, from: number) {
  let found = false
  marks.between(from, from, (start) => {
    if (start === from)
      found = true
  })
  return found
}

function toggled(marks: DecorationSet, state: EditorState, position: number) {
  const { from } = state.doc.lineAt(position)
  return hasMark(marks, from)
    ? marks.update({
        filter: start => start !== from,
      })
    : marks.update({
        add: [
          mark.range(from),
        ],
        sort: true,
      })
}

function fieldFor(lines: number[]) {
  return StateField.define<DecorationSet>({
    create(state) {
      const starts = [
        ...new Set(lines),
      ]
        .filter(line => line >= 1 && line <= state.doc.lines)
        .sort((a, b) => a - b)
        .map(line => mark.range(state.doc.line(line).from))
      return Decoration.set(starts)
    },
    update(marks, transaction) {
      let next = marks
      if (transaction.docChanged) {
        /*
         * A mark goes with its line's text: text put in before the line pushes the mark along.
         * A line taken out whole takes its mark with it, rather than handing it to the next.
         */
        const starts = new Set<number>()
        const { changes, startState, state } = transaction
        marks.between(0, startState.doc.length, (from) => {
          const line = startState.doc.lineAt(from)
          // Gone: one change spans the whole line and a line break beside it.
          let gone = false
          changes.iterChangedRanges((fromA, toA) => {
            if (fromA <= line.from && toA >= line.to && (toA > line.to || fromA < line.from))
              gone = true
          })
          if (!gone)
            starts.add(state.doc.lineAt(changes.mapPos(from, 1)).from)
        })
        next = Decoration.set([...starts].sort((a, b) => a - b).map(from => mark.range(from)))
      }
      for (const effect of transaction.effects) {
        if (effect.is(toggleMark))
          next = toggled(next, transaction.state, effect.value)
      }
      return next
    },
    provide: field => EditorView.decorations.from(field),
  })
}

function toggleAt(view: EditorView, position: number) {
  view.dispatch({
    effects: toggleMark.of(view.state.doc.lineAt(position).from),
  })
  return true
}

/**
 * The marks for one file: what the editor needs (the marks, the numbered gutter that toggles
 * them, Alt+H and their undo), and a way to read back which lines are marked, from 1, in order.
 */
export function snippetMarks(lines: number[]): { extension: Extension, read: (state: EditorState) => number[] } {
  const field = fieldFor(lines)
  return {
    extension: [
      field,
      lineNumbers({
        domEventHandlers: {
          mousedown: (view, line, event) => {
            event.preventDefault()
            return toggleAt(view, line.from)
          },
        },
      }),
      keymap.of([
        {
          key: 'Alt-h',
          run: view => toggleAt(view, view.state.selection.main.head),
        },
      ]),
      // Toggling twice undoes a toggle.
      invertedEffects.of(transaction => transaction.effects.filter(effect => effect.is(toggleMark))),
    ],
    read(state) {
      const marks = state.field(field, false)
      if (!marks)
        return []
      const found = new Set<number>()
      marks.between(0, state.doc.length, (from) => {
        found.add(state.doc.lineAt(from).number)
      })
      return [...found].sort((a, b) => a - b)
    },
  }
}
