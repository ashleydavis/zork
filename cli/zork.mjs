#!/usr/bin/env bun
/*
 * Zork I — terminal runner
 *
 * Runs Microsoft's MIT-licensed compiled ZIL (game/zork1.z3) on the ifvms
 * Z-machine interpreter, using the glkote-term "dumb" display for I/O.
 *
 * Usage:  bun cli/zork.mjs [path-to-story.z3]
 */

import fs from 'node:fs'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import GlkOte from 'glkote-term'
import MuteStream from 'mute-stream'
import ZVM from 'ifvms/src/zvm.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const storyfile = process.argv[2] || path.join(__dirname, '..', 'game', 'zork1.z3')

if (!fs.existsSync(storyfile)) {
  console.error(`Error: story file "${storyfile}" does not exist`)
  process.exit(1)
}

const stdin = process.stdin
const stdout = new MuteStream()
stdout.pipe(process.stdout)

const rl = readline.createInterface({ input: stdin, output: stdout, prompt: '' })
const rl_opts = { rl, stdin, stdout }

const vm = new ZVM()
const Glk = GlkOte.Glk

const options = {
  vm,
  Dialog: new GlkOte.Dialog(rl_opts),
  Glk,
  GlkOte: new GlkOte.GlkOte(rl_opts),
}

vm.prepare(fs.readFileSync(storyfile), options)
Glk.init(options)
