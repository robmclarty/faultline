///////////////////////////////////////////////////////////////// Constants //

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_INTERVAL = 80

/////////////////////////////////////////////////////////////////////// Types //

type Spinner = {
  stop: (final_message?: string) => void
  update: (message: string) => void
}

///////////////////////////////////////////////////////////////////////// API //

/**
 * Create Spinner
 *
 * Creates a terminal spinner for long-running operations. The spinner animates
 * on stderr to avoid interfering with stdout data.
 *
 * @param message - The initial spinner message.
 * @returns Spinner controls with stop() and update() methods.
 */
export const create_spinner = (message: string): Spinner => {
  let frame_index = 0
  let current_message = message

  const interval = setInterval(() => {
    const frame = FRAMES[frame_index % FRAMES.length]

    process.stderr.write(`\r${frame} ${current_message}`)
    frame_index++
  }, FRAME_INTERVAL)

  return {
    stop: (final_message?: string) => {
      clearInterval(interval)
      process.stderr.write('\r' + ' '.repeat(current_message.length + 4) + '\r')

      if (final_message) {
        console.log(final_message)
      }
    },
    update: (msg: string) => {
      current_message = msg
    }
  }
}
