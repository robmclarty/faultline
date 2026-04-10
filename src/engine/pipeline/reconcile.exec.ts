import { join } from 'node:path'

import { invoke_claude } from '../claude/invoke.js'
import { load_prompt } from '../claude/prompt_loader.js'
import { CROSS_REFERENCE_FINDINGS_SCHEMA } from '../claude/schemas.js'
import {
  read_state,
  write_state,
  init_state,
  get_or_create_phase,
  update_task_status,
  mark_phase_completed,
  mark_phase_failed,
  is_phase_completed,
  read_domains,
  read_consolidated_notes,
  write_cross_references
} from '../../stores/index.js'
import { append_learnings, read_active_learnings } from '../../stores/learnings.js'
import {
  log_info,
  log_success,
  log_error,
  log_warn,
  log_step,
  log_debug,
  create_spinner
} from '../../ui/index.js'
import type {
  FaultlineConfig,
  Domain,
  CrossReferenceFinding,
  CrossReferenceCluster,
  CrossReferenceReport,
  LearningEntry
} from '../../types.js'

///////////////////////////////////////////////////////////////// Constants //

const MAX_CLUSTER_SIZE = 5

///////////////////////////////////////////////////////////////////////// API //

/**
 * Execute Reconcile
 *
 * Runs the cross-domain reconciliation pipeline. Builds a domain interaction
 * graph, identifies clusters, and runs per-cluster Claude invocations to find
 * duplications, contradictions, missing handoffs, and shared invariants.
 *
 * @param config - The resolved faultline configuration.
 */
export const execute_reconcile = async (config: FaultlineConfig): Promise<void> => {
  const output_dir = join(config.target_dir, config.output_dir)

  let state = await read_state(output_dir)

  if (!state) {
    state = init_state(config.target_dir)
  }

  if (!is_phase_completed(state, 'extract')) {
    throw new Error(
      'Extract phase must be completed before reconciliation. Run `faultline extract` first.'
    )
  }

  const domains = await read_domains(output_dir)

  if (!domains) {
    throw new Error('Survey artifacts missing (domains.json)')
  }

  const phase = get_or_create_phase(state, 'reconcile')

  phase.status = 'running'
  phase.started_at = phase.started_at ?? new Date().toISOString()
  await write_state(output_dir, state)

  try {
    // Build domain interaction graph
    log_step('2.5a', 'Building domain interaction graph')
    const graph = await build_interaction_graph(domains, output_dir)

    // Identify clusters
    log_step('2.5b', 'Identifying domain clusters')
    const clusters = identify_clusters(graph)

    log_info(
      `Found ${clusters.length} cluster(s) to reconcile ` +
      `(${domains.length - count_isolated(graph, domains)} connected domains, ` +
      `${count_isolated(graph, domains)} isolated)`
    )

    // Reconcile each cluster
    const all_findings: CrossReferenceCluster[] = []

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i]
      const task_id = `reconcile_cluster_${i}`

      update_task_status(phase, task_id, `Reconcile cluster ${i}`, 'running')
      await write_state(output_dir, state)

      log_step('2.5c', `Reconciling cluster ${i + 1}/${clusters.length}: ${cluster.join(', ')}`)

      const findings = await reconcile_cluster(
        cluster,
        domains,
        config,
        output_dir
      )

      all_findings.push({ domains: cluster, findings })

      update_task_status(phase, task_id, `Reconcile cluster ${i}`, 'completed')
      await write_state(output_dir, state)
    }

    // Write cross-reference report
    const total_findings = all_findings.reduce(
      (sum, c) => sum + c.findings.length,
      0
    )

    const report: CrossReferenceReport = {
      clusters: all_findings,
      total_findings,
      generated_at: new Date().toISOString()
    }

    await write_cross_references(output_dir, report)

    // Append findings to learnings
    if (total_findings > 0) {
      log_step('2.5d', 'Appending reconciliation findings to learnings')
      const learning_entries = findings_to_learnings(all_findings)

      await append_learnings(output_dir, learning_entries)
      log_debug(`Appended ${learning_entries.length} learnings from reconciliation`)
    }

    mark_phase_completed(phase)
    await write_state(output_dir, state)
    log_success(`Reconciliation completed: ${total_findings} finding(s) across ${clusters.length} cluster(s)`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    log_error(`Reconciliation failed: ${message}`)
    mark_phase_failed(phase)
    await write_state(output_dir, state)
    throw err
  }
}

///////////////////////////////////////////////////////////////////// Helpers //

/**
 * Edge in the domain interaction graph.
 */
type GraphEdge = {
  from: string
  to: string
  source: 'declared' | 'observed'
  weight: number
}

/**
 * Domain interaction graph represented as an adjacency structure.
 */
