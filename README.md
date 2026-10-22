# browserUO

PvP enxuto no estilo Ultima Online, rodando no navegador. Projeto pessoal.
**Marco 1:** arena com sprites reais do cliente, movimento no estilo UO e editor de arena interno.
**Marco 2:** combate de magia (era ML) contra bots, com ícones, sons e efeitos do cliente.
**Marco 3:** animações originais de personagens e criaturas, com spawn de cavalos, montarias e monstros.

## Como rodar

```bash
npm install
npm run dev      # abre em http://localhost:5173
npm test         # testes unitários (lógica pura)
npm run tipos    # checagem de tipos
npm run e2e      # teste de fumaça no navegador (precisa do `npm run dev` ativo)
```

### Sprites do cliente

Os PNGs **não ficam no git** (`public/sprites/` está no `.gitignore`). Depois de clonar, gere-os a partir do
cliente do UO Outlands instalado (Python 3.10+, sem dependências):

```bash
python scripts/extrator/extrair_sprites.py
# outra pasta: python scripts/extrator/extrair_sprites.py --cliente "D:/Jogos/Ultima Online Outlands"
```

O mesmo comando grava, também fora do git: ícones das magias (`public/gumps/`), sons (`public/sons/`),
efeitos de magia (`public/efeitos/`) e animações de personagens e criaturas (`public/animacoes/`, ~35 s).
Sem esses arquivos o jogo funciona com losangos/caixas, siglas no lugar dos ícones, efeitos desenhados, boneco simples
e sem som.

O `npm run e2e` usa o Playwright. Se o Chromium dele não estiver instalado: `npx playwright install chromium`
(ou aponte `CHROMIUM_PATH` para um Chromium existente, ex.: o Edge em
`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`).

## Controles

| Ação | Como |
|---|---|
| Andar | Segurar o **botão esquerdo** do mouse na direção desejada (8 direções) |
| Correr | Segurar com o cursor **longe** do personagem (> 130 px); perto = andar |
| Abrir/fechar editor | Tecla **E** |
| Editor: usar ferramenta | Botão esquerdo (arrastar pinta) |
| Editor: apagar | Botão direito |
| Editor: mover a câmera | W/A/S/D ou setas |
| Editor: grade | Tecla **G** |
| Lançar magia | Teclas **1** a **0** ou clique na barra de magias: a mira abre na hora |
| Escolher alvo | Clique no personagem · **T**: último alvo · **Y**: você mesmo · **Esc**: cancelar |
| Bots de teste | Painel no canto superior direito: bot parado (boneco) ou bot ativo (anda e lança magias) |
| Criaturas | Mesmo painel: escolher na lista e **+ Criatura**, ou **Spawn aleatório (6)** |

Tempos por passo (como no UO a pé): andar 400 ms, correr 200 ms.

## Combate

Regras em `src/combate/regras.json` (dá para ajustar sem mexer no código) e explicadas em
`docs/regras-magias-ml.md`. Todos os personagens usam o mesmo mago: skills em 100, Str 100 / Dex 25 / Int 100,
resistências 70, FC 2 e FCR 6.

| Tecla | Magia | Círculo | Mana |
|---|---|---|---|
| 1 | Energy Bolt | 6 | 20 |
| 2 | Explosion | 6 | 20 |
| 3 | Flamestrike | 7 | 40 |
| 4 | Lightning | 4 | 11 |
| 5 | Poison (Deadly a até 2 tiles) | 3 | 9 |
| 6 | Paralyze (27 s; 20 s se resistir) | 5 | 14 |
| 7 | Heal | 1 | 4 |
| 8 | Greater Heal | 4 | 11 |
| 9 | Cure | 2 | 6 |
| 0 | Magic Reflection (clássico: reflete magias) | 5 | 14 |

- **Mira primeiro** (estilo Sphere/DMS): a tecla abre a mira, o clique no alvo começa o cast e o efeito sai no fim
  do tempo de cast. Durante o cast o personagem não anda; qualquer dano interrompe (*fizzle*). A mana só é gasta
  quando a magia sai; se o alvo morreu, saiu do alcance ou da visão nesse meio tempo, a magia falha sem gastar mana.
- `atrasoMs` em `regras.json` soma um atraso extra ao dano (o UO original usa 3000 na Explosion).
- Heal e Greater Heal não funcionam em alvo envenenado. Dano quebra a paralisia.
- Muros bloqueiam a linha de visão; alcance de mira de 10 tiles. Ao morrer, renasce em 5 s.

## Animações e criaturas

- Personagens (você em robe azul, bots em robe vermelho) e criaturas usam as animações do `anim.uoo`: parado, andar,
  correr, castar e morrer, nas 8 direções (5 guardadas + 3 espelhadas, como no cliente).
- Cores de pele, cabelo e roupa vêm do `hues.mul` (lista em `selecao.json` → `animacoes.matizes`).
- Criaturas disponíveis: cavalos, ostards, lhama, lobo, urso, ogro, orc, ettin, troll, zumbi, esqueleto, lich,
  gárgula, daemon e dragão. Elas passeiam pela arena e podem ser alvo das magias (morrem e renascem).
- Para incluir outras criaturas, acrescente o id do corpo (veja `mobtypes.txt` no cliente) em `selecao.json` e rode
  o extrator de novo.

## Editor de arena

- A paleta tem **grupos** (Muro de pedra, Colunas, Grama…) e **busca** por nome do tiledata ou id do gráfico
  (ex.: `wall`, `0x001C`). O ponto vermelho na miniatura indica que o tile bloqueia a passagem.
