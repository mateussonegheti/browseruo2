# Sprites Index - Ultima Online Game Assets

## Overview

O arquivo `public/sprites/sprites.json` contém um índice completo de todos os 3.263 sprite tiles extraídos do cliente Ultima Online (ZuluHotel Brasil OldSkull).

## Estrutura do JSON

```json
{
  "versao": 1,
  "origem": "mul:ZuluHotel Brasil OldSkull",
  "data_geracao": "2026-11-05",
  "total_sprites": 3263,
  "categorias": ["Decoração", "Água", "Estrutura", "Terreno", "Objeto", "Móvel/Item"],
  "sprites": [
    {
      "id": "0x0003",
      "tipo": "terreno|objeto",
      "arquivo": "terreno/0x0003.png",
      "largura": 44,
      "altura": 44,
      "cor_dominante": "#29410d",
      "categoria": "Terreno",
      "subcategoria": "Grama|Sujeira/Caminho|Água|...",
      "descricao": "Descrição do sprite",
      "bloqueante": false,
      "altura_z": 0
    }
  ]
}
```

## Campos

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | string | ID hexadecimal único do sprite (ex: `0x0003`) |
| `tipo` | string | `terreno` ou `objeto` |
| `arquivo` | string | Caminho relativo ao PNG (`terreno/...` ou `objetos/...`) |
| `largura` | number | Largura em pixels (geralmente 44) |
| `altura` | number | Altura em pixels (geralmente 44) |
| `cor_dominante` | string | Cor RGB mais prevalente em hex (`#RRGGBB`) |
| `categoria` | string | Classificação principal |
| `subcategoria` | string | Tipo específico dentro da categoria |
| `descricao` | string | Descrição legível do sprite |
| `bloqueante` | boolean | Se o sprite bloqueia movimento/visão |
| `altura_z` | number | Altura Z para renderização (0 = chão, 20+ = paredes, -5 = água) |

## Categorias

### 1. **Terreno** (1.166 sprites)
Tiles de solo/piso onde o personagem pode caminhar

- **Grama**: Grama natural
- **Sujeira/Caminho**: Terra, caminhos, estradas
- **Pedra/Rocha**: Terreno de pedra
- **Variado**: Outros tipos de terreno

### 2. **Água** (15 sprites)
Tiles de água que bloqueiam movimento

- Bloqueante: `true`
- Altura Z: `-5`

### 3. **Estrutura** (139 sprites)
Paredes, portas e estruturas construtivas

- **Madeira**: Paredes e portas de madeira
- **Pedra**: Paredes e estruturas de pedra
- Bloqueante: `true`
- Altura Z: `20+`

### 4. **Decoração** (148 sprites)
Flora e elementos decorativos naturais

- **Floral**: Árvores, arbustos, flores
- Bloqueante: `false`

### 5. **Móvel/Item** (183 sprites)
Móveis e objetos dentro de estruturas

- Sofás, mesas, cadeiras, etc.
- Bloqueante: `true` (geralmente)
- Altura Z: `10-20`

### 6. **Objeto** (1.612 sprites)
Diversos outros objetos de jogo

- Itens de combate, magia, ferramentas
- Bloqueante: `false` (geralmente)

## Uso no Web Client

### Buscar Sprite por ID

```javascript
// Carregar o índice
const spritesData = await fetch('/sprites/sprites.json').then(r => r.json());

// Encontrar sprite por ID
const spriteId = '0x0003';
const sprite = spritesData.sprites.find(s => s.id === spriteId);

// Obter caminho da imagem
const imagePath = `/sprites/${sprite.arquivo}`;

// Verificar se é bloqueante
const isBlockingTile = sprite.bloqueante;

// Renderizar com altura Z
const zHeight = sprite.altura_z;
```

### Filtrar por Categoria

```javascript
// Obter todos os terrenos walkable
const walkableTerrains = spritesData.sprites.filter(s => 
  s.categoria === "Terreno" && !s.bloqueante
);

// Obter todas as paredes
const walls = spritesData.sprites.filter(s => 
  s.categoria === "Estrutura" && s.bloqueante
);

// Obter todos os objetos de água
const waterTiles = spritesData.sprites.filter(s => 
  s.categoria === "Água"
);
```

### Mapeamento de Visibilidade

```javascript
// Tiles que bloqueiam visão
const vision_blocking = sprite.bloqueante || sprite.categoria === "Estrutura";

// Tiles passáveis
const walkable = !sprite.bloqueante && sprite.categoria !== "Água";
```

## Análise Visual

Cada sprite foi analisado quanto a:

- **Cor dominante**: Cor mais prevalente (útil para thematic grouping)
- **Dimensões**: Sempre 44x44 pixels (padrão UO)
- **Características**: Baseadas em padrão de cores e ID numérico

## Exemplo de Sprites

| ID | Categoria | Descrição | Bloqueante |
|----|-----------|-----------|-----------|
| `0x0003` | Terreno | Grama natural | ❌ |
| `0x0009` | Terreno | Terra/Sujeira | ❌ |
| `0x00A8` | Estrutura | Parede de madeira | ✅ |
| `0x0100` | Decoração | Flora (árvore/arbusto) | ❌ |
| `0x0200` | Móvel/Item | Móvel decorativo | ✅ |

## Performance

- **Tamanho do índice**: ~1.1 MB (42.435 linhas JSON)
- **Número de sprites**: 3.263
- **Formato**: JSON estruturado para fácil parsing
- **Recomendação**: Fazer cache do índice no cliente após primeira carga

## Geração

O índice foi gerado automaticamente através de:

1. **Análise de imagem**: Leitura de dimensões e cores de cada PNG
2. **Categorização automática**: Classificação baseada em padrões de cor e ID
3. **Descrição baseada em contexto**: Nomes e descrições do padrão visual

## Atualizações Futuras

Para adicionar novos sprites:

1. Adicionar PNG em `public/sprites/terreno/` ou `public/sprites/objetos/`
2. Regenerar `sprites.json` executando o script de geração
3. Commit e push para o repositório

```bash
# Regenerar índice
python3 scripts/generate_sprites_index.py
git add public/sprites/sprites.json
git commit -m "Update sprites index with new tiles"
git push origin main
```

---

**Última atualização**: 5 de Novembro de 2026
**Total de sprites**: 3.263
**Categorias**: 6
