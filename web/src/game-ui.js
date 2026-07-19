/*
 * GameUI — browser-only companion UI for the Zork terminal:
 *
 *  1. An auto-map (right panel): rooms are drawn as you visit them;
 *     adjacent-but-unvisited rooms appear as dim "?" fog nodes.
 *  2. A button bar (below the input): one button per available exit from the
 *     current room, plus Look / Inventory. Buttons just submit commands.
 *
 * Current room is tracked from the status line (location text) combined with
 * the movement command the player issued, resolved against data/map.json
 * (generated from Microsoft's 1dungeon.zil). Typing still works exactly as
 * before — this only observes and assists.
 */

const DIR_DELTA = {
  NORTH: { x: 0, y: -1 }, SOUTH: { x: 0, y: 1 },
  EAST: { x: 1, y: 0 }, WEST: { x: -1, y: 0 },
  NE: { x: 1, y: -1 }, NW: { x: -1, y: -1 },
  SE: { x: 1, y: 1 }, SW: { x: -1, y: 1 },
  // UP/DOWN/IN/OUT have no planar direction; placed by spiral fallback.
}

const DIR_ALIASES = {
  n: 'NORTH', north: 'NORTH', s: 'SOUTH', south: 'SOUTH',
  e: 'EAST', east: 'EAST', w: 'WEST', west: 'WEST',
  ne: 'NE', northeast: 'NE', nw: 'NW', northwest: 'NW',
  se: 'SE', southeast: 'SE', sw: 'SW', southwest: 'SW',
  u: 'UP', up: 'UP', d: 'DOWN', down: 'DOWN',
  in: 'IN', enter: 'IN', out: 'OUT', exit: 'OUT',
  land: 'LAND',
}

const DIR_COMMAND = {
  NORTH: 'north', SOUTH: 'south', EAST: 'east', WEST: 'west',
  NE: 'ne', NW: 'nw', SE: 'se', SW: 'sw',
  UP: 'up', DOWN: 'down', IN: 'in', OUT: 'out', LAND: 'land',
}

const DIR_LABEL = {
  NORTH: '↑ N', SOUTH: '↓ S', EAST: '→ E', WEST: '← W',
  NE: '↗ NE', NW: '↖ NW', SE: '↘ SE', SW: '↙ SW',
  UP: '⤴ Up', DOWN: '⤵ Down', IN: '⊙ In', OUT: '⊗ Out', LAND: '⊕ Land',
}

// Short labels used inside the compass rose (position implies direction).
const COMPASS_LABEL = {
  NORTH: 'N', NE: 'NE', EAST: 'E', SE: 'SE', SOUTH: 'S', SW: 'SW', WEST: 'W', NW: 'NW',
  UP: '▲', DOWN: '▼', IN: 'In', OUT: 'Out',
}

const CELL_W = 96
const CELL_H = 62
const BOX_W = 78
const BOX_H = 34

export default class GameUI {
  constructor({ map, svg, buttons, input, buffer, inventory }) {
    this.map = map
    this.rooms = map.rooms
    this.svg = svg
    this.buttonsEl = buttons
    this.inputEl = input
    this.bufferEl = buffer
    this.invEl = inventory
    this.wantInventory = false

    this.currentId = map.start
    this.visited = new Set([this.currentId])
    this.placed = new Map([[this.currentId, { x: 0, y: 0 }]])
    this.frontier = new Map() // toId -> {x, y}
    this.pendingDir = null
    this.lastLoc = null

    // Unique descriptions -> room id (for resolving rooms with no known exit).
    this.descIndex = new Map()
    const counts = new Map()
    for (const [id, r] of Object.entries(this.rooms)) {
      if (!r.desc) continue
      const k = r.desc.toLowerCase()
      counts.set(k, (counts.get(k) || 0) + 1)
    }
    for (const [id, r] of Object.entries(this.rooms)) {
      if (!r.desc) continue
      const k = r.desc.toLowerCase()
      if (counts.get(k) === 1) this.descIndex.set(k, id)
    }

    this._load() // restore explored map from a previous session, if any
    this._addFrontier(this.currentId)
    this.render()
  }