- **Terreno** (grama, areia, água…) substitui o piso do tile. **Objetos** (muros, pilares…) são empilhados no tile na altura Z escolhida.
- **Spawn** define onde o personagem nasce.
- **Salvar** grava `public/arenas/<nome>.json` (só funciona com `npm run dev`) e mantém uma cópia no navegador.
  Sem o servidor de desenvolvimento, use **Baixar JSON**.
- **Carregar JSON…** abre um arquivo de arena; **Nova…** cria uma arena em branco; **Restaurar do projeto** recarrega o arquivo salvo.
- Ao iniciar, vale a cópia do navegador (se existir); senão, `public/arenas/arena-padrao.json`.
  Se você editar o JSON à mão e não vir a mudança, use **Restaurar do projeto**.

## Estrutura

```
src/
  nucleo/       projecao.ts (isométrica 44x44, Z = 4 px) · direcoes.ts (8 direções do UO)
  mundo/        tipos.ts · mapa.ts (Arena + validação) · catalogo.ts · colisao.ts
  jogo/         jogador.ts (passos, andar/correr, encadeamento)
  render/       renderizador.ts (canvas 2D, ordenação isométrica, placeholders)
  editor/       editor.ts (lógica, sem DOM) · painel.ts (interface)
  combate/      regras.json · formulas.ts (ServUO) · motor.ts (cast, mira, dano, veneno…) · bot.ts (IA)
  interface/    hud-combate.ts (barras, barra de magias, bots) · sons.ts
  render/       efeitos.ts (efeitos de magia e textos) · animacoes.ts (anim.uoo: camadas, matizes, espelho)
  persistencia/ arena-io.ts (JSON, localStorage, servidor de dev)
public/
  catalogo/catalogo.json   catálogo de tiles gerado pelo extrator
  arenas/                  arenas salvas
  sprites/                 PNGs gerados pelo extrator (fora do git)
scripts/
  extrator/                extrair_sprites.py + selecao.json (quais tiles entram na paleta)
  gerar-arena-padrao.mjs
tests/fixtures/            catálogo placeholder usado nos testes de lógica
vite.config.ts             plugin que grava arenas (somente em `npm run dev`)
```

## Formatos

### Arena (`public/arenas/<nome>.json`)

```json
{
  "versao": 1, "nome": "arena-padrao", "largura": 48, "altura": 48,
  "terreno": [1, 1, 1, "... largura*altura ids, linha a linha"],
  "objetos": [{ "x": 12, "y": 12, "z": 0, "id": 101 }],
  "spawn": { "x": 24, "y": 24 }
}
```

### Catálogo de tiles (`public/catalogo/catalogo.json`)

Gerado por `scripts/extrator/extrair_sprites.py` a partir dos arquivos `.uoo` do cliente do Outlands.
Os tiles escolhidos vêm de `scripts/extrator/selecao.json` (grupos por nome do tiledata, arte clássica
`0x0001`–`0x3FFF`). Imagens idênticas dentro do mesmo grupo entram uma vez só.

- **Ids:** terreno usa o id do gráfico (`landtiles`); objeto usa `0x4000 + id do gráfico` (`art`), a mesma
  convenção do `art.mul`. Assim os dois tipos nunca colidem. O id original fica em `grafico`.

```json
{
  "versao": 1, "origem": "outlands-uoo:Ultima Online Outlands",
  "tiles": [
    { "id": 16412, "nome": "stone wall", "tipo": "objeto", "altura": 20, "bloqueia": true,
      "cor": "#5b574c", "grupo": "Muro de pedra", "grafico": 28,
      "sprite": { "arquivo": "objetos/0x001C.png", "largura": 44, "altura": 107 } }
  ]
}
```

- `altura`: unidades Z do `tiledata`. `bloqueia`: flag *Impassable* do `tiledata`.
- `cor`: cor média do sprite; usada como placeholder e se o PNG não carregar.
- **Âncora dos sprites** (conferida com a arte real): terreno 44×44 centrado no tile; objeto com o centro da
  borda inferior no vértice inferior do losango do tile.

### Formato `.uoo` do Outlands (deduzido; detalhes no extrator)

- `anim.uoo`: por corpo, lista de ações → 5 direções → quadros (centro, tamanho, ARGB1555) em deflate.
- `animdata.def` (texto): id do efeito, atraso, intervalo (× 50 ms) e ids dos quadros.

- `art.uoo` / `landtiles.uoo`: entradas em sequência (`id`, `tamanho`, `largura`, `altura`, caixa útil,
  tamanho comprimido), com pixels ARGB1555 comprimidos em deflate puro.
- `artdata.uoo` (72 bytes/registro) e `landdata.uoo` (48 bytes): o tiledata, com flags u64, altura e nome.

## Limitações conhecidas desta versão

- Piso plano: a altura Z dos objetos é só visual; a colisão não considera degraus/escadas.
- Personagem é um boneco simples (as animações do cliente, em `anim.uoo`, entram numa etapa posterior).
- A cópia da arena no navegador mudou de chave (`browseruo.arena.v2`): arenas antigas usavam ids de placeholder.
- Cliente apenas local: ainda não há servidor autoritativo nem outros jogadores (os bots rodam no navegador).
- Montar nas montarias ainda não existe (elas só aparecem no mundo); criaturas não atacam.
- A animação de "apanhar" (get hit) ainda não é usada.

## Próximos marcos

1. Montar (cavalos e ostards) e criaturas agressivas.
2. Servidor autoritativo (Node + WebSocket, tick fixo) reaproveitando `mundo/` e `jogo/`.
3. Combate corpo a corpo e itens (swing timer, armas), com regras do ServUO como referência.
4. Mais magias (Magic Arrow, Harm, Fireball, Mind Blast…).
