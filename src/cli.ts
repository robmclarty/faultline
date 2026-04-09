#!/usr/bin/env node

import { Command } from 'commander'

import {
  register_analyze,
  register_survey,
  register_extract,
  register_reconcile,
  register_synthesize,
  register_dry_run,
  register_status
} from './commands/index.js'

///////////////////////////////////////////////////////////////// Constants //

const VERSION = '0.1.0'

///////////////////////////////////////////////////////////////////////// API //

const program = new Command()

program
  .name('faultline')
  .description(
    'Reverse-engineer brownfield codebases into abstract product specs'
  )
  .version(VERSION)

register_analyze(program)
register_survey(program)
register_extract(program)
register_reconcile(program)
register_synthesize(program)
register_dry_run(program)
register_status(program)

program.parse()