  _load() {
    try {
      const s = localStorage.getItem('zork1:mapstate')
      if (!s) return
      const d = JSON.parse(s)
      if (!d || !d.placed) return
      this.currentId = d.currentId
      this.lastLoc = d.lastLoc ?? null
      this.visited = new Set(d.visited)
      this.placed = new Map(d.placed)
      this.frontier = new Map(d.frontier)
    } catch { /* ignore corrupt state */ }
  }

  _persist() {
    try {
      localStorage.setItem('zork1:mapstate', JSON.stringify({
        currentId: this.currentId,
        lastLoc: this.lastLoc,
        visited: [...this.visited],
        placed: [...this.placed],
        frontier: [...this.frontier],
      }))
    } catch { /* ignore */ }
  }

  // ---- observers wired from WebGlkOte -------------------------------------

  handleCommand(text) {
    const t = String(text).toLowerCase().trim()
    if (/^(i|inv|invent|inventory)$/.test(t)) this.wantInventory = true
    this.pendingDir = this._parseDir(text)
  }

  handleOutput() {
    if (!this.wantInventory) return
    this.wantInventory = false
    if (!this.bufferEl || !this.invEl) return
    const inv = this._parseInventory(this.bufferEl.innerText || this.bufferEl.textContent || '')
    if (inv) this._renderInventory(inv)
  }

  _parseInventory(text) {
    // Find the most recent inventory response and read its item lines.
    const re = /You are (?:carrying|holding)[:.]?|You are empty[- ]handed\.?|You have nothing/gi
    let m, last = null
    while ((m = re.exec(text))) last = m
    if (!last) return null
    const seg = text.slice(last.index)
    const lines = seg.split('\n')
    const header = lines[0].trim()
    const empty = /empty[- ]handed|have nothing/i.test(header)
    const items = []
    if (!empty) {
      for (let i = 1; i < lines.length; i++) {
        const t = lines[i].replace(/\s+$/, '')
        if (t.trim() === '' || t.trim().startsWith('>')) break
        items.push(t.replace(/^\s*[-*]?\s*/, '')) // keep nesting-ish indent stripped
      }
    }
    return { header, items, empty }
  }

  _renderInventory(inv) {
    const el = this.invEl
    el.innerHTML = ''
    const h = document.createElement('div')
    h.className = 'inv-header'
    h.textContent = inv.header || 'You are carrying:'
    el.appendChild(h)
    if (inv.items.length) {
      const ul = document.createElement('ul')
      ul.className = 'inv-items'
      for (const it of inv.items) {
        const li = document.createElement('li')
        li.textContent = it
        ul.appendChild(li)
      }
      el.appendChild(ul)
    }
  }

  handleStatus(loc) {
    if (this.lastLoc === null) { this.lastLoc = loc; this.render(); return }
    if (loc === this.lastLoc) { this.pendingDir = null; return }

    // Room changed.
    const newId = this._resolveDestination(this.currentId, this.pendingDir, loc)
    this._placeRoom(newId, this.currentId, this.pendingDir)
    this.visited.add(newId)
    this.currentId = newId
    this.lastLoc = loc
    this._addFrontier(newId)
    this.pendingDir = null
    this.render()
  }

  // ---- movement / placement -----------------------------------------------

  _parseDir(text) {
    const toks = String(text).toLowerCase().trim().split(/\s+/)
    while (toks.length && ['go', 'walk', 'run', 'move'].includes(toks[0])) toks.shift()
    if (!toks.length) return null
    return DIR_ALIASES[toks[0]] || null
  }

  _resolveDestination(fromId, dir, loc) {
    const room = this.rooms[fromId]
    if (dir && room) {
      const exit = room.exits.find((e) => e.dir === dir && e.to)
      if (exit) return exit.to
    }
    const byDesc = this.descIndex.get(loc.toLowerCase())
    if (byDesc) return byDesc
    return 'LOC:' + loc // synthetic (mazes, unresolved)
  }

