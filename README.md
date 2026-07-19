# Zork I — The Great Underground Empire

The **entire, original Zork I** running in your browser and in your terminal —
powered by Microsoft's MIT-licensed ZIL, compiled to Z-machine bytecode, and
executed by a Z-machine interpreter in TypeScript/JavaScript.

▶ **Play in the browser: https://ashleydavis.github.io/zork/**

Published by [Ashley Davis](https://codecapers.com.au/) — read more on my blog,
[codecapers.com.au](https://codecapers.com.au/).

![Zork I in the browser](docs/screenshot.png)

## 🤖 Built entirely by Claude

Every part of this project was written by **Claude** (Anthropic's AI assistant),
driven through **Claude Code** — the Z-machine wiring, the terminal (bun) and
React + MUI browser front-ends, the map extractor, the auto-map and inventory
panels, autosave/auto-restore, the win celebration, the GitHub Pages pipeline,
and this README. The human in the loop supplied the ideas, direction, and
review; Claude did the implementation.

## What this is

In 2025 Microsoft [open-sourced the original Infocom source code for Zork I, II
and III](https://opensource.microsoft.com/blog/2025/11/20/preserving-code-that-shaped-generations-zork-i-ii-and-iii-go-open-source/)
under the MIT license, at
[github.com/historicalsource/zork1](https://github.com/historicalsource/zork1).

That source is written in **ZIL** (Zork Implementation Language). ZIL is not
interpreted directly — Infocom's tools compiled it into bytecode for a virtual
machine called the **Z-machine**. The Microsoft repo ships both the ZIL source
*and* the compiled result (`COMPILED/zork1.z3`).

This project takes that compiled game and runs it on a **Z-machine interpreter**
([ifvms](https://github.com/curiousdannii/ifvms), the engine behind Parchment),
wrapped in two front-ends:

```
zork1.zil            Microsoft's MIT-licensed ZIL source  (game/zork1.zil, for provenance)
   │  (Infocom's compiler produced …)
   ▼
zork1.z3             the compiled game — real Z-machine v3 bytecode  (game/zork1.z3)
   │  executed by
   ▼
ifvms Z-machine      a TypeScript/JS Z-machine interpreter
   │  driven through the Glk I/O layer (glkapi) by
   ├── cli/zork.mjs        → terminal front-end (bun + glkote-term)
   └── web/                → browser front-end (Vite + React + MUI)
```

Because it runs the *actual* compiled game, this is not a re-implementation —
it is Zork I, byte for byte (Release 119 / Serial 880429), with the complete
map, parser, thief, combat, puzzles, and scoring.

## Play in the terminal

Requires [Bun](https://bun.sh).

```sh
bun install
bun run play
```

You can also point it at any other Z-machine v3–8 story file:

```sh
bun cli/zork.mjs path/to/other-game.z5
```

## Play in the browser (local dev)

```sh
bun install
bun run dev       # Vite dev server
bun run build     # production build → docs/  (served by GitHub Pages)
bun run preview   # preview the production build
```

The web front-end is a **React + MUI** shell around a self-contained "glass
terminal": a status line (the Z-machine *grid* window), a scrolling transcript
(the *buffer* window) with the command input inline beneath it. The Z-machine
engine itself stays vanilla and imperative — React just hosts its DOM and, on
mobile, relocates the side panels into drawers.

Browser-only companion features (the terminal experience is untouched):

- **Auto-map** — rooms are drawn as you visit them, with adjacent-but-unexplored
  rooms shown as dim `?` markers and the current room highlighted. Desktop: a
  panel on the right. Mobile: a drawer that slides up from the bottom.
- **Inventory panel** — parsed from the game's own `inventory` output. Desktop:
  under the map. Mobile: a drawer that slides in from the right.
- **Compass button bar** — the eight compass points arranged as a rose, with
  up/down stacked in the centre and in/out beneath; the current room's real
  exits are highlighted. Plus Look / Inventory / Restart. Buttons just submit
  commands — typing still works exactly as before.
- **Autosave & auto-restore** — the full interpreter state is snapshotted to
  `localStorage` after every move (via ifvms' `do_vm_autosave`), and the game,
  transcript, and explored map are restored automatically when you return.
  Restart wipes the save and starts fresh.
- **Right-side nav bar** with links to this repo and the author's blog (an
  About dialog carries the same links plus credits).
- **A victory celebration** when you finish the game. 🎉 (There may or may not
  be a secret way to preview it.)

## The map (`data/map.yaml` / `data/map.json`)

`tools/zil-to-yaml.mjs` parses Microsoft's `1dungeon.zil` — the exact ZIL our
`zork1.z3` was compiled from — into a complete map of all **110 rooms** and
**352 exits**, capturing normal, conditional (`if: WON-FLAG`), door
(`if: "TRAP-DOOR IS OPEN"`), blocked (with message) and routine (`per`) exits,
plus each room's flags, globals, description and action. The browser auto-map
reads `data/map.json`. Regenerate both with:

```sh
bun run map
```

## How the browser front-end works

The glue lives in `web/src`:

- **`engine.js`** — builds the terminal + map + inventory DOM, fetches
  `zork1.z3` and `map.json`, and boots the ifvms VM wired to `glkapi`, our
  display, and dialog (with `do_vm_autosave` enabled).
- **`App.jsx`** — the React + MUI shell: responsive layout, mobile drawers/FABs,
  the About dialog, the nav bar, and the win-celebration trigger.
- **`web-glkote.js`** — a minimal implementation of the
  [GlkOte](https://eblong.com/zarf/glk/glkote/docs.html) display protocol for
  the DOM: translates Glk window updates into DOM, turns input back into Glk
  events, and saves/restores the transcript for autosave.
- **`web-dialog.js`** — a `localStorage`-backed Dialog for SAVE / RESTORE and
  the whole-VM autosave snapshot.
- **`game-ui.js`** — tracks the current room from the status line + movement,
  draws the auto-map, renders the compass, and parses the inventory panel.

`glkapi.js` (the shared Glk API library) is loaded as a classic script because
it predates modules and relies on sloppy-mode globals; everything else is
bundled by Vite.

## Deployment

GitHub Pages is configured as **Deploy from a branch → `/docs`**.
`.github/workflows/deploy.yml` rebuilds the Vite app into `docs/` with `bun` and
commits it on every push, so the published site always matches the source.

## Licenses & credits

- **Zork I** — ZIL source and compiled `zork1.z3`: © Infocom, released by
  **Microsoft under the MIT License** (see `game/MICROSOFT-LICENSE.txt`).
  <https://github.com/historicalsource/zork1>
- **ifvms** (Z-machine interpreter) and **glkote-term** / **glkapi** — MIT,
  © Dannii Willis and contributors.
  <https://github.com/curiousdannii/ifvms>
- This project's own code (CLI, React/MUI front-end, GlkOte/Dialog shims, map
  tooling) — MIT. Written by Claude.

ZORK is a trademark of Infocom / Activision. This is a preservation/education
project built on officially open-sourced code.
