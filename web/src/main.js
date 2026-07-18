/*
 * Browser entry point: run Microsoft's MIT-licensed compiled Zork I
 * (zork1.z3) on the ifvms Z-machine, wired to our WebGlkOte terminal.
 */

import ZVM from 'ifvms/src/zvm.js'
import WebGlkOte from './web-glkote.js'
import WebDialog from './web-dialog.js'
import GameUI from './game-ui.js'
import './style.css'

// glkapi.js is loaded as a classic script in index.html (it relies on sloppy
// mode) and exposes the Glk API on the global scope.
const Glk = window.Glk

const dom = {
  status: document.getElementById('status'),
  buffer: document.getElementById('buffer'),
  input: document.getElementById('cmd'),
  prompt: document.getElementById('prompt'),
  scroll: document.getElementById('scroll'),
}

async function boot() {
  const url = import.meta.env.BASE_URL + 'zork1.z3'
  let data
  try {
    const resp = await fetch(url)
    if (!resp.ok) throw new Error('HTTP ' + resp.status)
    data = new Uint8Array(await resp.arrayBuffer())
  } catch (err) {
    dom.buffer.textContent = 'Failed to load story file (' + url + '): ' + err.message
    return
  }

  const glkote = new WebGlkOte(dom)

  // Companion UI (fog-of-war map + button bar). Best-effort: if the map data
  // fails to load, the game still runs fine on its own.
  try {
    const mapResp = await fetch(import.meta.env.BASE_URL + 'map.json')
    if (mapResp.ok) {
      const map = await mapResp.json()
      const ui = new GameUI({
        map,
        svg: document.getElementById('map'),
        buttons: document.getElementById('buttonbar'),
        input: dom.input,
      })
      glkote.onCommand = (t) => ui.handleCommand(t)
      glkote.onStatus = (l) => ui.handleStatus(l)
    }
  } catch (err) {
    console.warn('Automap disabled:', err)
  }

  const vm = new ZVM()
  const options = { vm, Dialog: WebDialog, Glk, GlkOte: glkote }

  vm.prepare(data, options)
  Glk.init(options) // triggers GlkOte.init -> VM.init -> first update
}

boot()