  _placeRoom(id, fromId, dir) {
    if (this.placed.has(id)) { this.frontier.delete(id); return }
    const base = this.placed.get(fromId) || { x: 0, y: 0 }
    const delta = DIR_DELTA[dir]
    let target
    if (delta) target = { x: base.x + delta.x, y: base.y + delta.y }
    else target = { x: base.x, y: base.y + (dir === 'UP' ? -1 : 1) } // vertical-ish
    target = this._nearestFree(target)
    this.placed.set(id, target)
    this.frontier.delete(id)
  }

  _occupied(x, y) {
    for (const p of this.placed.values()) if (p.x === x && p.y === y) return true
    return false
  }

  _nearestFree(pt) {
    if (!this._occupied(pt.x, pt.y)) return pt
    for (let r = 1; r < 12; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const x = pt.x + dx, y = pt.y + dy
          if (!this._occupied(x, y)) return { x, y }
        }
      }
    }
    return pt
  }

  _addFrontier(id) {
    const room = this.rooms[id]
    if (!room) return
    const base = this.placed.get(id)
    if (!base) return
    for (const e of room.exits) {
      if (!e.to || this.visited.has(e.to) || this.placed.has(e.to)) continue
      if (this.frontier.has(e.to)) continue
      const delta = DIR_DELTA[e.dir]
      const pos = delta ? { x: base.x + delta.x, y: base.y + delta.y }
                        : { x: base.x, y: base.y + (e.dir === 'UP' ? -1 : 1) }
      if (this._occupied(pos.x, pos.y)) continue
      this.frontier.set(e.to, pos)
    }
  }

  // ---- rendering ----------------------------------------------------------

  render() {
    this._renderMap()
    this._renderButtons()
    this._persist()
  }

  _label(id) {
    const r = this.rooms[id]
    let s = (r && r.desc) || id.replace(/^LOC:/, '')
    if (s.length > 13) s = s.slice(0, 12) + '…'
    return s
  }

  _renderMap() {
    const svg = this.svg
    const NS = 'http://www.w3.org/2000/svg'

    // Collect all nodes with positions.
    const nodes = [] // {id, x, y, kind}
    for (const [id, p] of this.placed) nodes.push({ id, x: p.x, y: p.y, kind: id === this.currentId ? 'current' : 'visited' })
    for (const [id, p] of this.frontier) {
      if (this.placed.has(id)) continue
      nodes.push({ id, x: p.x, y: p.y, kind: 'fog' })
    }
    if (!nodes.length) return

    const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const pad = 30
    const W = (maxX - minX + 1) * CELL_W + pad * 2
    const H = (maxY - minY + 1) * CELL_H + pad * 2
    const px = (x) => pad + (x - minX) * CELL_W + (CELL_W - BOX_W) / 2 + BOX_W / 2
    const py = (y) => pad + (y - minY) * CELL_H + (CELL_H - BOX_H) / 2 + BOX_H / 2

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
    svg.setAttribute('width', W)
    svg.setAttribute('height', H)
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const posOf = (id) => {
      if (this.placed.has(id)) { const p = this.placed.get(id); return { x: px(p.x), y: py(p.y) } }
      if (this.frontier.has(id)) { const p = this.frontier.get(id); return { x: px(p.x), y: py(p.y) } }
      return null
    }

    // Edges (draw once per pair).
    const drawn = new Set()
    for (const [id] of this.placed) {
      const room = this.rooms[id]
      if (!room) continue
      const a = posOf(id)
      for (const e of room.exits) {
        if (!e.to) continue
        const b = posOf(e.to)
        if (!b) continue
        const key = [id, e.to].sort().join('|')
        if (drawn.has(key)) continue
        drawn.add(key)
        const line = document.createElementNS(NS, 'line')
        line.setAttribute('x1', a.x); line.setAttribute('y1', a.y)
        line.setAttribute('x2', b.x); line.setAttribute('y2', b.y)
        const conditional = e.if != null || e.dir === 'UP' || e.dir === 'DOWN'
        line.setAttribute('class', 'edge' + (conditional ? ' edge-cond' : '') +
          (this.frontier.has(e.to) ? ' edge-fog' : ''))
        svg.appendChild(line)
      }
    }

    // Nodes.
    for (const n of nodes) {
      const cx = px(n.x), cy = py(n.y)
      const g = document.createElementNS(NS, 'g')
      g.setAttribute('class', 'node node-' + n.kind)
      const rect = document.createElementNS(NS, 'rect')
      rect.setAttribute('x', cx - BOX_W / 2); rect.setAttribute('y', cy - BOX_H / 2)
      rect.setAttribute('width', BOX_W); rect.setAttribute('height', BOX_H)
      rect.setAttribute('rx', 5)
      g.appendChild(rect)
      const text = document.createElementNS(NS, 'text')
      text.setAttribute('x', cx); text.setAttribute('y', cy)
      text.setAttribute('text-anchor', 'middle')
      text.setAttribute('dominant-baseline', 'central')
      text.textContent = n.kind === 'fog' ? '?' : this._label(n.id)
      g.appendChild(text)
      const title = document.createElementNS(NS, 'title')
      title.textContent = n.kind === 'fog' ? 'Unexplored' : ((this.rooms[n.id] && this.rooms[n.id].desc) || n.id)
      g.appendChild(title)
      svg.appendChild(g)
    }

    // Keep the current room centered in the scroll viewport.
    const scroller = svg.parentElement
    if (scroller) {
      const cur = this.placed.get(this.currentId)
      if (cur) {
        const cx = px(cur.x), cy = py(cur.y)
        scroller.scrollLeft = cx - scroller.clientWidth / 2
        scroller.scrollTop = cy - scroller.clientHeight / 2
      }
    }
  }

  _renderButtons() {
    const el = this.buttonsEl
    el.innerHTML = ''

    // Which directions are actual exits from the current room (to highlight).
    const room = this.rooms[this.currentId]
    const avail = new Set()
    if (room) for (const e of room.exits) if (e.to || e.per) avail.add(e.dir)

    const dirs = document.createElement('div')
    dirs.className = 'btn-col btn-dirs'

    // Compass rose: 8 points in a 3x3 grid, with Up/Down stacked in the centre.
    const compass = document.createElement('div')
    compass.className = 'compass'
    const center = document.createElement('div')
    center.className = 'compass-center'
    center.appendChild(this._dirBtn('UP', avail, 'mini'))
    center.appendChild(this._dirBtn('DOWN', avail, 'mini'))
    const layout = ['NW', 'NORTH', 'NE', 'WEST', center, 'EAST', 'SW', 'SOUTH', 'SE']
    for (const cell of layout) {
      compass.appendChild(cell === center ? center : this._dirBtn(cell, avail))
    }
    dirs.appendChild(compass)

    // In / Out as a portal pair beneath the compass.
    const io = document.createElement('div')
    io.className = 'btn-io'
    io.appendChild(this._dirBtn('IN', avail))
    io.appendChild(this._dirBtn('OUT', avail))
    dirs.appendChild(io)

    // Right column: other actions.
    const actions = document.createElement('div')
    actions.className = 'btn-col btn-actions'
    actions.appendChild(this._button('👁 Look', () => this.submit('look')))
    actions.appendChild(this._button('🎒 Inventory', () => this.submit('inventory')))
    actions.appendChild(this._button('↻ Restart', () => this._restart(), 'btn-restart'))

    el.appendChild(dirs)
    el.appendChild(actions)
  }

  _dirBtn(d, avail, extra) {
    return this._button(
      COMPASS_LABEL[d] || d,
      () => this.submit(DIR_COMMAND[d] || d.toLowerCase()),
      'btn-dir ' + (avail.has(d) ? 'btn-avail' : 'btn-off') + (extra ? ' btn-' + extra : ''),
    )
  }

  _restart() {
    if (typeof confirm === 'function' &&
        !confirm('Restart Zork from the beginning? This erases your saved game.')) return
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('zork1:'))
        .forEach((k) => localStorage.removeItem(k))
    } catch { /* ignore */ }
    location.reload()
  }

  _button(label, onClick, cls) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'gbtn ' + (cls || '')
    b.textContent = label
    b.addEventListener('click', () => {
      onClick()
      this.inputEl.focus()
    })
    return b
  }

  submit(command) {
    if (this.inputEl.disabled) return
    this.inputEl.value = command
    this.inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  }
}
