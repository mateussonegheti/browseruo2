# browserUO

PvP enxuto no estilo Ultima Online, rodando no navegador. Projeto pessoal.
**Marco 1:** mapa vazio/arena, personagem com movimento no estilo UO e editor de arena interno.

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

Sem os PNGs o jogo funciona com losangos/caixas na cor média de cada tile.

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

Tempos por passo (como no UO a pé): andar 400 ms, correr 200 ms.

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

### Formato `.uoo` do Outlands (deduzido; detalhes no topo do extrator)

- `art.uoo` / `landtiles.uoo`: entradas em sequência (`id`, `tamanho`, `largura`, `altura`, caixa útil,
  tamanho comprimido), com pixels ARGB1555 comprimidos em deflate puro.
- `artdata.uoo` (72 bytes/registro) e `landdata.uoo` (48 bytes): o tiledata, com flags u64, altura e nome.

## Limitações conhecidas desta versão

- Piso plano: a altura Z dos objetos é só visual; a colisão não considera degraus/escadas.
- Personagem é um boneco simples (as animações do cliente, em `anim.uoo`, entram numa etapa posterior).
- A cópia da arena no navegador mudou de chave (`browseruo.arena.v2`): arenas antigas usavam ids de placeholder.
- Cliente apenas local: ainda não há servidor autoritativo nem outros jogadores.

## Próximos marcos

1. Servidor autoritativo (Node + WebSocket, tick fixo) reaproveitando `mundo/` e `jogo/`.
2. Combate: swing timer, dano, morte/respawn, com regras do Source-X como referência.
3. Magias com cast e interrupção por dano.
