import { useEffect, useRef, useState } from 'react'
import {
  ThemeProvider, createTheme, CssBaseline, useMediaQuery,
  Box, SwipeableDrawer, Fab, IconButton, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Link, Typography, Divider,
} from '@mui/material'
import MapIcon from '@mui/icons-material/Map'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import GitHubIcon from '@mui/icons-material/GitHub'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import { createEngine } from './engine.js'
import Celebration from './Celebration.jsx'

const theme = createTheme({
  palette: {
    mode: 'dark',
    success: { main: '#33ff66' },
    background: { default: '#000', paper: '#0a140d' },
  },
})

const MOBILE = '(max-width:820px)'
const REPO_URL = 'https://github.com/ashleydavis/zork'
const BLOG_URL = 'https://codecapers.com.au/'

export default function App() {
  const isMobile = useMediaQuery(MOBILE)
  const [engine, setEngine] = useState(null)
  const [mapOpen, setMapOpen] = useState(false)
  const [invOpen, setInvOpen] = useState(false)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const wonRef = useRef(false)

  const terminalHost = useRef(null)
  const desktopMapHost = useRef(null)
  const desktopInvHost = useRef(null)
  const drawerMapHost = useRef(null)
  const drawerInvHost = useRef(null)

  useEffect(() => {
    let alive = true
    const onWin = () => {
      if (wonRef.current) return
      wonRef.current = true
      setCelebrate(true)
    }
    createEngine({ onWin }).then((e) => { if (alive) setEngine(e) })
    return () => { alive = false }
  }, [])

  // Secret test hotkey: the Konami Code (↑ ↑ ↓ ↓ ← → ← → B A).
  useEffect(() => {
    const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
    let pos = 0
    const onKey = (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (k === seq[pos]) {
        pos++
        if (pos === seq.length) { pos = 0; setCelebrate(true) }
      } else {
        pos = k === seq[0] ? 1 : 0
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (engine && terminalHost.current && engine.terminalEl.parentElement !== terminalHost.current) {
      terminalHost.current.appendChild(engine.terminalEl)
    }
  })

  // Relocate map + inventory between desktop panels and mobile drawers.
  useEffect(() => {
    if (!engine) return
    const mapHost = isMobile ? drawerMapHost.current : desktopMapHost.current
    if (mapHost && engine.mapEl.parentElement !== mapHost) mapHost.appendChild(engine.mapEl)
    const invHost = isMobile ? drawerInvHost.current : desktopInvHost.current
    if (invHost && engine.inventoryEl.parentElement !== invHost) invHost.appendChild(engine.inventoryEl)
    if (engine.ui) setTimeout(() => engine.ui.render(), 0)
  }, [engine, isMobile, mapOpen, invOpen])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <Box sx={{ display: 'flex', height: '100dvh', maxWidth: 1400, mx: 'auto', position: 'relative' }}>
        <Box ref={terminalHost} sx={{ flex: '1 1 auto', minWidth: 0, height: '100%', display: 'flex' }} />
        {!isMobile && (
          <Box sx={{ flex: '0 0 360px', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box ref={desktopMapHost} sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }} />
            <Box ref={desktopInvHost} sx={{ flex: '0 0 40%', minHeight: 0, display: 'flex', borderTop: '1px solid rgba(51,255,102,0.2)' }} />
          </Box>
        )}
      </Box>

      {/* Top-right: direct GitHub link + About */}
      <Box sx={{ position: 'fixed', top: 4, right: 6, zIndex: (t) => t.zIndex.drawer + 3, display: 'flex', gap: 0.5 }}>
        <Tooltip title="Source on GitHub">
          <IconButton size="small" color="success" component="a" href={REPO_URL} target="_blank" rel="noopener">
            <GitHubIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="About">
          <IconButton size="small" color="success" onClick={() => setAboutOpen(true)}>
            <InfoOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {isMobile && (
        <>
          <Fab color="success" size="medium" aria-label="inventory"
            onClick={() => setInvOpen(true)}
            sx={{ position: 'fixed', bottom: 84, right: 16, zIndex: (t) => t.zIndex.drawer + 2 }}>
            <Inventory2Icon />
          </Fab>
          <Fab color="success" size="medium" aria-label="map"
            onClick={() => setMapOpen(true)}
            sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: (t) => t.zIndex.drawer + 2 }}>
            <MapIcon />
          </Fab>

          <SwipeableDrawer anchor="bottom" open={mapOpen}
            onOpen={() => setMapOpen(true)} onClose={() => setMapOpen(false)}
            ModalProps={{ keepMounted: true }}
            PaperProps={{ sx: { height: '72dvh', background: '#070b07', display: 'flex', flexDirection: 'column' } }}>
            <Puller />
            <Box ref={drawerMapHost} sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }} />
          </SwipeableDrawer>

          <SwipeableDrawer anchor="right" open={invOpen}
            onOpen={() => setInvOpen(true)} onClose={() => setInvOpen(false)}
            ModalProps={{ keepMounted: true }}
            PaperProps={{ sx: { width: '82vw', maxWidth: 360, background: '#070b07', display: 'flex', flexDirection: 'column' } }}>
            <Box ref={drawerInvHost} sx={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }} />
          </SwipeableDrawer>
        </>
      )}

      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <Celebration open={celebrate} onClose={() => setCelebrate(false)} />
    </ThemeProvider>
  )
}

function Puller() {
  return (
    <Box sx={{ py: 1, flex: '0 0 auto', display: 'flex', justifyContent: 'center' }}>
      <Box sx={{ width: 44, height: 4, borderRadius: 2, bgcolor: '#2a4a35' }} />
    </Box>
  )
}

function AboutDialog({ open, onClose }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm"
      PaperProps={{ sx: { bgcolor: 'background.paper', color: '#c9ffdc' } }}>
      <DialogTitle sx={{ color: '#33ff66', fontFamily: 'monospace' }}>
        Zork I — The Great Underground Empire
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          The complete, original <b>Zork I</b> running in your browser. It plays Microsoft's
          MIT-licensed ZIL source — compiled to a Z-machine story file — on a Z-machine
          interpreter in TypeScript. The fog-of-war map is generated from the game's own
          <code> 1dungeon.zil</code> source.
        </Typography>
        <Divider sx={{ my: 1.5, borderColor: 'rgba(51,255,102,0.2)' }} />
        <Typography variant="body2" component="div" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <span>🔗 <Link href={REPO_URL} target="_blank" rel="noopener" color="success.main">Source code on GitHub</Link></span>
          <span>✍️ <Link href={BLOG_URL} target="_blank" rel="noopener" color="success.main">My blog — codecapers.com.au</Link></span>
        </Typography>
        <Divider sx={{ my: 1.5, borderColor: 'rgba(51,255,102,0.2)' }} />
        <Typography variant="caption" color="text.secondary">
          Zork © Infocom, open-sourced by Microsoft under the MIT License. Z-machine
          interpreter: ifvms / glkote (MIT, © Dannii Willis). ZORK is a trademark of
          Infocom / Activision. A preservation & education project.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="success">Close</Button>
      </DialogActions>
    </Dialog>
  )
}
