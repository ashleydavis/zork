# TODO / Ideas

## Next up

1. **LLM-interpreted input.** Let the player type free-form natural language
   ("grab the lamp and head down into the cellar") and have an LLM translate it
   into one or more canonical Zork commands before they're sent to the parser.
   - Keep raw typing working as a fallback / bypass.
   - Likely needs an API key + a small proxy (the game itself stays static).

## Backlog

- **Map: mazes & duplicate-name rooms.** Rooms that share a status-line name
  (Maze, Forest) currently can't be told apart from the status line alone;
  disambiguate using movement history against `data/map.json`.
- **Map: up/down/in/out placement.** These have no planar direction and are
  spiral-placed; consider a dedicated vertical-level or icon treatment.
- **Map polish.** Pan/zoom controls, click a room to see its full description,
  persist explored map to `localStorage` across reloads.
- **Zork II & III.** Same `historicalsource` repos ship `.z3` files; add a game
  picker and per-game maps.
- **Mobile input.** On-screen direction pad / keyboard for touch devices.
- **Share saves.** Encode save state into a shareable URL.
