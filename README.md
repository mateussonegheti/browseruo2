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

O `npm run e2e` usa o Playwright. Se o Chromium dele não estiver instalado: `npx playwright install chromium`
(ou aponte `CHROMIUM_PATH` para um Chromium existente).

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
  catalogo/catalogo.json   catálogo de tiles (hoje: placeholder)
  arenas/                  arenas salvas
  sprites/                 sprites reais (vazio por enquanto)
scripts/gerar-arena-padrao.mjs
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

Este é o **contrato com o futuro extrator** do cliente do UO. O extrator só precisa produzir este arquivo
e os PNGs em `public/sprites/`; o jogo e o editor não mudam.

```json
{
  "versao": 1, "origem": "cliente-7.0.x",
  "tiles": [
    { "id": 101, "nome": "Muro de pedra", "tipo": "objeto", "altura": 20, "bloqueia": true,
      "cor": "#9a9da5",
      "sprite": { "arquivo": "objetos/0x0001.png", "largura": 44, "altura": 90 } }
  ]
}
```

- `altura`: unidades Z do `tiledata`. `bloqueia`: flag *Impassable* do `tiledata`.
- `cor`: usada como placeholder e se o sprite não carregar.
- **Âncora dos sprites (a confirmar com arquivos reais):** terreno 44×44 centrado no tile; objeto com o
  centro da borda inferior no vértice inferior do losango do tile.

## Limitações conhecidas desta versão

- Piso plano: a altura Z dos objetos é só visual; a colisão não considera degraus/escadas.
- Personagem é um boneco simples (animações do cliente entram numa etapa posterior).
- Cliente apenas local: ainda não há servidor autoritativo nem outros jogadores.
- O desenho de sprites reais está implementado mas **não foi testado com arte real**.

## Próximos marcos

1. Extrator (Python) que lê a pasta do cliente Classic e gera `catalogo.json` + sprites.
2. Servidor autoritativo (Node + WebSocket, tick fixo) reaproveitando `mundo/` e `jogo/`.
3. Combate: swing timer, dano, morte/respawn, com regras do Source-X como referência.
4. Magias com cast e interrupção por dano.
