#!/usr/bin/env bun
/*
 * zil-to-yaml — transform the room definitions in Microsoft's `1dungeon.zil`
 * (the ZIL source our zork1.z3 was compiled from) into a YAML map: one entry
 * per room with its exits, flags, globals, description and action.
 *
 * This is a faithful transform — no map data is invented; every room and exit
 * comes straight from the ROOM objects in 1dungeon.zil.
 *
 *   bun tools/zil-to-yaml.mjs tools/1dungeon.zil > data/map.yaml
 */

import fs from 'node:fs'

const DIRECTIONS = new Set([
  'NORTH', 'SOUTH', 'EAST', 'WEST', 'NE', 'NW', 'SE', 'SW',
  'UP', 'DOWN', 'IN', 'OUT', 'LAND',
])

// ---- ZIL / MDL reader ------------------------------------------------------
// Parses <...> and (...) lists, "strings", and atoms. `;` comments out the
// next datum (MDL semantics), so we read-and-discard it.

function parse(src) {
  let i = 0
  const n = src.length

  function skipSpace() {
    while (i < n) {
      const c = src[i]
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue }
      break
    }
  }

  function readDatum() {
    skipSpace()
    if (i >= n) return { eof: true }
    const c = src[i]

    if (c === ';') { // comment: read and discard the next datum
      i++
      readDatum()
      return readDatum()
    }
    if (c === '<' || c === '(') {
      const close = c === '<' ? '>' : ')'
      const kind = c === '<' ? 'angle' : 'paren'
      i++
      const items = []
      while (true) {
        skipSpace()
        if (i >= n) break
        if (src[i] === close) { i++; break }
        // tolerate a mismatched closer by stopping the list
        if (src[i] === '>' || src[i] === ')') { i++; break }
        const d = readDatum()
        if (d.eof) break
        if (!d.skip) items.push(d.value)
      }
      return { value: { kind, items } }
    }
    if (c === '"') {
      i++
      let s = ''
      while (i < n && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < n) { s += src[i + 1]; i += 2; continue }
        s += src[i++]
      }
      i++ // closing quote
      return { value: { kind: 'string', text: s } }
    }
    // atom
    let a = ''
    while (i < n) {
      const ch = src[i]
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' ||
          ch === '<' || ch === '>' || ch === '(' || ch === ')' ||
          ch === '"' || ch === ';') break
      a += ch
      i++
    }
    return { value: { kind: 'atom', text: a } }
  }

  const forms = []
  while (true) {
    const d = readDatum()
    if (d.eof) break
    if (d.value) forms.push(d.value)
  }
  return forms
}

const isAtom = (x) => x && x.kind === 'atom'
const isString = (x) => x && x.kind === 'string'
const atom = (x) => (isAtom(x) ? x.text : null)

// ---- extract rooms ---------------------------------------------------------

function extractRooms(forms) {
  const rooms = []
  for (const form of forms) {
    if (form.kind !== 'angle') continue
    const head = atom(form.items[0])
    if (head !== 'ROOM') continue
    const id = atom(form.items[1])
    const room = { id, desc: null, exits: [], flags: [], globals: [], action: null }

    for (let k = 2; k < form.items.length; k++) {
      const prop = form.items[k]
      if (!prop || prop.kind !== 'paren') continue
      const key = atom(prop.items[0])
      if (!key) continue
      const rest = prop.items.slice(1)

      if (key === 'DESC') { room.desc = isString(rest[0]) ? rest[0].text : null; continue }
      if (key === 'ACTION') { room.action = atom(rest[0]); continue }
      if (key === 'FLAGS') { room.flags = rest.map(atom).filter(Boolean); continue }
      if (key === 'GLOBAL') { room.globals = rest.map(atom).filter(Boolean); continue }

      if (DIRECTIONS.has(key)) {
        // IN/OUT are also container membership: (IN ROOMS). Only treat as an
        // exit when the next token is TO / PER / SORRY / a message string.
        const first = rest[0]
        const firstAtom = atom(first)
        const looksLikeExit =
          isString(first) || firstAtom === 'TO' || firstAtom === 'PER' || firstAtom === 'SORRY'
        if ((key === 'IN' || key === 'OUT') && !looksLikeExit) continue
        const exit = parseExit(key, rest)
        if (exit) room.exits.push(exit)
      }
    }
    rooms.push(room)
  }
  return rooms
}

