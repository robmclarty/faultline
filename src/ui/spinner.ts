///////////////////////////////////////////////////////////////// Constants //

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_INTERVAL = 80

/////////////////////////////////////////////////////////////////////// Types //

type Spinner = {
  stop: (final_message?: string) => void
  update: (message: string) => void
}

///////////////////////////////////////////////////////////// Singleton State //

const active_spinners = new Map<symbol, string>()
let frame_index = 0
let interval: ReturnType<typeof setInterval> | null = null
let last_rendered_length = 0

const ensure_interval = (): void => {
  if (interval) return

  interval = setInterval(() => {
    if (active_spinners.size === 0) return

    // Render the most recently added spinner's message
    const entries = [...active_spinners.values()]
    const message = entries[entries.length - 1]
    const frame = FRAMES[frame_index % FRAMES.length]
    const output = `\r${frame} ${message}`

    // Clear previous render if it was longer
    const padding = last_rendered_length > output.length
      ? ' '.repeat(last_rendered_length - output.length)
      : ''

    process.stderr.write(output + padding)
    last_rendered_length = output.length

    frame_index++
  }, FRAME_INTERVAL)
}

const clear_interval_if_idle = (): void => {
  if (active_spinners.size === 0 && interval) {
    clearInterval(interval)
    interval = null
    frame_index = 0
    last_rendered_length = 0
  }
}

///////////////////////////////////////////////////////////////////////// API //

/**
 * Create Spinner
 *
 * Creates a terminal spinner for long-running operations. The spinner animates
 * on stderr to avoid interfering with stdout data. Only one spinner renders at
 * a time — concurrent spinners share the display, with the most recently
 * created or updated message shown.
 *
 * @param message - The initial spinner message.
 * @returns Spinner controls with stop() and update() methods.
 */
export const create_spinner = (message: string): Spinner => {
  const key = Symbol()

  active_spinners.set(key, message)
  ensure_interval()

  return {
    stop: (final_message?: string) => {
      active_spinners.delete(key)

      // Clear the line
      const clear_length = last_rendered_length || message.length + 4

      process.stderr.write('\r' + ' '.repeat(clear_length) + '\r')
      last_rendered_length = 0

      clear_interval_if_idle()

      if (final_message) {
        console.log(final_message)
      }
    },
    update: (msg: string) => {
      if (active_spinners.has(key)) {
        active_spinners.set(key, msg)
      }
    }
  }
}

/**
 * Resets spinner state. Exported for test isolation only.
 */
export const _reset_spinner = (): void => {
  active_spinners.clear()

  if (interval) {
    clearInterval(interval)
    interval = null
  }

  frame_index = 0
  last_rendered_length = 0
}
