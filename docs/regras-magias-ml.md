# Regras de magia (era ML), levantadas do ServUO

Fonte: [ServUO](https://github.com/ServUO/ServUO), commit `d76bf44` (ago/2026). Arquivos lidos:
`Scripts/Spells/Base/{MagerySpell,Spell,SpellHelper}.cs`, as magias em `Scripts/Spells/<Círculo>/`,
`Scripts/Misc/Poison.cs` e `Server/Mobile.cs`.

Em ML o ServUO liga `Core.AOS`, `Core.SE` e `Core.ML` (não `Core.SA`). Sempre que a magia tem dois
ramos (pré-AoS × AoS), vale o **ramo AoS**, salvo onde indicado.

> **Decisões do projeto (implementadas em `src/combate/`):** todas as skills em **100** (não há upar skills),
> Str 100 / Dex 25 / Int 100, resistências 70 (teto de jogador), FC 2, FCR 6, **Magic Reflect clássico**,
> **Paralyze pré-AoS** (7 + Magery × 0,2 = 27 s; ×0,75 se resistir) e **mira antes do cast** (estilo Sphere):
> o efeito sai no fim do tempo de cast, sem os atrasos extras de dano do ServUO.
> Os números ficam em `src/combate/regras.json`. Os valores abaixo marcados "com o template" foram calculados
> para o rascunho anterior (skills em 120); a tabela "Valores com skills 100" no fim vale para o jogo.

Rascunho inicial do template: Magery 120, Evaluating Intelligence 120, Resisting Spells 120, Inscription 100,
Poisoning 0, FC 2, FCR 6.

> `Utility.Random(a, n)` no ServUO devolve de `a` a `a + n - 1`. `RandomMinMax(a, b)` devolve de `a` a `b`.

## Regras gerais

### Mana por círculo
| Círculo | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Mana | 4 | 6 | 9 | 11 | 14 | 20 | 40 | 50 |

- Lower Mana Cost (LMC): `mana = floor(base × (1 − LMC/100))`, LMC limitado a 40%.
- A mana só é checada no início e gasta quando o alvo é escolhido. Cast interrompido não gasta mana.

### Tempo de cast e recuperação
- Cast: `(3 + círculo) × 0,25 s − FC × 0,25 s`, mínimo 0,25 s. FC de Magery limitado a **2**.
  - Com FC 2: 0,50 · 0,75 · 1,00 · 1,25 · 1,50 · 1,75 · 2,00 · 2,25 s (é a tabela que você trouxe).
  - Com a magia **Protection** ativa, o FC efetivo cai 2 (FC 2 vira 0).
- Recuperação depois do cast: `max(6 − FCR, 0) ÷ 4` s. Com FCR 6, zero.

### Interrupção e paralisia
- Qualquer dano recebido durante o cast interrompe o cast.
- **Qualquer dano recebido quebra a paralisia** (`Mobile.Damage` faz `Paralyzed = false`).

### Alcance de mira
- 10 tiles em ML para todas as magias abaixo (12 antes de ML).

### Chance de resistir (CheckResisted)
Usada pelo Poison (as magias de dano em AoS usam resistências elementais, não este teste):

```
primeiro = resist / 5
segundo  = resist − ((magery_do_caster − 20) / 5 + círculo × 5)
chance   = max(primeiro, segundo) / 2   (em %)
```

Com resist 120 contra magery 120, no 3º círculo: `max(24, 85) / 2` = **42,5%** de resistir.

## Magias

### Heal (1º círculo)
- Cura: `floor(Magery×10 / 120) + 1d4`. Com Magery 120: **11 a 14**.
- Em outro alvo (não em si mesmo) a cura é **×1,5**: 16 a 21.
- **Falha se o alvo estiver envenenado** (ou com Mortal Strike).

### Greater Heal (4º círculo)
- Cura: `floor(Magery × 0,4) + (1 a 10)`. Com Magery 120: **49 a 58**.
- Sem bônus em outro alvo.
- **Falha se o alvo estiver envenenado.**

### Cure (2º círculo)
- Chance de curar, em %: `(10000 + Magery×75 − (nível+1) × fator) / 100`, com `fator = 3300`
  para os níveis 0 a 3 e 3100 para Lethal (nível 4).
- Se curar, remove o veneno inteiro. Se falhar, o veneno continua.

Com Magery 120:

| Veneno | Lesser | Regular | Greater | Deadly | Lethal |
|---|---|---|---|---|---|
| Chance | 100% | 100% | 91% | 58% | 35% |

### Poison (3º círculo)
- Passa por Magic Reflect (ver abaixo) e interrompe um cast em andamento do alvo.
- **Tira a paralisia do alvo**.
- Se o alvo resistir (CheckResisted), não envenena.
- Nível do veneno: `total = (Magery×10 + Poisoning×10) / 2`.
  - **A até 2 tiles:** `total ≥ 1000` dá Deadly · `> 850` Greater · `> 650` Regular · senão Lesser.
  - **A mais de 2 tiles:** sempre Lesser.
- Com o template (Poisoning 0): `total = 600`, então **sempre Lesser**. Com Poisoning 100:
  `total = 1100`, ou seja, Deadly de perto e Lesser de longe.

Dano dos venenos (ramo AoS). Dano por tick = `1 + floor(vida_atual × %)`, preso entre mín. e máx.:

| Nível | Mín. | Máx. | % da vida atual | 1º tick | Intervalo | Ticks |
|---|---|---|---|---|---|---|
| 0 Lesser | 4 | 16 | 7,5% | 3 s | 2,25 s | 10 |
| 1 Regular | 8 | 18 | 10% | 3 s | 3,25 s | 10 |
| 2 Greater | 12 | 20 | 15% | 3 s | 4,25 s | 10 |
| 3 Deadly | 16 | 30 | 30% | 3 s | 5,25 s | 15 |
| 4 Lethal | 20 | 50 | 35% | 3 s | 5,25 s | 20 |

### Paralyze (5º círculo)
- Não pega em alvo já paralisado/congelado **nem em quem está castando**.
- Passa por Magic Reflect.
- Duração em s: `floor(EvalInt/10 − Resist/10)`, mínimo 0. Contra não jogador (monstros e bots), **×3**.
- Com o template (Eval 120 contra Resist 120): **0 s**, ou seja, um mago GM contra outro não fica
  paralisado. Contra Resist 100: 2 s. Contra Resist 0: 12 s.
- Qualquer dano quebra a paralisia.

### Magic Reflect (5º círculo): dois comportamentos muito diferentes

**ML (ramo AoS), o que o ServUO faz:** **não reflete magias**. É um liga/desliga sem duração:
- Resistência física: `−25 + floor(Inscription/20)` (−20 com Inscription 100).
- Fogo, frio, veneno e energia: **+10** cada.
- Recastar desliga. Continua ativa depois de morrer.

**Pré-AoS (estilo Sphere/T2A), o "reflect" clássico:**
- Cria um escudo de `8` ou `15` pontos (15 se Magery + Inscription ≥ 200).
- Cada magia recebida gasta `círculo` pontos. Enquanto o saldo não ficar negativo, a magia volta para quem a lançou.
- Ao zerar, o escudo some. Não dá para recastar enquanto ele estiver ativo.

## Fórmulas adicionais usadas no motor

- **Dano das magias (AoS):** `dado × (30 + 0,9 × EvalInt)% × (100 + bônus Inscription + Int/10)%`, depois
  `× (100 − resistência do elemento)%`. Com Eval, Int e Inscription 100 o multiplicador é 1,2 × 1,2.
  Energy Bolt (40 + 1d5, energia), Explosion (40 + 1d5, fogo, 3 s de atraso), Flamestrike (48 + 1d5, fogo),
  Lightning (23 + 1d4, energia). EB e Flamestrike chegam 1 s depois; Lightning é imediato.
- **Durante o cast o personagem não anda** (`BlocksMovement`). Paralisado não começa nem conclui magia.
- **Vida:** 50 + Str/2. Regenera 1 ponto a cada 3,33 s (humano em ML), nada enquanto envenenado.
- **Mana:** Int. Regeneração ML com Meditation e Focus 100 e Int 100: ~1 ponto a cada 0,66 s.
- **Veneno:** um veneno igual ou mais forte já ativo impede o novo. Dano de veneno também interrompe o cast.

## Valores com skills 100 (os do jogo)

| | Valor |
|---|---|
| Energy Bolt / Explosion | 17–19 (resistência 70) |
| Flamestrike | 21–22 |
| Lightning | 10–11 |
| Heal | 9–12 em si; 13–18 em outro |
| Greater Heal | 41–50 |
| Cure | Lesser e Regular 100%, Greater 76%, Deadly 43%, Lethal 20% |
| Poison | Deadly a até 2 tiles; Lesser mais longe; resiste ~34,5% |
| Paralyze (pré-AoS) | 27 s; 20,25 s se resistir (~29,5% no 5º círculo); qualquer dano quebra |
| Magic Reflect clássico | 15 pontos; cada magia gasta o próprio círculo |

## Magias acrescentadas (ServUO, ramo AoS)

| Magia | Regra |
|---|---|
| Magic Arrow | 10 + 1d4 de fogo, com a escala de Eval/Int/Inscription (4–6 contra resistência 70) |
| Harm | 17 + 1d5 de frio; ×0,5 a 2 tiles e ×0,25 mais longe (7–9 ao lado) |
| Fireball | 19 + 1d5 de fogo (8–10) |
| Mind Blast | (Magery + Int)/5 + 2..6, até 60; dano de frio entre esse valor e +4, 1 s depois (12–15) |
| Curse | Str/Dex/Int −(8 + Eval/10 − Resist/10)%; −10 em fogo, frio, veneno e energia; dura 6 × Eval×10/50 + 1 s (121 s) |
| Mana Drain | Tira 40 + Eval − Resist de mana (40) e devolve depois de 5 s; um dreno por vez |
| Teleport | Tile livre e visível a até 11 tiles |
| Wall of Stone | 3 peças (art 0x82) atravessadas na linha de quem lança, por 10 s; alcance 10 |

## Pendências / decisões
0. ~~Paralyze sem efeito entre magos iguais~~: decidido, fórmula pré-AoS.
1. ~~Template~~: decidido, todas as skills em 100.
2. ~~Magic Reflect~~: decidido, clássico (reflete).
3. ~~Bot~~: bots contam como jogadores (sem o ×3 do Paralyze contra monstros).
4. ~~Fórmula de dano AoS~~: lida e implementada (acima).
