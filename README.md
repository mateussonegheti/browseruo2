# browserUO

PvP enxuto no estilo Ultima Online, rodando no navegador. Projeto pessoal.
**Marco 1:** arena com sprites reais do cliente, movimento no estilo UO e editor de arena interno.
**Marco 2:** combate de magia (era ML) contra bots, com ícones, sons e efeitos do cliente.
**Marco 3:** animações originais de personagens e criaturas, com spawn de cavalos, montarias e monstros.
**Marco 4:** montar, paperdoll e mochila, fonte e cursores do cliente, posicionar bots e criaturas com target.

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
efeitos de magia (`public/efeitos/`), animações de personagens, criaturas e montarias (`public/animacoes/`, ~35 s)
e a interface (`public/interface/`: cursores, fontes `unifont`, gumps do paperdoll e da mochila, itens).
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
| Lançar magia | Teclas **1** a **0** e **Shift+1** a **Shift+8**, clique na barra ou no livro: a mira abre na hora |
| Escolher alvo | Clique no personagem · **T**: último alvo · **Y**: você mesmo · **Esc**: cancelar |
| Bots de teste | Painel no canto superior direito: **+ Bot parado** / **+ Bot ativo** e clique no chão (target) |
| Criaturas | Mesmo painel: escolher na lista, **+ Criatura** e clique no chão; ou **Spawn aleatório (6)** |
| Cancelar o posicionamento | **Esc** ou botão direito |
| Menu do personagem | **Botão direito** em você: Paperdoll, Mochila e (montado) Desmontar · numa montaria: Montar |
| Montar / desmontar | Duplo clique no cavalo, ostard ou lhama ao lado · duplo clique em si mesmo desmonta |
| Paperdoll / mochila | **P** / **B**, pelo menu do botão direito ou duplo clique (em você a pé / na mochila do paperdoll) |
| Fechar janela | Botão direito na janela (como no UO); arraste para mover |
| Lootar | **Duplo clique** (ou botão direito → Lootar) no corpo de quem morreu, a até 2 tiles · duplo clique no item da janela pega a pilha para a sua mochila · o corpo some quando a pessoa renasce |
| Totem / portas | **Duplo clique** num totem (a até 2 tiles) abre o menu de itens (por ora o deed de casa) · duplo clique numa porta abre/fecha; portas com dono só respondem ao lado dono |
| Construir casa | **Duplo clique no deed** (pergaminho na mochila, pegue-o no totem) → menu com as 38 casas e estruturas do `multi.mul` → clique no chão livre (verde = cabe, vermelho = não) · direito/Esc cancela · o deed é consumido |
| Usar item | Duplo clique na mochila: poções; o spellbook abre o livro (clique numa magia para lançar) |
| Status completo | Duplo clique na sua barra de vida (canto superior esquerdo) |
| Guerra / paz | **Tab** · em guerra, duplo clique num alvo (ou "Atacar" no menu do botão direito) e chegue ao lado |
| Equipar | Mochila → duplo clique no **baú** → duplo clique na arma, peça de plate ou escudo |
| Desequipar | Duplo clique na peça no paperdoll (volta para o baú) |

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
| Shift+1 | Magic Arrow | 1 | 4 |
| Shift+2 | Harm (metade a 2 tiles, ¼ mais longe) | 2 | 6 |
| Shift+3 | Fireball | 3 | 9 |
| Shift+4 | Teleport (clique no chão, até 11 tiles) | 3 | 9 |
| Shift+5 | Wall of Stone (3 peças por 10 s, bloqueiam passagem e visão) | 3 | 9 |
| Shift+6 | Curse (−8% Str/Dex/Int e −10 nas resistências elementais por ~2 min) | 4 | 11 |
| Shift+7 | Mana Drain (tira 40 de mana, devolve em 5 s) | 4 | 11 |
| Shift+8 | Mind Blast ((Magery + Int)/5 + 2..6, frio, 1 s depois) | 5 | 14 |

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

## Corpo a corpo e equipamento

- **Armas** (ServUO, ML): Katana, Viking Sword, Broadsword, Longsword, Kryss, War Fork, Spear, War Mace, Mace,
  Hammer Pick, Halberd, Bardiche, Double Axe e Quarter Staff, com dano, velocidade e mãos de cada uma; sem arma,
  os punhos (1–4).
