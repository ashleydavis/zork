/*
 * WebGlkOte — a minimal browser GlkOte display for the ifvms Z-machine.
 *
 * It implements the GlkOte <-> glkapi protocol (init / update / send_response)
 * for the two window types Zork I uses: a one-line "grid" status window and a
 * scrolling "buffer" window with line input. Reuses the shared, environment
 * agnostic glkapi.js — this file is only the display + input layer.
 *
 * Protocol reference: the "dumb" and base GlkOte implementations in
 * glkote-term (MIT, Dannii Willis), re-expressed for the DOM.
 */

export default class WebGlkOte {
  constructor(dom) {
    this.statusEl = dom.status
    this.bufferEl = dom.buffer
    this.inputEl = dom.input
    this.promptEl = dom.prompt
    this.scrollEl = dom.scroll

    this.generation = 0
    this.disabled = false
    this.interface = null
    this.windows = {} // id -> {type}
    this.gridId = null
    this.bufferId = null

    this.current_input = null // {id, type}
    this._charHandler = null

    // Optional observers (used by the automap + button bar). Assigned by main.
    this.onCommand = null // (text) => void   when the player submits a line
    this.onStatus = null // (location) => void when the status line changes
    this.onOutput = null // () => void        after each screen update completes
    this.onScore = null // (score) => void    when the status-line score changes

    this._wireInput()
  }

  // ---- lifecycle -----------------------------------------------------------

  getinterface() { return this.interface }

  init(iface) {
    if (!iface || !iface.accept) throw 'WebGlkOte: interface must have accept()'
    this.interface = iface
    this.send_response('init', null, this.measure_window())
  }

  measure_window() {
    // Use the "character units" trick: report sizes in columns/rows by setting
    // every char metric to 1px. Columns are measured from a monospace sample.
    const { cols, rows } = this._measureCols()
    return {
      buffercharheight: 1, buffercharwidth: 1, buffermarginx: 0, buffermarginy: 0,
      gridcharheight: 1, gridcharwidth: 1, gridmarginx: 0, gridmarginy: 0,
      graphicsmarginx: 0, graphicsmarginy: 0,
      inspacingx: 0, inspacingy: 0, outspacingx: 0, outspacingy: 0,
      width: cols, height: rows,
    }
  }

  _measureCols() {
    const probe = document.createElement('span')
    probe.textContent = '0'.repeat(80)
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;'
    this.bufferEl.appendChild(probe)
    const charW = probe.getBoundingClientRect().width / 80 || 8
    this.bufferEl.removeChild(probe)
    const w = this.scrollEl.clientWidth || 640
    const h = this.scrollEl.clientHeight || 480
    const cols = Math.max(40, Math.min(120, Math.floor(w / charW)))
    const rows = Math.max(10, Math.floor(h / (charW * 2)))
    return { cols, rows }
  }

  // ---- update dispatch (mirrors base GlkOte.update) ------------------------

  update(data) {
    if (data.type === 'error') throw data.message
    if (data.type === 'pass' || data.type === 'retry') return
    if (data.type !== 'update' && data.type !== 'exit') return
    if (data.gen <= this.generation && this.generation !== 0) { /* allow */ }
    this.generation = data.gen

    if (data.input != null) this.cancel_inputs(data.input)
    if (data.windows != null) this.update_windows(data.windows)
    if (data.content != null && data.content.length) this.update_content(data.content)
    if (data.input != null) this.update_inputs(data.input)

    this.disable(!!(data.disabled || data.specialinput))
    if (data.specialinput != null) this.accept_specialinput(data.specialinput)
    if (this.onOutput) this.onOutput()
    if (data.type === 'exit') this.exit()
  }

  update_windows(wins) {
    wins.forEach((w) => {
      this.windows[w.id] = w
      if (w.type === 'grid') this.gridId = w.id
      if (w.type === 'buffer') this.bufferId = w.id
    })
  }

  update_content(content) {
    content.forEach((win) => {
      if (win.id === this.gridId || win.lines) this._renderGrid(win)
      else this._renderBuffer(win)
    })
    this._scrollToBottom()
  }

  _renderGrid(win) {
    if (!win.lines) return
    // Zork uses a single status line: build text from row 0 runs.
    const parts = []
    win.lines.forEach((ln) => {
      if (ln.line !== 0) return
      parts.push(this._runsToText(ln.content))
    })
    if (parts.length) {
      const line = parts.join('')
      this.statusEl.textContent = line
      // Location is the left-justified part before the score/turns columns.
      const loc = line.replace(/\s{2,}.*$/, '').trim()
      if (loc && this.onStatus) this.onStatus(loc)
      if (this.onScore) {
        const m = line.match(/Score:\s*(-?\d+)/i)
        if (m) this.onScore(parseInt(m[1], 10))
      }
    }
  }

  _renderBuffer(win) {
    if (win.clear) this.bufferEl.textContent = ''
    if (!win.text) return
    win.text.forEach((line) => {
      if (!line.append) this.bufferEl.appendChild(document.createTextNode('\n'))
      const runs = line.content
      if (!runs) return
      for (let i = 0; i < runs.length; i++) {
        let style, text
        if (typeof runs[i] === 'string') { style = runs[i]; text = runs[++i] }
        else { style = runs[i].style; text = runs[i].text }
        if (text == null) continue
        const span = document.createElement('span')
        span.className = 'sty_' + (style || 'normal')
        span.textContent = text
        this.bufferEl.appendChild(span)
      }
    })
  }

