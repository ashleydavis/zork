import { useEffect, useRef } from 'react'
import { Box, Button, Typography } from '@mui/material'

/*
 * Full-page victory celebration: a canvas confetti storm behind a glowing
 * banner. Shown when the player reaches 350/350 points (or via the secret
 * hotkey). Self-contained — no external libraries.
 */
export default function Celebration({ open, onClose }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!open || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf, W, H
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight
      canvas.width = W * dpr; canvas.height = H * dpr
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const colors = ['#33ff66', '#9dffbf', '#ffd166', '#ff6b6b', '#6bc1ff', '#ffffff', '#c77dff']
    const rnd = (a, b) => a + Math.random() * (b - a)
    const spawn = (top) => ({
      x: rnd(0, W), y: top ? rnd(-H * 0.4, -10) : rnd(-20, H),
      r: rnd(4, 10), c: colors[(Math.random() * colors.length) | 0],
      vy: rnd(1.5, 4.5), vx: rnd(-2, 2), a: rnd(0, Math.PI * 2), va: rnd(-0.25, 0.25),
    })
    const parts = Array.from({ length: 260 }, () => spawn(false))

    const frame = () => {
      ctx.clearRect(0, 0, W, H)
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.a += p.va
        if (p.y > H + 20) Object.assign(p, spawn(true))
        ctx.save()
        ctx.translate(p.x, p.y); ctx.rotate(p.a)
        ctx.fillStyle = p.c
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6)
        ctx.restore()
      }
      raf = requestAnimationFrame(frame)
    }
    frame()
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [open])

  if (!open) return null
  return (
    <Box sx={{
      position: 'fixed', inset: 0, zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(3,12,6,0.80), rgba(0,0,0,0.94))',
    }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0 }} />
      <Box sx={{ position: 'relative', textAlign: 'center', px: 3 }}>
        <Typography sx={{
          fontFamily: 'monospace', fontWeight: 'bold', color: '#33ff66',
          fontSize: { xs: '2.2rem', sm: '3.6rem' }, letterSpacing: '0.12em',
          textShadow: '0 0 22px rgba(51,255,102,0.85)', animation: 'zork-pulse 1.2s ease-in-out infinite',
        }}>
          ★ YOU WON! ★
        </Typography>
        <Typography sx={{ fontFamily: 'monospace', color: '#e6fff0', mt: 1.5, fontSize: { xs: '1rem', sm: '1.35rem' } }}>
          The Great Underground Empire is yours.
        </Typography>
        <Typography sx={{ fontFamily: 'monospace', color: '#9dffbf', mt: 0.5 }}>
          350 / 350 points — the rank of Master Adventurer
        </Typography>
        <Button onClick={onClose} variant="outlined" color="success"
          sx={{ mt: 3.5, fontFamily: 'monospace' }}>
          Continue
        </Button>
      </Box>
    </Box>
  )
}