type InteractionGraph = {
  nodes: Set<string>
  edges: GraphEdge[]
  adjacency: Map<string, Set<string>>
}

/**
 * Builds the domain interaction graph from declared dependencies (domains.json
 * depends_on) plus observed references in consolidated notes (grep-based).
 */
export const build_interaction_graph = async (
  domains: Domain[],
  output_dir: string
): Promise<InteractionGraph> => {
  const nodes = new Set(domains.map(d => d.id))
  const edges: GraphEdge[] = []
  const adjacency = new Map<string, Set<string>>()

  // Initialize adjacency
  for (const id of nodes) {
    adjacency.set(id, new Set())
  }

  // Add declared dependency edges (weight 2 = strong)
  for (const domain of domains) {
    for (const dep of domain.depends_on) {
      if (nodes.has(dep)) {
        edges.push({ from: domain.id, to: dep, source: 'declared', weight: 2 })
        adjacency.get(domain.id)!.add(dep)
        adjacency.get(dep)!.add(domain.id)
      }
    }
  }

  // Add observed reference edges by grepping consolidated notes
  const domain_labels = new Map(domains.map(d => [d.id, d.label.toLowerCase()]))

  for (const domain of domains) {
    const notes = await read_consolidated_notes(output_dir, domain.id)

    if (!notes) continue

    const notes_lower = notes.toLowerCase()

    for (const [other_id, other_label] of domain_labels) {
      if (other_id === domain.id) continue

      // Check if the notes reference the other domain by id or label
      if (notes_lower.includes(other_id) || notes_lower.includes(other_label)) {
        // Only add if not already a declared edge in this direction
        const has_declared = edges.some(
          e => e.from === domain.id && e.to === other_id && e.source === 'declared'
        )

        if (!has_declared) {
          edges.push({
            from: domain.id,
            to: other_id,
            source: 'observed',
            weight: 1
          })
          adjacency.get(domain.id)!.add(other_id)
          adjacency.get(other_id)!.add(domain.id)
        }
      }
    }
  }

  return { nodes, edges, adjacency }
}

/**
 * Identifies clusters of connected domains from the interaction graph.
 * Connected components exceeding MAX_CLUSTER_SIZE are split by removing
 * the weakest edges.
 */
export const identify_clusters = (
  graph: InteractionGraph
): string[][] => {
  const components = find_connected_components(graph)

  // Filter out isolated nodes (single-domain components with no edges)
  const non_isolated = components.filter(comp => {
    if (comp.length === 1) {
      const neighbors = graph.adjacency.get(comp[0])

      return neighbors !== undefined && neighbors.size > 0
    }

    return true
  })

  // Split oversized components
  const clusters: string[][] = []

  for (const component of non_isolated) {
    if (component.length <= MAX_CLUSTER_SIZE) {
      clusters.push(component)
    } else {
      const split = split_component(component, graph)

      clusters.push(...split)
    }
  }

  return clusters
}

/**
 * Finds connected components using BFS.
 */
const find_connected_components = (graph: InteractionGraph): string[][] => {
  const visited = new Set<string>()
  const components: string[][] = []

  for (const node of graph.nodes) {
    if (visited.has(node)) continue

    const component: string[] = []
    const queue = [node]

    while (queue.length > 0) {
      const current = queue.shift()!

      if (visited.has(current)) continue

      visited.add(current)
      component.push(current)

      const neighbors = graph.adjacency.get(current)

      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor)
          }
        }
      }
    }

    components.push(component)
  }

  return components
}

/**
 * Splits an oversized component by iteratively removing the weakest edges
 * until all resulting components are within MAX_CLUSTER_SIZE.
 */
const split_component = (
  component: string[],
  graph: InteractionGraph
): string[][] => {
  // Build a subgraph adjacency for this component
  const sub_adj = new Map<string, Set<string>>()

  for (const node of component) {
    sub_adj.set(node, new Set())
  }

  // Get edges within this component, sorted by weight ascending (weakest first)
  const comp_set = new Set(component)
  const comp_edges = graph.edges
    .filter(e => comp_set.has(e.from) && comp_set.has(e.to))
    .sort((a, b) => a.weight - b.weight)

  // Build initial subgraph
  for (const edge of comp_edges) {
    sub_adj.get(edge.from)!.add(edge.to)
    sub_adj.get(edge.to)!.add(edge.from)
  }

  // Remove weakest edges until we can split
  const removed_edges: GraphEdge[] = []

  for (const edge of comp_edges) {
    sub_adj.get(edge.from)!.delete(edge.to)
    sub_adj.get(edge.to)!.delete(edge.from)
    removed_edges.push(edge)

    const sub_comps = find_sub_components(component, sub_adj)

    if (sub_comps.every(c => c.length <= MAX_CLUSTER_SIZE)) {
      return sub_comps.filter(c => c.length > 0)
    }

    // If we split but some parts are still too big, continue removing
    if (sub_comps.length > 1) {
      const result: string[][] = []

      for (const sc of sub_comps) {
        if (sc.length <= MAX_CLUSTER_SIZE) {
          result.push(sc)
        } else {
          result.push(...split_component(sc, graph))
        }
      }

      return result
    }
  }

  // If we couldn't split gracefully, chunk by MAX_CLUSTER_SIZE
  const chunks: string[][] = []

  for (let i = 0; i < component.length; i += MAX_CLUSTER_SIZE) {
    chunks.push(component.slice(i, i + MAX_CLUSTER_SIZE))
  }

  return chunks
}

