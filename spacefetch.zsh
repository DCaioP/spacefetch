# spacefetch for zsh: draws the block at the top of the screen and keeps it
# animated while you type at the first prompt.
#
# Usage, in .zshrc:
#   source /path/to/spacefetch/spacefetch.zsh
#   spacefetch_start
#
# The animation stops at the first command run (preexec) and on Ctrl+L: a
# command's output scrolls the screen, and the loop would keep painting row 1
# over whatever ended up there. The last frame stays.

SPACEFETCH_DIR=${SPACEFETCH_DIR:-${0:A:h}}

autoload -Uz add-zsh-hook

_spacefetch_stop() {
  [[ -n $_spacefetch_pid ]] && kill $_spacefetch_pid 2>/dev/null
  unset _spacefetch_pid
  add-zsh-hook -d preexec _spacefetch_stop
}

_spacefetch_clear_screen() {
  _spacefetch_stop
  zle .clear-screen
}

# Both processes must draw the same body, so it is picked here, once.
_spacefetch_bodies=(sun rocky gas ice comet hole)

spacefetch_start() {
  (( $# == 0 )) && set -- --zone ${_spacefetch_bodies[RANDOM % $#_spacefetch_bodies + 1]}
  bun "$SPACEFETCH_DIR/src/main.ts" --static --clear "$@" </dev/null || return
  # The loop writes to /dev/tty itself; its stdio stays off the terminal (see main.ts).
  # &! starts it disowned: no "[1] 1234" and no "done" later.
  bun "$SPACEFETCH_DIR/src/main.ts" --loop --shell $$ --columns $COLUMNS --rows $LINES "$@" \
    </dev/null >/dev/null 2>&1 &!
  _spacefetch_pid=$!
  add-zsh-hook preexec _spacefetch_stop
  zle -N clear-screen _spacefetch_clear_screen
}