  _stripTrailingPrompt() {
    // Remove a trailing ">" (with any spaces) from the end of the transcript,
    // keeping preceding newlines. Called when line input is requested.
    let node = this.bufferEl.lastChild
    while (node && node.textContent === '') { const p = node.previousSibling; this.bufferEl.removeChild(node); node = p }
    if (!node) return
    const m = node.textContent.match(/>[ \t]*$/)
    if (m) {
      node.textContent = node.textContent.slice(0, m.index)
      if (node.textContent === '') this.bufferEl.removeChild(node)
    }
  }

  _runsToText(runs) {
    if (!runs) return ''
    let out = ''
    for (let i = 0; i < runs.length; i++) {
      if (typeof runs[i] === 'string') out += runs[++i]
      else out += runs[i].text
    }
    return out
  }

  // ---- input ---------------------------------------------------------------

  cancel_inputs() {
    this.current_input = null
    this._setInputEnabled(false)
  }

  update_inputs(inputs) {
    if (!inputs.length) return
    const req = inputs[0]
    this.current_input = { id: req.id, type: req.type }
    if (req.type === 'line') {
      // The game prints a ">" prompt while it waits for input; we show a fixed
      // input line instead, so strip that dangling prompt from the transcript.
      this._stripTrailingPrompt()
      this._setInputEnabled(true)
      this.inputEl.focus()
    } else if (req.type === 'char') {
      // Any keypress satisfies a char request.
      this._setInputEnabled(true, true)
      this.inputEl.focus()
    }
  }

  _wireInput() {
    this.inputEl.addEventListener('keydown', (e) => {
      if (!this.current_input || this.disabled) return
      if (this.current_input.type === 'char') {
        e.preventDefault()
        const key = this._keyName(e)
        if (key == null) return
        const win = { id: this.current_input.id }
        this.current_input = null
        this._setInputEnabled(false)
        this.send_response('char', win, key)
        return
      }
      if (this.current_input.type === 'line' && e.key === 'Enter') {
        e.preventDefault()
        const text = this.inputEl.value
        this.inputEl.value = ''
        const win = { id: this.current_input.id }
        this.current_input = null
        this._setInputEnabled(false)
        if (this.onCommand) this.onCommand(text)
        // We stripped the game's ">" prompt, so re-add one for the echoed
        // command. glkapi appends the entered line to this same line, giving
        // the classic ">command" in the transcript.
        const p = document.createElement('span')
        p.className = 'sty_prompt'
        p.textContent = '>'
        this.bufferEl.appendChild(p)
        this.send_response('line', win, text)
      }
    })
    // Keep focus on the input when clicking anywhere in the terminal.
    this.scrollEl.addEventListener('mousedown', (e) => {
      if (window.getSelection().toString()) return
      if (e.target.tagName !== 'INPUT') setTimeout(() => this.inputEl.focus(), 0)
    })
  }

  _keyName(e) {
    const map = {
      Enter: 'return', ' ': 'space', Escape: 'escape', Tab: 'tab',
      Backspace: 'delete', Delete: 'delete',
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
    }
    if (map[e.key]) return map[e.key]
    if (e.key.length === 1) return e.key
    if (/^F\d+$/.test(e.key)) return 'func' + e.key.slice(1)
    return null
  }

  _setInputEnabled(on, isChar) {
    this.inputEl.disabled = !on
    this.promptEl.style.visibility = on && !isChar ? 'visible' : 'hidden'
    this.inputEl.style.opacity = on ? '1' : '0.4'
  }

  disable(flag) {
    this.disabled = flag
    if (flag) this._setInputEnabled(false)
  }

  exit() {
    this.disable(true)
    const span = document.createElement('span')
    span.className = 'sty_note'
    span.textContent = '\n[The game has ended. Reload the page to play again.]\n'
    this.bufferEl.appendChild(span)
    this._scrollToBottom()
  }

  accept_specialinput(data) {
    // Save/restore file prompt: use a single stable slot per file type so the
    // player doesn't have to type a filename (browser localStorage save).
    if (data && data.type === 'fileref_prompt') {
      const ref = { filename: 'zork1-' + (data.filetype || 'save'), usage: data.filetype }
      this.send_response('specialresponse', null, 'fileref_prompt', ref)
    }
  }

  _scrollToBottom() {
    this.scrollEl.scrollTop = this.scrollEl.scrollHeight
  }

  // ---- responses back to the VM (mirrors base GlkOte.send_response) --------

  send_response(type, win, val, val2) {
    const res = { type, gen: this.generation }
    if (win) res.window = win.id
    if (type === 'init' || type === 'arrange') res.metrics = val
    if (type === 'init') res.support = this.support()
    if (type === 'char' || type === 'line') res.value = val
    if (type === 'specialresponse') { res.response = val; res.value = val2 }
    this.interface.accept(res)
  }

  support() { return [] }
  log() {}
  warning() {}
  error(msg) { throw msg }
}
