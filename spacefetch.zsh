# spacefetch para o zsh: desenha o bloco no topo da tela e o mantém animado
# enquanto se digita no primeiro prompt.
#
# Uso, no zshrc (no lugar do ghosttyfetch):
#   source ~/programing/personal/spacefetch/spacefetch.zsh
#   spacefetch_start
#
# A animação para no primeiro comando executado (preexec) e no Ctrl+L: a saída
# de um comando rola a tela, e o loop continuaria pintando a linha 1, por cima
# do que estiver ali. O último quadro fica.

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

# Os dois processos precisam do mesmo corpo: o sorteio é feito aqui, uma vez.
_spacefetch_bodies=(sun rocky gas ice comet hole)

spacefetch_start() {
  (( $# == 0 )) && set -- --zone ${_spacefetch_bodies[RANDOM % $#_spacefetch_bodies + 1]}
  bun "$SPACEFETCH_DIR/src/main.ts" --static --clear "$@" </dev/null || return
  # &! já nasce desanexado: nada de "[1] 1234" nem de "done" depois.
  bun "$SPACEFETCH_DIR/src/main.ts" --loop --shell $$ "$@" </dev/null &!
  _spacefetch_pid=$!
  add-zsh-hook preexec _spacefetch_stop
  zle -N clear-screen _spacefetch_clear_screen
}