/**
 * Finds connected components within a subset using a local adjacency map.
 */
const find_sub_components = (
  nodes: string[],
  adjacency: Map<string, Set<string>>
): string[][] => {
  const visited = new Set<string>()
  const components: string[][] = []

  for (const node of nodes) {
    if (visited.has(node)) continue

    const component: string[] = []
    const queue = [node]

    while (queue.length > 0) {
      const current = queue.shift()!

      if (visited.has(current)) continue

      visited.add(current)
      component.push(current)

      const neighbors = adjacency.get(current)

      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor)
          }
        }
      }
    }

    components.push(component)
  }

  return components
}

/**
 * Counts isolated domains (no edges in the interaction graph).
 */
const count_isolated = (graph: InteractionGraph, domains: Domain[]): number => {
  return domains.filter(d => {
    const neighbors = graph.adjacency.get(d.id)

    return !neighbors || neighbors.size === 0
  }).length
}

/**
 * Reconciles a single cluster of domains via Claude invocation.
 */
const reconcile_cluster = async (
  cluster: string[],
  domains: Domain[],
  config: FaultlineConfig,
  output_dir: string
): Promise<CrossReferenceFinding[]> => {
  const domain_map = new Map(domains.map(d => [d.id, d]))

  // Build cluster domain descriptions
  const cluster_domains = cluster
    .map(id => {
      const d = domain_map.get(id)

      return d ? `- **${d.label}** (${d.id}): ${d.description}` : `- ${id}`
    })
    .join('\n')

  // Collect consolidated notes for cluster domains
  const notes_parts: string[] = []

  for (const domain_id of cluster) {
    const notes = await read_consolidated_notes(output_dir, domain_id)
    const domain = domain_map.get(domain_id)
    const label = domain?.label ?? domain_id

    if (notes) {
      notes_parts.push(`## ${label} (${domain_id})\n\n${notes}`)
    }
  }

  const domain_notes = notes_parts.join('\n\n---\n\n')

  // Get learnings
  const learnings = await read_active_learnings(output_dir)
  const learnings_text = learnings.entries.length > 0
    ? learnings.entries.map(l => `- [${l.type}] ${l.content}`).join('\n')
    : 'No prior learnings.'

  const system_prompt = await load_prompt('reconcile/system.md', {
    cluster_domains,
    domain_notes,
    learnings: learnings_text
  })

  const spinner = create_spinner(`Reconciling cluster: ${cluster.join(', ')}`)

  try {
    const result = await invoke_claude({
      model: config.model,
      system_prompt,
      input: domain_notes,
      timeout: config.timeout,
      max_retries: config.max_retries,
      output_dir,
      phase: 'reconcile',
      task: `reconcile_${cluster.join('_')}`,
      verbose: config.verbose,
      json_schema: CROSS_REFERENCE_FINDINGS_SCHEMA
    })

    spinner.stop()

    if (!result.success) throw new Error(result.result)

    const parsed = JSON.parse(result.result) as { items: CrossReferenceFinding[] }

    return Array.isArray(parsed.items) ? parsed.items : []
  } catch (err) {
    spinner.stop()
    log_warn(
      `Reconciliation failed for cluster [${cluster.join(', ')}]: ` +
      `${err instanceof Error ? err.message : String(err)}`
    )

    return []
  }
}

/**
 * Converts cross-reference findings into learning entries.
 */
const findings_to_learnings = (
  clusters: CrossReferenceCluster[]
): LearningEntry[] => {
  const entries: LearningEntry[] = []

  for (const cluster of clusters) {
    for (const finding of cluster.findings) {
      const learning_type = finding.type === 'shared_invariant'
        ? 'pattern' as const
        : 'observation' as const

      entries.push({
        id: `reconcile_${entries.length}`,
        type: learning_type,
        domain: 'cross-cutting',
        content: `[${finding.type}] ${finding.description} (affects: ${finding.affected_domains.join(', ')})`,
        source_phase: 'reconcile',
        created_at: new Date().toISOString(),
        tokens_est: Math.ceil(finding.description.length / 4)
      })
    }
  }

  return entries
}
