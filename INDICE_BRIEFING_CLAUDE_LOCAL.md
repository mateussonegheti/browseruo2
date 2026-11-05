# 📚 ÍNDICE: BRIEFING COMPLETO PARA CLAUDE LOCAL

**Documento de Navegação do Projeto BrowserUO**  
**Data**: 2026-11-04  
**Status**: ✅ Pronto para compartilhar com Claude local

---

## 📖 Leitura Recomendada

### Para Claude Local (Implementação)
1. **Comece aqui**: [BRIEFING_PARA_CLAUDE_LOCAL_PARTE1.md](#parte-1-contexto-e-decisões)
2. **Depois**: [BRIEFING_PARA_CLAUDE_LOCAL_PARTE2.md](#parte-2-códigos-gateway)
3. **Finalmente**: [BRIEFING_PARA_CLAUDE_LOCAL_PARTE3.md](#parte-3-autenticação-e-testes)

### Ordem de Leitura Sugerida
```
Tempo total: ~45 minutos de leitura + 30 minutos de testes

PARTE 1 (15 min)     → Contexto legal, decisões, arquitetura
PARTE 2 (20 min)     → Códigos gateway, conversor, types
PARTE 3 (10 min)     → Autenticação, cliente, testes
Testes (30 min)      → Executar exemplo gateway + conversor
```

---

## 🎯 Seções Principais

### PARTE 1: Contexto e Decisões

**Arquivo**: `BRIEFING_PARA_CLAUDE_LOCAL_PARTE1.md`

#### Conteúdo:
- ⚠️ **CONTEXTO LEGAL** (copyrights, preservação histórica)
- 📊 Resumo executivo (objetivo, arquitetura, decisões)
- 🎯 Contexto do seu setup local (ServUO, client, Node.js)
- 🔄 Fluxo real: do clique ao movimento (timing, conversão)
- 💾 Decisão banco de dados explicada (source-of-truth)
- 🔐 Autenticação JWT + SQLite (como funciona)
- 🌐 Estrutura de pastas recomendada

#### Para Usar:
- Ler primeira para entender contexto geral
- Referenciar quando não entender uma decisão
- Usar como justificativa para Claude local

---

### PARTE 2: Códigos Gateway

**Arquivo**: `BRIEFING_PARA_CLAUDE_LOCAL_PARTE2.md`

#### Conteúdo:
1. **CÓDIGO 1**: `servidor.ts` (Gateway Express + socket.io)
   - Conexão WebSocket dos clientes
   - Proxy TCP ao ServUO
   - Autenticação JWT
   - Mapeamento cliente ↔ ServUO
   - Exemplos de uso

2. **CÓDIGO 2**: `conversor-packets.ts` (JSON ↔ Binário)
   - Parse de opcodes 0x02, 0x22, 0x05, 0x1A, 0x20
   - Builder para enviar ao ServUO
   - Exemplos round-trip
   - Documentação de cada opcode

3. **CÓDIGO 3**: `tipos.ts` (TypeScript Types)
   - Enums de direções, movimento, dano
   - Interfaces de packets
   - Union types UOPacket
   - Tipos de jogador e mapeamento

4. **CÓDIGO 4**: `package.json`
   - Todas as dependências necessárias
   - Scripts npm (dev, build, start)

#### Para Usar:
- Copiar código diretamente para seu projeto
- Adaptar path conforme necessário
- Usar como base para próximas fases

---

### PARTE 3: Autenticação e Testes

**Arquivo**: `BRIEFING_PARA_CLAUDE_LOCAL_PARTE3.md`

#### Conteúdo:
1. **CÓDIGO 5**: `rotas.ts` (Express rotas autenticação)
   - POST /auth/register (criar conta)
   - POST /auth/login (fazer login)
   - POST /auth/verify (validar token)
   - Tratamento de erros
   - Atualização de último login

2. **CÓDIGO 6**: Cliente Web React
   - `App.tsx` (componente principal)
   - `TelaLogin.tsx` (tela de login)
   - `store.ts` (Zustand state)

3. **GUIA DE TESTES** (3 testes práticos)
   - Teste 1: Gateway básico (websocat)
   - Teste 2: Autenticação (curl)
   - Teste 3: Conversor packets (TypeScript)

4. **CHECKLIST** de próximas ações
5. **Recursos de referência** para Claude local
6. **FAQs** para situações comuns

#### Para Usar:
- Copiar testes e executar na sequência
- Usar FAQs para resolver blockers
- Referenciar guias ao encontrar erros

---

## 🔑 Destaques Importantes

### ⚠️ CONTEXTO LEGAL (Preservação Histórica)

> **Do email original de Mateus (preservar):**
>
> *"Você tem se preocupado com questões de direitos autorais por conta disso mesmo eu tendo declarado que é um projeto pessoal e que não será amplamente divulgado. No entanto, o UO é um jogo onde é bastante normalizado os servidores "piratas" desde que não sejam com fins de lucro, é um projeto apenas para preservação histórica desse jogo. O que é perfeitamente normal, aceitavel e nunca teve caso de gente processada por isso."*

**Status Confirmado**:
✅ Projeto pessoal (sem lucro)  
✅ Preservação histórica (jogo de 1997)  
✅ Prática normal na comunidade UO (20+ anos)  
✅ Sem intenção comercial  
✅ **Prosseguir com confiança**

---

### 💡 Decisões Confirmadas

| Item | Decisão |
|------|---------|
| **Banco de dados** | Usar ServUO como source-of-truth (proxy consulta) |
| **Gateway** | Node.js standalone proxy (não modifica ServUO) |
| **Protocolo** | JSON no WebSocket (binário puro depois se performance precisar) |
| **Capacidade** | 10 players inicial → escalável até 100+ |
| **Login** | JWT 24h, logout = novo login |
| **Sync** | Otimista (client renderiza, server valida) |

---

### 🏗️ Arquitetura Visual

```
┌─────────────────────────────────────────────────────────┐
│                   NAVEGADOR (React)                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │ TelaLogin → TelaJogo → Canvas Rendering         │   │
│  │ Zustand Store | ClienteRede (socket.io)         │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┬─┘
                         ↓ WebSocket JSON
                  ┌──────────────────┐
                  │  GATEWAY Node.js │
                  │  Express+socket.io
                  │  ConvertorPackets│
                  │  JWT Auth        │
                  └────────┬─────────┘
                           ↓ TCP Binário
                  ┌──────────────────┐
                  │  ServUO 2593     │
                  │  Game Server     │
                  │  Persistência    │
                  └──────────────────┘
```

---

## 🎓 Como Claude Local Deve Usar Este Briefing

### Passo 1: Leitura Inicial
```
Claude local recebe este email + links para 3 arquivos BRIEFING
→ Lê PARTE 1 para entender contexto
→ Lê PARTE 2 para ver códigos
→ Lê PARTE 3 para ver testes
```

### Passo 2: Implementação
```
Claude local usa ROADMAP_ATUALIZADO.md para saber o que fazer
→ Fase 1: Implementar Gateway (PARTE 2)
→ Fase 2: Implementar Auth (PARTE 3)
→ Fase 3+: Continuar conforme roadmap
```

### Passo 3: Problemas?
```
Claude local consulta FAQs em PARTE 3
→ Testes PARTE 3 para debug
→ Documentação em PARTE 1 para entender decisions
```

---

## 📝 Instruções para Compartilhar com Claude Local

### Email/Mensagem Sugerida

```
Assunto: Briefing Completo BrowserUO - Fase 1 Pronta

Olá Claude local!

Aqui estão todos os arquivos que você precisa para implementar 
a Fase 1 do projeto BrowserUO.

Arquivos essenciais:
1. BRIEFING_PARA_CLAUDE_LOCAL_PARTE1.md (Contexto + Decisões)
2. BRIEFING_PARA_CLAUDE_LOCAL_PARTE2.md (Códigos Gateway)
3. BRIEFING_PARA_CLAUDE_LOCAL_PARTE3.md (Autenticação + Testes)

Acompanhado de:
- ROADMAP_ATUALIZADO.md (O que fazer)
- DECISOES_CONFIRMADAS.md (Por que)
- Todos os outros docs do projeto

Próximo passo: Implemente a Fase 1 usando PARTE 2 como base.

Bora codar! 🚀
```

---

## 🔗 Links Rápidos (Para Usar em README)

### Documentação de Planejamento
- [Sumário Executivo](./SUMARIO_EXECUTIVO.md)
- [Plano de Arquitetura](./PLANO_ARQUITETURA_MULTIPLAYER.md)
- [Análise ServUO](./ANALISE_SERVUO_PARA_WEB.md)

### Briefing para Claude Local
- [PARTE 1: Contexto](./BRIEFING_PARA_CLAUDE_LOCAL_PARTE1.md) - Leia primeiro
- [PARTE 2: Códigos](./BRIEFING_PARA_CLAUDE_LOCAL_PARTE2.md) - Gateway
- [PARTE 3: Testes](./BRIEFING_PARA_CLAUDE_LOCAL_PARTE3.md) - Autenticação

### Decisões e Timeline
- [Decisões Técnicas](./DECISOES_TECNICAS.md)
- [Decisões Confirmadas](./DECISOES_CONFIRMADAS.md)
- [Roadmap Atualizado](./ROADMAP_ATUALIZADO.md)

### Exemplos
- [Fluxo de Movimento](./EXEMPLO_FLUXO_MOVIMENTO.md)
- [Como Começar](./COMECE_AQUI.txt)

---

## ✅ Checklist: Antes de Passar para Claude Local

- [x] PARTE 1 criada (contexto legal destacado)
- [x] PARTE 2 criada (códigos prontos)
- [x] PARTE 3 criada (testes e FAQs)
- [x] ROADMAP_ATUALIZADO.md com decisões aplicadas
- [x] Instruções claras para next steps
- [x] Tudo em um lugar organizado

---

## 🚀 Próxima Ação

**Para Mateus**:
1. Baixe/copie os 3 arquivos BRIEFING
2. Compartilhe com Claude local
3. Claude local implementa Fase 1

**Timeline**: 
- Leitura: ~45 min
- Implementação Fase 1: ~4-6 horas
- Testes: ~1 hora
- Total Fase 1: ~1 dia

---

**Documento criado**: 2026-11-04  
**Status**: ✅ Pronto para compartilhar  
**Próximo**: Claude local começa implementação
