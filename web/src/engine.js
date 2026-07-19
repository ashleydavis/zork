/*
 * engine.js — builds the imperative game DOM (terminal + map) and boots the
 * ifvms Z-machine on it. React/MUI owns the responsive shell and simply hosts
 * these two elements, relocating the map between a desktop panel and a mobile
 * drawer. Keeping the engine outside React reconciliation means moving it with
 * appendChild never tears down the running VM.
 */

import ZVM from 'ifvms/src/zvm.js'
import WebGlkOte from './web-glkote.js'
import WebDialog from './web-dialog.js'
import GameUI from './game-ui.js'

// glkapi.js is loaded as a classic script (see index.html) and lives on window.
const Glk = window.Glk

function el(html) {
  const t = document.createElement('template')
  t.innerHTML = html.trim()
  return t.content.firstChild
}

export async function createEngine(opts = {}) {
  // Terminal: status bar, scrolling transcript with the input inline at the end
  // (so the prompt sits under the text, not glued to the viewport bottom), and
  // a button bar of controls.
  const terminalEl = el(`
    <div class="screen">
      <div id="status">Zork I</div>
      <div id="scroll">
        <div id="buffer"></div>
        <div id="inputline">
          <span id="prompt">&gt;</span>
          <input id="cmd" type="text" autocomplete="off" autocorrect="off"
                 autocapitalize="off" spellcheck="false" disabled />
        </div>
      </div>
      <div id="buttonbar"></div>
    </div>`)

  const mapEl = el(`
    <div class="mappanel">
      <div id="maptitle">MAP <span id="maphint">— explored areas</span></div>
      <div id="mapscroll"><svg id="map" xmlns="http://www.w3.org/2000/svg"></svg></div>
    </div>`)

  const inventoryEl = el(`
    <div class="invpanel">
      <div id="invtitle">INVENTORY <span id="invhint">— tap 🎒 to refresh</span></div>
      <div id="invlist"><div class="inv-empty">Tap 🎒 Inventory to see what you're carrying.</div></div>
    </div>`)

  const q = (root, sel) => root.querySelector(sel)
  const dom = {
    status: q(terminalEl, '#status'),
    buffer: q(terminalEl, '#buffer'),
    input: q(terminalEl, '#cmd'),
    prompt: q(terminalEl, '#prompt'),
    scroll: q(terminalEl, '#scroll'),
  }

  const glkote = new WebGlkOte(dom)

  // Winning Zork I means reaching the maximum score of 350.
  if (opts.onWin) {
    glkote.onScore = (score) => { if (score >= 350) opts.onWin() }
  }

  let ui = null
  try {
    const resp = await fetch(import.meta.env.BASE_URL + 'map.json')
    if (resp.ok) {
      const map = await resp.json()
      ui = new GameUI({
        map,
        svg: q(mapEl, '#map'),
        buttons: q(terminalEl, '#buttonbar'),
        input: dom.input,
        buffer: dom.buffer,
        inventory: q(inventoryEl, '#invlist'),
      })
      glkote.onCommand = (t) => ui.handleCommand(t)
      glkote.onStatus = (l) => ui.handleStatus(l)
      glkote.onOutput = () => ui.handleOutput()
    }
  } catch (err) {
    console.warn('Automap disabled:', err)
  }

  // Load the story file and start.
  const url = import.meta.env.BASE_URL + 'zork1.z3'
  const data = new Uint8Array(await (await fetch(url)).arrayBuffer())
  const vm = new ZVM()
  const options = { vm, Dialog: WebDialog, Glk, GlkOte: glkote }
  vm.prepare(data, options)
  Glk.init(options)

  return { terminalEl, mapEl, inventoryEl, ui }
}
