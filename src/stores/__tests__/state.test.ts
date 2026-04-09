import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import {
  read_state,
  write_state,
  init_state,
  get_or_create_phase,
  update_task_status,
  mark_phase_completed,
  is_phase_completed,
  find_resumable_task
} from '../state.js'

let tmp_dir: string

beforeEach(async () => {
  tmp_dir = await mkdtemp(join(tmpdir(), 'faultline-test-'))
})

afterEach(async () => {
  await rm(tmp_dir, { recursive: true, force: true })
})

describe('state read/write round-trip', () => {
  it('returns null when no state exists', async () => {
    const state = await read_state(tmp_dir)

    expect(state).toBeNull()
  })

  it('writes and reads state correctly', async () => {
    const state = init_state('/test/dir')

    await write_state(tmp_dir, state)

    const read = await read_state(tmp_dir)

    expect(read).not.toBeNull()
    expect(read!.target_dir).toBe('/test/dir')
    expect(read!.phases).toEqual([])
  })

  it('preserves phase and task data through round-trip', async () => {
    const state = init_state('/test/dir')
    const phase = get_or_create_phase(state, 'survey')

    update_task_status(phase, 'step_1', 'Step 1', 'completed')
    update_task_status(phase, 'step_2', 'Step 2', 'running')

    await write_state(tmp_dir, state)

    const read = await read_state(tmp_dir)

    expect(read!.phases.length).toBe(1)
    expect(read!.phases[0].tasks.length).toBe(2)
    expect(read!.phases[0].tasks[0].status).toBe('completed')
    expect(read!.phases[0].tasks[1].status).toBe('running')
  })
})

describe('get_or_create_phase', () => {
  it('creates a new phase if not found', () => {
    const state = init_state('/test')
    const phase = get_or_create_phase(state, 'survey')

    expect(phase.phase).toBe('survey')
    expect(phase.status).toBe('pending')
    expect(state.phases.length).toBe(1)
  })

  it('returns existing phase', () => {
    const state = init_state('/test')

    get_or_create_phase(state, 'survey')

    const same = get_or_create_phase(state, 'survey')

    expect(state.phases.length).toBe(1)
    expect(same.phase).toBe('survey')
  })
})

describe('mark_phase_completed', () => {
  it('sets status to completed with timestamp', () => {
    const state = init_state('/test')
    const phase = get_or_create_phase(state, 'survey')

    mark_phase_completed(phase)

    expect(phase.status).toBe('completed')
    expect(phase.completed_at).toBeDefined()
  })
})

describe('is_phase_completed', () => {
  it('returns false for incomplete phase', () => {
    const state = init_state('/test')

    get_or_create_phase(state, 'survey')

    expect(is_phase_completed(state, 'survey')).toBe(false)
  })

  it('returns true for completed phase', () => {
    const state = init_state('/test')
    const phase = get_or_create_phase(state, 'survey')

    mark_phase_completed(phase)

    expect(is_phase_completed(state, 'survey')).toBe(true)
  })
})

describe('find_resumable_task', () => {
  it('returns first pending task', () => {
    const state = init_state('/test')
    const phase = get_or_create_phase(state, 'survey')

    update_task_status(phase, 't1', 'Task 1', 'completed')
    update_task_status(phase, 't2', 'Task 2', 'pending')

    const task = find_resumable_task(phase)

    expect(task).not.toBeNull()
    expect(task!.id).toBe('t2')
  })

  it('returns null when all tasks complete', () => {
    const state = init_state('/test')
    const phase = get_or_create_phase(state, 'survey')

    update_task_status(phase, 't1', 'Task 1', 'completed')

    expect(find_resumable_task(phase)).toBeNull()
  })
})
