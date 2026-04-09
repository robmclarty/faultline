///////////////////////////////////////////////////////////////// Constants //

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
} as const

let verbose_mode = false

///////////////////////////////////////////////////////////////////////// API //

/**
 * Set Verbose
 *
 * Enables or disables verbose logging output.
 *
 * @param enabled - Whether verbose mode is on.
 */
export const set_verbose = (enabled: boolean): void => {
  verbose_mode = enabled
}

/**
 * Log Info
 *
 * Prints an informational message.
 *
 * @param message - The message to print.
 */
export const log_info = (message: string): void => {
  console.log(`${COLORS.cyan}ℹ${COLORS.reset} ${message}`)
}

/**
 * Log Success
 *
 * Prints a success message.
 *
 * @param message - The message to print.
 */
export const log_success = (message: string): void => {
  console.log(`${COLORS.green}✓${COLORS.reset} ${message}`)
}

/**
 * Log Warning
 *
 * Prints a warning message.
 *
 * @param message - The message to print.
 */
export const log_warn = (message: string): void => {
  console.log(`${COLORS.yellow}⚠${COLORS.reset} ${message}`)
}

/**
 * Log Error
 *
 * Prints an error message.
 *
 * @param message - The message to print.
 */
export const log_error = (message: string): void => {
  console.error(`${COLORS.red}✗${COLORS.reset} ${message}`)
}

/**
 * Log Debug
 *
 * Prints a debug message only when verbose mode is enabled.
 *
 * @param message - The message to print.
 */
export const log_debug = (message: string): void => {
  if (verbose_mode) {
    console.log(`${COLORS.dim}  ${message}${COLORS.reset}`)
  }
}

/**
 * Log Step
 *
 * Prints a numbered step indicator.
 *
 * @param step - The step number or label.
 * @param description - What the step does.
 */
export const log_step = (step: string, description: string): void => {
  console.log(`${COLORS.blue}[${step}]${COLORS.reset} ${description}`)
}
