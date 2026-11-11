import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMExportOutput, LexicalCommand, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import type { StepEntry } from '../steps/nested'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, $getEditor, createCommand, DecoratorNode } from 'lexical'
import StepsEditor from '../components/StepsEditor.vue'
import { createDecoratorChannel } from '../decorator-channel'
import { createBlankStep, normalizeStoredSteps } from '../steps/document'
import { createStepEntry, stepText, stepToJSON } from '../steps/nested'

/** Inserts steps with one blank step, with focus on its title. */
export const INSERT_STEPS_COMMAND: LexicalCommand<void> = createCommand('INSERT_STEPS_COMMAND')

export type StepsFocusTarget = 'first-title' | 'last-content'

/** Asks a block's component to move focus into it. */
export const stepsFocusChannel = createDecoratorChannel<StepsFocusTarget>()

export type SerializedStepsNode = Spread<Pick<{ steps: Record<string, unknown>[] }, 'steps'>, SerializedLexicalNode>

/**
 * Steps, each with a title and an editor of its own. The editors are shared by every version
 * of this node, so a step that was deleted comes back with its content on undo.
 */
export class StepsNode extends DecoratorNode<VueDecorator> {
  __steps: readonly StepEntry[]

  static getType(): string {
    return 'steps'
  }

  static clone(node: StepsNode): StepsNode {
    return new StepsNode(node.__steps, node.__key)
  }

  static importJSON(json: SerializedStepsNode): StepsNode {
    const parent = $getEditor()
    const steps = normalizeStoredSteps(json.steps).map(step => createStepEntry(parent, step))
    return $applyNodeReplacement(new StepsNode(steps)).updateFromJSON(json)
  }

  constructor(steps: readonly StepEntry[] = [], key?: NodeKey) {
    super(key)
    this.__steps = steps
  }

  exportJSON(): SerializedStepsNode {
    return {
      ...super.exportJSON(),
      steps: this.getLatest().__steps.map(stepToJSON),
    }
  }

  /** For pasting somewhere else. Pasting here goes through JSON, and comes back as steps. */
  exportDOM(): DOMExportOutput {
    const list = document.createElement('ol')
    for (const step of this.__steps) {
      const item = document.createElement('li')
      if (step.title) {
        const title = document.createElement('strong')
        title.textContent = step.title
        item.append(title)
      }
      const content = document.createElement('p')
      content.textContent = stepText(step)
      item.append(content)
      list.append(item)
    }
    return { element: list }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-steps-block'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return false
  }

  getTextContent(): string {
    return this.__steps
      .map(step => [
        step.title,
        stepText(step),
      ].filter(Boolean).join('\n'))
      .join('\n')
  }

  getSteps(): readonly StepEntry[] {
    return this.getLatest().__steps
  }

  setSteps(steps: readonly StepEntry[]): this {
    const writable = this.getWritable()
    writable.__steps = steps
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(StepsEditor, this.__key, { steps: this.__steps })
  }
}

/** One blank step. Call it inside an update of the editor that will hold it. */
export function $createStepsNode(): StepsNode {
  return $applyNodeReplacement(new StepsNode([
    createStepEntry($getEditor(), createBlankStep()),
  ]))
}

export function $isStepsNode(node: LexicalNode | null | undefined): node is StepsNode {
  return node instanceof StepsNode
}