function parseExit(dir, rest) {
  const exit = { dir }
  const first = rest[0]
  const firstAtom = atom(first)

  if (isString(first)) { exit.blocked = first.text; return exit }
  if (firstAtom === 'SORRY') { exit.blocked = isString(rest[1]) ? rest[1].text : ''; return exit }
  if (firstAtom === 'PER') { exit.per = atom(rest[1]); return exit }

  if (firstAtom === 'TO') {
    exit.to = atom(rest[1])
    let j = 2
    while (j < rest.length) {
      const t = atom(rest[j])
      if (t === 'IF') {
        const cond = []
        j++
        while (j < rest.length && atom(rest[j]) !== 'ELSE') { cond.push(atom(rest[j])); j++ }
        exit.if = cond.join(' ')
      } else if (t === 'ELSE') {
        j++
        if (isString(rest[j])) exit.else = rest[j].text
        j++
      } else if (t === 'SORRY') {
        j++
        if (isString(rest[j])) exit.else = rest[j].text
        j++
      } else {
        j++
      }
    }
    return exit
  }
  // Fallback: keep the direction as a raw/blocked-ish entry.
  return exit
}

// ---- YAML emit (hand-rolled for this fixed shape) --------------------------

function yamlStr(s) {
  return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
}
function flowList(arr) {
  return '[' + arr.map((x) => (/^[A-Za-z0-9_.\-]+$/.test(x) ? x : yamlStr(x))).join(', ') + ']'
}

function emit(rooms) {
  const L = []
  L.push('# Zork I — complete room map')
  L.push('# Auto-generated by tools/zil-to-yaml.mjs from Microsoft\'s MIT-licensed')
  L.push('# 1dungeon.zil (the ZIL source our game/zork1.z3 was compiled from).')
  L.push('# Do not edit by hand — regenerate with: bun run map')
  L.push(`# Rooms: ${rooms.length}`)
  L.push('rooms:')
  for (const r of rooms) {
    L.push(`  ${r.id}:`)
    if (r.desc) L.push(`    desc: ${yamlStr(r.desc)}`)
    if (r.action) L.push(`    action: ${r.action}`)
    if (r.exits.length) {
      L.push('    exits:')
      for (const e of r.exits) {
        const parts = [`dir: ${e.dir}`]
        if (e.to) parts.push(`to: ${e.to}`)
        if (e.if) parts.push(`if: ${yamlStr(e.if)}`)
        if (e.else) parts.push(`else: ${yamlStr(e.else)}`)
        if (e.per) parts.push(`per: ${e.per}`)
        if (e.blocked != null) parts.push(`blocked: ${yamlStr(e.blocked)}`)
        L.push(`      - { ${parts.join(', ')} }`)
      }
    } else {
      L.push('    exits: []')
    }
    if (r.flags.length) L.push(`    flags: ${flowList(r.flags)}`)
    if (r.globals.length) L.push(`    globals: ${flowList(r.globals)}`)
  }
  return L.join('\n') + '\n'
}

function toJSON(rooms) {
  const out = { start: 'WEST-OF-HOUSE', rooms: {} }
  for (const r of rooms) {
    out.rooms[r.id] = {
      desc: r.desc,
      action: r.action || undefined,
      flags: r.flags,
      globals: r.globals,
      exits: r.exits,
    }
  }
  return out
}

// ---- main ------------------------------------------------------------------

const infile = process.argv[2] || 'tools/1dungeon.zil'
const src = fs.readFileSync(infile, 'utf8')
const rooms = extractRooms(parse(src))
const exitCount = rooms.reduce((n, r) => n + r.exits.length, 0)

fs.mkdirSync('data', { recursive: true })
fs.writeFileSync('data/map.yaml', emit(rooms))
fs.writeFileSync('data/map.json', JSON.stringify(toJSON(rooms), null, 2) + '\n')
process.stderr.write(`parsed ${rooms.length} rooms, ${exitCount} exits -> data/map.yaml, data/map.json\n`)
