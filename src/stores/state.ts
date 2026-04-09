import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'

import type { PipelineState, PhaseState, TaskState, PhaseName, TaskStatus } from '../types.js'

///////////////////////////////////////////////////////////////// Constants //

const STATE_FILE = 'state.json'

///////////////////////////////////////////////////////////////////////// API //

/**
 * Read State
 *
 * Reads the pipeline state from disk. Returns null if no state file exists.
 *
 * @param output_dir - The .faultline directory path.
 * @returns The pipeline state, or null.
 */
export const read_state = async (output_dir: string): Promise<PipelineState | null> => {
  const state_path = join(output_dir, STATE_FILE)

  if (!existsSync(state_path)) {
    return null
  }

  const content = await readFile(state_path, 'utf-8')

  return JSON.parse(content) as PipelineState
}

/**
 * Write State
 *
 * Persists the pipeline state to disk.
 *
 * @param output_dir - The .faultline directory path.
 * @param state - The pipeline state to write.
 */
export const write_state = async (
  output_dir: string,
  state: PipelineState
): Promise<void> => {
  await mkdir(output_dir, { recursive: true })

  const state_path = join(output_dir, STATE_FILE)

  state.updated_at = new Date().toISOString()

  await writeFile(state_path, JSON.stringify(state, null, 2), 'utf-8')
}

/**
 * Init State
 *
 * Creates a fresh pipeline state for a new run.
 *
 * @param target_dir - The directory being analyzed.
 * @returns Fresh pipeline state.
 */
export const init_state = (target_dir: string): PipelineState => ({
  target_dir,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  phases: []
})

/**
 * Get Or Create Phase
 *
 * Returns the phase state for the given phase name, creating it if it doesn't
 * exist.
 *
 * @param state - The pipeline state.
 * @param phase - The phase name.
 * @returns The phase state.
 */
export const get_or_create_phase = (
  state: PipelineState,
  phase: PhaseName
): PhaseState => {
  let phase_state = state.phases.find(p => p.phase === phase)

  if (!phase_state) {
    phase_state = {
      phase,
      status: 'pending',
      tasks: []
    }
    state.phases.push(phase_state)
  }

  return phase_state
}

/**
 * Update Task Status
 *
 * Updates a task's status within a phase, creating the task if needed.
 *
 * @param phase_state - The phase state.
 * @param task_id - The task identifier.
 * @param task_name - Human-readable task name.
 * @param status - The new status.
 * @param error - Optional error message for failed tasks.
 */
export const update_task_status = (
  phase_state: PhaseState,
  task_id: string,
  task_name: string,
  status: TaskStatus,
  error?: string
): void => {
  let task = phase_state.tasks.find(t => t.id === task_id)

  if (!task) {
    task = { id: task_id, name: task_name, status: 'pending' }
    phase_state.tasks.push(task)
  }

  task.status = status

  if (status === 'running') {
    task.started_at = new Date().toISOString()
  }

  if (status === 'completed' || status === 'failed') {
    task.completed_at = new Date().toISOString()
  }

  if (error) {
    task.error = error
  }
}

/**
 * Mark Phase Completed
 *
 * Sets the phase status to completed and records completion time.
 *
 * @param phase_state - The phase state to mark completed.
 */
export const mark_phase_completed = (phase_state: PhaseState): void => {
  phase_state.status = 'completed'
  phase_state.completed_at = new Date().toISOString()
}

/**
 * Mark Phase Failed
 *
 * Sets the phase status to failed.
 *
 * @param phase_state - The phase state to mark failed.
 */
export const mark_phase_failed = (phase_state: PhaseState): void => {
  phase_state.status = 'failed'
  phase_state.completed_at = new Date().toISOString()
}

/**
 * Is Phase Completed
 *
 * Checks if a phase has already completed.
 *
 * @param state - The pipeline state.
 * @param phase - The phase name.
 * @returns True if the phase is completed.
 */
export const is_phase_completed = (state: PipelineState, phase: PhaseName): boolean => {
  const phase_state = state.phases.find(p => p.phase === phase)

  return phase_state?.status === 'completed'
}

/**
 * Find Resumable Task
 *
 * Finds the first incomplete task in a phase for resume support.
 *
 * @param phase_state - The phase state.
 * @returns The first pending or failed task, or null if all complete.
 */
export const find_resumable_task = (phase_state: PhaseState): TaskState | null => {
  return phase_state.tasks.find(
    t => t.status === 'pending' || t.status === 'failed'
  ) ?? null
}