- **Golpe** automático em guerra quando o alvo está ao lado: a cada `max(5, floor(velocidade×4 − Stam/30)) × 0,25 s`;
  acerto 50% entre iguais; dano × (1 + Str 35% + Anatomy 55% + Tactics 68,75% [+ Lumberjacking 30% nos machados])
  e depois a resistência física. Dano de golpe interrompe magia; lançar magia reinicia o tempo do golpe.
- **Armadura:** resistência física base 40; cada peça de plate (peito, pernas, braços, luvas, gorjal, elmo) +5
  (plate completo = 70, o teto). Plate **bloqueia Meditation**: a mana volta bem mais devagar. O robe vai por cima.
- **Heater Shield:** bloqueia o golpe inteiro com chance de (Parry/400 + 5%) × (20 + Dex)/100 — com Dex 25, ~13%.
  Arma de duas mãos não deixa usar escudo.
- **Mão livre:** com arma de duas mãos, ou arma + escudo, não dá para beber poção (como no UO).
- Animações do cliente: andar/correr armado, posição de guerra (1 e 2 mãos) e golpes de corte, perfuração e
  esmagamento; armas, plate e escudo aparecem no personagem e no paperdoll.

## Itens

- **Poções** (regras do ServUO, versões Greater/Total, com o bônus de Alchemy 100):
  amarela cura 26–32 (trava de 10 s, não funciona envenenado) · laranja cura veneno (100/100/75/45/25% por nível) ·
  vermelha enche a estamina · branca +20 Str e azul +20 Dex por 2 min · verde envenena quem bebe.
  0,5 s entre poções do mesmo tipo.
- **Reagentes:** cada magia gasta os reagentes dela (ex.: Energy Bolt = Black Pearl + Nightshade). Sem reagente,
  não lança.
- **Spellbook:** o livro original (gump 0x08AC) com as magias por círculo; clique numa magia para lançar.

## Interface do cliente

- **Barras de status** do cliente: a sua (0x0803: vida, mana e estamina) e a do alvo (0x0804, com o nome);
  verde quando envenenado, amarelo paralisado. Duplo clique na sua abre o **Character Status** (0x0802).
- **Cursores** originais (luva): aponta para onde o personagem andaria, vira o target na mira e ao posicionar.
- **Fonte** com curvas do cliente (`unifont.mul`) nos nomes, no dano, nas palavras de poder, no menu e no paperdoll.
  A fonte simples (`unifont1.mul`) também é extraída e fica de reserva.
- **Paperdoll** (gump 0x07D0) com o corpo e as roupas nas mesmas cores do personagem, e **mochila** (0x003C) com
  spellbook, reagentes e poções (dá para arrastar lá dentro). Renasce cheia.
- **Montarias:** cavalos, ostards e lhama. Montado, anda em 200 ms e corre em 100 ms por passo. Ao morrer, você cai
  da montaria e ela fica ao lado.

## Casas (deed)

O extrator lê `multi.mul` e grava `public/casas/casas.json` (ignorado pelo git, como os sprites). O deed da mochila abre o menu; a casa escolhida só pode ser construída em terreno livre (sem objetos, água, bots ou o ponto de nascimento) e fica salva com a arena. Telhados e andares de cima somem quando você entra na casa e não bloqueiam o chão.

A casa vem completa: os vãos de parede com piso recebem portas automaticamente (dono: lado A) e uma placa é colocada se o modelo não tiver (tendas) e toda casa ganha uma placa de latão visível junto ao suporte. Dê duplo clique na placa (um suporte alto e fino) ou em qualquer parte da casa, a até 2 tiles, para demolir: a construção inteira some e o deed volta para a mochila (não funciona durante a batalha).

Limitações: casas construídas antes dessa versão não têm identificador e só saem pelo editor; a detecção de portas é heurística (modelos grandes como castelo/fortaleza podem ganhar portas extras); o 2º andar não é acessível e o deed volta a cada renascimento.

## Totem, portas e batalhas

