import { createDecoratorChannel } from '../decorator-channel'

/** Opens a math node's equation popover, now or once it mounts (after insert). */
export const mathEditChannel = createDecoratorChannel<void>()
