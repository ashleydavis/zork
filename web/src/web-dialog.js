/*
 * WebDialog — a minimal non-streaming Dialog for glkapi, backed by
 * localStorage. Supports SAVE / RESTORE (and script/command files) entirely
 * in the browser. Binary content is stored base64-encoded.
 */

const PREFIX = 'zork1:file:'

function keyFor(ref) {
  return PREFIX + (ref.usage || 'data') + ':' + ref.filename
}

function bytesToB64(bytes) {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 0xff)
  return btoa(s)
}

function b64ToBytes(b64) {
  const s = atob(b64)
  const out = new Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff
  return out
}

const WebDialog = {
  streaming: false,

  file_clean_fixed_name(filename, usage) {
    return String(filename || 'file').replace(/[^A-Za-z0-9_.-]/g, '_')
  },

  file_construct_ref(filename, usage, gameid) {
    return { filename: filename || 'zork1', usage: usage || 'data', gameid }
  },

  file_construct_temp_ref(usage) {
    return { filename: 'temp_' + Math.floor(Math.random() * 1e9), usage: usage || 'data', temp: true }
  },

  file_ref_exists(ref) {
    try { return localStorage.getItem(keyFor(ref)) != null } catch { return false }
  },

  file_remove_ref(ref) {
    try { localStorage.removeItem(keyFor(ref)) } catch {}
  },

  file_read(ref /*, israw */) {
    let data
    try { data = localStorage.getItem(keyFor(ref)) } catch { data = null }
    if (data == null) return null
    return b64ToBytes(data)
  },

  file_write(ref, content /*, israw */) {
    let bytes
    if (content == null || content === '') bytes = []
    else if (typeof content === 'string') {
      bytes = new Array(content.length)
      for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i) & 0xff
    } else {
      bytes = content
    }
    try { localStorage.setItem(keyFor(ref), bytesToB64(bytes)) } catch {}
    return true
  },

  // ---- autosave (whole-VM snapshot, JSONable) ----------------------------

  autosave_read(signature) {
    try {
      const s = localStorage.getItem('zork1:autosave:' + signature)
      return s ? JSON.parse(s) : null
    } catch { return null }
  },

  autosave_write(signature, snapshot) {
    const key = 'zork1:autosave:' + signature
    try {
      if (snapshot == null) {
        localStorage.removeItem(key)
        // Autosave cleared (quit / game over) — keep the map state in sync.
        localStorage.removeItem('zork1:mapstate')
      } else {
        localStorage.setItem(key, JSON.stringify(snapshot))
      }
    } catch (e) {
      // Storage full / serialization issue — drop autosave rather than crash.
      try { localStorage.removeItem(key) } catch { /* ignore */ }
    }
  },
}

export default WebDialog
