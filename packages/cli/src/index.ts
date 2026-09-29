#!/usr/bin/env node
import { nodePorts } from './adapters/node'
import { main } from './command'

// Everything here touches `process` and nothing else — the command itself lives in
// `command.ts`, where a test can reach it.
try {
  process.exitCode = await main(process.argv.slice(2), nodePorts)
} catch (error) {
  process.stderr.write(`hafen: ${String(error)}\n`)
  process.exitCode = 1
}
