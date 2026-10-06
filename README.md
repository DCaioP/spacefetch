# spacefetch

O corpo celeste do mod token-space, animado em truecolor ao lado das informações do sistema.
O corpo é sorteado entre os seis a cada terminal; a barra mostra o uso de memória.

    bun src/main.ts                    # 3 s de animação, corpo sorteado, fica o último quadro
    bun src/main.ts --zone gas         # força a zona: sun rocky gas ice comet hole
    bun src/main.ts --percent 95       # escolhe a zona pelo uso (aqui, fingido)
    bun src/main.ts --seconds 0 --static

Dados do sistema vêm do `fastfetch --pipe`. Os shaders são cópia parametrizada dos do mod
(`~/.claude/skills/token-space/hooks/sprites.ts`), que estão presos à grade de 14×8.

## Animado enquanto se digita

    source ~/programing/personal/spacefetch/spacefetch.zsh
    spacefetch_start

Desenha o bloco no topo de uma tela limpa e deixa um `--loop` em segundo plano repintando só
aquelas linhas (salva o cursor, pinta a partir da linha 1, devolve o cursor; um `write` por quadro).
Para no primeiro comando executado (`preexec`), no Ctrl+L, se o shell morrer ou depois de 10 min.
