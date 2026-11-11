import { createDecoratorChannel } from '../decorator-channel'

/** Opens a diagram's editor dialog, now or once it mounts (after insert). */
export const mermaidEditChannel = createDecoratorChannel<void>()
