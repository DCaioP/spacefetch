# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A fastfetch-style terminal greeter: one of six celestial bodies from the `token-space` Claude Code mod, animated in truecolor beside a box of system info. Bun + TypeScript, no runtime dependencies. README and shell comments are in Portuguese; code comments are in English.

## Commands

    bun install                          # only dev deps (typescript, @types/bun)
    bun run check                        # tsc --noEmit — the only check; there are no tests or linter
    bun src/main.ts                      # 3 s animation, random body, leaves the last frame
    bun src/main.ts --zone gas           # force a body: sun rocky gas ice comet hole
    bun src/main.ts --percent 95         # pick the zone by a (fake) memory fill
    bun src/main.ts --seconds 0 --static # single frame
    bun src/main.ts --static --clear     # single frame at the top of a cleared screen
    bun src/main.ts --loop --shell PID   # background repaint of rows 1..N until PID dies / SIGTERM / 10 min

Requires `fastfetch` on PATH (system info) and Linux `/proc/meminfo` (memory percent).

## Architecture

Pipeline per frame (`src/main.ts`): `sysinfo` → `zones` → `panel` (built once) → `layout.planLayout` (once, from terminal size) → each tick `canvas.renderBody` + `layout.compose` → one `writeSync`.

- **Time unit**: `t` is in mod ticks (8/s) regardless of FPS (30 foreground, 20 in `--loop`). Shaders and sky animate on `t`, so changing FPS must not change animation speed.
- **`shaders.ts`**: parametrized copy of the mod's sprites (`~/.claude/skills/token-space/hooks/sprites.ts`), which are locked to a 14×8 grid. Here each shader takes continuous coords in base units (0..14 × 0..8) plus `t`, returning `0xRRGGBB` or `null` (transparent → sky shows through). Keep visual parity with the mod when editing.
- **`canvas.ts`**: rasterizes at an arbitrary `scale` using half-blocks (`▀`/`▄`, two pixels per cell) and only emits color escapes when the color changes. Cells outside the body fall back to `sky.ts` (drifting braille dust, sparkles, meteors), all deterministic via `hash()`.
- **`layout.ts`**: body height is tied to the panel's height (`scale = panelHeight*2/BASE_HEIGHT`). Modes: side-by-side (sky fills the gap to a right-aligned panel), stacked (narrow/tall terminals), or squeezed side-by-side as fallback.
- **`zones.ts`**: same zone map as the mod; memory % → body/name/color. The zone color tints the panel (`panel.ts`).
- **Colors** are plain `number`s (`0xRRGGBB`); `color.ts` has `mix`/`shade`/`fg`/`bg`.

### Shell integration (`spacefetch.zsh`)

`spacefetch_start` picks the body once in zsh (both processes must draw the same one), runs `--static --clear`, then spawns `--loop --shell $$` disowned (`&!`). The loop saves the cursor (`ESC 7`), repaints rows from 1, restores the cursor (`ESC 8`), wrapped in synchronized output (`?2026`) and issued as a **single write** so the kernel never interleaves it with the shell's output. It stops on `preexec` and Ctrl+L (output would scroll the block away and the loop would paint over it). In the loop each line is erased (`2K`) *before* painting — erasing after a full-width line would wipe the panel's right border.