- **Totem** (grupo *Especiais* da paleta, sprite 0x3B0F): oferece os itens listados em `totem.itens` de `src/combate/regras.json`; novos itens entram só nessa lista (e em `interface.itens` do `selecao.json`). O deed não vem mais na mochila.
- **Portas** (grupos *Portas* e *Portas abertas*): 7 tipos × 8 orientações. Abrir troca o objeto de tile e de sprite (offsets do ServUO). No editor, o seletor *Dono das portas colocadas* grava `dono` (`A` = quem nasce no spawn A); a porta só responde a esse lado,. Para uma casa, posicione a porta no vão e escolha dono A.
- **Spawns A e B**: ferramentas *Spawn A* (verde) e *Spawn B* (laranja) do editor; `spawnB` é opcional no mapa.
- **Editor**: *Casa pronta…* escolhe uma estrutura do menu do deed e a ferramenta *Casa* a carimba (sem gastar deed); *Pegar deed* põe um na mochila.
- **Batalha contra bots**: duplo clique no totem de batalha (virtue stone `0x1870` sobre o altar `0x120E`) abre o menu. Escolha modo (1x1, 2x2, 3x3, FFA), tipo e lado.
  - Lado A nasce no *Spawn A* (dentro da casa, dono das portas); lado B no *Spawn B* (se não houver, 8 tiles à direita do A). Bots do lado A abrem a própria porta quando não enxergam o inimigo.
  - Todos ficam paralisados por 5 s (sem andar nem castar) na contagem.
  - **Treino**: kit completo; ao morrer você sai da arena com o kit de antes. Dá para sair a qualquer momento pelo totem.
  - **A vera**: você entra com o seu kit; os corpos ficam lootáveis. Se perder, renasce fora; se vencer, loota e sai pelo totem (só após o fim).
  - A edição (tecla E) fica bloqueada durante a batalha. Rode o extrator para gerar o totem de batalha no catálogo.

## Editor de arena

- A paleta tem **grupos recolhíveis** (setinha em cada um; "Abrir tudo" e "Fechar tudo") (Muro de pedra, Colunas, Grama…) e **busca** por nome do tiledata ou id do gráfico
  (ex.: `wall`, `0x001C`). O ponto vermelho na miniatura indica que o tile bloqueia a passagem.
- **Muro:** escolha o material (pedra, mármore ou madeira) e arraste; as peças retas, quinas e postes saem
  sozinhas. **Ctrl+Z** desfaz o último clique ou arraste.
- **Terreno** (grama, areia, água…) substitui o piso do tile. **Objetos** (muros, pilares…) são empilhados no tile na altura Z escolhida.
- **Spawn** define onde o personagem nasce.
- **Salvar** grava `public/arenas/<nome>.json` (só funciona com `npm run dev`) e mantém uma cópia no navegador.
  Sem o servidor de desenvolvimento, use **Baixar JSON**.
- **Carregar JSON…** abre um arquivo de arena; **Nova…** cria uma arena em branco; **Restaurar do projeto** recarrega o arquivo salvo.
- Ao iniciar, vale a cópia do navegador (se existir); senão, `public/arenas/arena-padrao.json`.
  Se você editar o JSON à mão e não vir a mudança, use **Restaurar do projeto**.

### Sub-editor de criaturas

No editor, a seção **Criaturas** deixa escolher o monstro/animal, ver a prévia e editar nome, cor (matiz), vida, força, destreza, inteligência, velocidade (ms por passo), comportamento (passear/parado) e resistências. **Colocar no mapa** cria a criatura com esses dados no próximo clique; **Salvar como padrão** guarda o perfil no navegador (vale também para "+ Criatura" e o spawn aleatório). Criaturas são só de runtime (não vão para a arena), só se mexem fora do editor e ainda não atacam. A paleta também tem o grupo **Mobília**.

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
- Só o jogador monta (bots não); criaturas não atacam; bots não bebem poções nem lutam corpo a corpo.
- Arco e besta ainda não existem.

## Próximos marcos

1. Criaturas agressivas.
2. Servidor autoritativo (Node + WebSocket, tick fixo) reaproveitando `mundo/` e `jogo/`.
3. Arco e besta; bots que lutam corpo a corpo, montam e bebem poções.
