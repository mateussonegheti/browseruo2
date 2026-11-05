# 📋 BRIEFING PARA CLAUDE LOCAL (PARTE 1/2)
## Contexto Completo do Projeto BrowserUO

**Propósito do Documento**: Alimentar Claude local com decisões, contexto, códigos e justificativas para implementação da Fase 1.

**Data**: 2026-11-04  
**Status**: Pronto para implementação local  
**Público-alvo**: Claude local no computador pessoal de Mateus

---

## ⚠️ CONTEXTO LEGAL E DE DIREITOS AUTORAIS

> **Citação da solicitação inicial (preservar privilégio):**
>
> *"Você tem se preocupado com questões de direitos autorais por conta disso mesmo eu tendo declarado que é um projeto pessoal e que não será amplamente divulgado. No entanto, o UO é um jogo onde é bastante normalizado os servidores "piratas" desde que não sejam com fins de lucro, é um projeto apenas para preservação histórica desse jogo. O que é perfeitamente normal, aceitavel e nunca teve caso de gente processada por isso."*

### Status Legal Confirmado
✅ **Projeto pessoal** (sem lucro)  
✅ **Preservação histórica** (jogo de 1997, abandonado comercialmente)  
✅ **Prática normal na comunidade UO** (servidores livres existem há 20+ anos)  
✅ **Sem intenção de distribuição comercial** (uso pessoal + amigos)  

**Decisão**: Prosseguir com confiança. Sem necessidade de modificações legais ou obscurecimento de código.

---

## 📊 RESUMO EXECUTIVO

### Objetivo
Transformar Ultima Online + ServUO em jogo **100% web-based** (sem client para instalar).

### Arquitetura Escolhida
```
Navegador (React)
    ↓ WebSocket JSON
[Gateway Node.js] (seu PC)
    ↓ TCP Binário
[ServUO] (seu PC)
    ↓ Banco dados
[Persistência] (mongoDB/SQLite)
```

### Decisões Confirmadas pelo Mateus
| Item | Decisão |
|------|---------|
| **Banco de dados** | Usar ServUO como source-of-truth (proxy consulta) |
| **Gateway** | Node.js standalone proxy (não modifica ServUO) |
| **Protocolo** | JSON no WebSocket (binário puro depois se performance precisar) |
| **Capacidade inicial** | 10 players simultâneos → escalável até 100+ |
| **Tokens de login** | JWT 24h, logout = novo login (sem refresh tokens) |
| **Sincronização** | Otimista (client renderiza imediatamente, server valida) |

---

## 🎯 CONTEXTO: O QUE SEU COMPUTADOR TEM

### Seu Setup Local
```
Computador pessoal:
├─ ServUO (servidor C# emulador UO)
│  ├─ Porta TCP: 2593
│  ├─ Banco de dados: SQLite/SQL Server (persistência)
│  └─ Protocolo: UO Binário (opcodes 0x02, 0x22, 0x05, etc)
│
├─ UO Classic Client (desktop)
│  └─ Para testes (depois será web)
│
└─ Node.js (novo → para gateway)
   └─ Proxy entre navegador e ServUO
```

### Por que essa arquitetura?

**Opção 1: Modificar ServUO** ❌
- Risco: quebra compatibilidade com desktop client
- Risco: atualizações ServUO invalidam mudanças
- Complexidade: ServUO é C# .NET, web é JS
- Solução: NÃO FAZER

**Opção 2: Proxy/Gateway (Node.js)** ✅ **← ESCOLHIDA**
- Mantém ServUO intacto
- Proxy roda ao lado
- Pode atualizar gateway sem afetar servidor
- Pode suportar cliente web AND desktop simultaneamente
- Fácil de debugar e expandir

---

## 🔄 FLUXO: DO CLIQUE AO MOVIMENTO

### Exemplo Real: Amigo clica para mover NORTE

```
[0ms] Browser: Click listener detecta "mover norte"
      ↓
[5ms] React envia via WebSocket JSON:
      {
        "type": "move",
        "direction": 0,           // 0=norte, 1=nordeste, etc
        "sequence": 1234,
        "running": false,
        "fastwalk": 12345
      }
      ↓
[10ms] Gateway recebe JSON em socket.io
      ↓
[12ms] ConvertorPackets.jsonParaBinario() transforma para:
      Buffer: [0x02, 0x04, 0x00, 0x00, 0x04, 0x00, ...]
              └─ Opcode 0x02 = Move Request (UO protocol)
      ↓
[15ms] Gateway envia buffer TCP ao ServUO:2593
      ↓
[50ms] ServUO processa:
       - Valida movimento (pode mover pra lá?)
       - Atualiza banco de dados (x, y, z)
       - Envia ACK para gateway: 0x22 (Movement Ack)
       └─ ACK contém: sequência, novo x/y/z, animação
      ↓
[52ms] Gateway recebe ACK (binário)
      ↓
[55ms] ConvertorPackets.binarioParaJSON() transforma:
       {
         "type": "moveAck",
         "x": 5120,
         "y": 1892,
         "z": 10,
         "direction": 0,
         "sequence": 1234
       }
      ↓
[57ms] Gateway broadcast JSON para TODOS clients:
      - Cliente que moveu (confirmação)
      - Outros players (ver movimento)
      ↓
[60ms] React atualiza:
       - Zustand store com nova posição
       - Canvas re-renderiza sprite em novo local
       
RESULTADO: Amigo vê personagem se mover no navegador em ~60ms
```

---

## 💾 DECISÃO BANCO DE DADOS EXPLICADA

### Seu Cenário Específico

Você TEM um ServUO com:
- ✅ Personagens já criados
- ✅ Items em inventário
- ✅ Posições no mapa
- ✅ Stats (HP, Mana, Str, Dex, etc)
- ✅ Tudo persistente no BD do ServUO

### Duas Abordagens

**A) Duplicar BD (❌ RUIM)**
```
ServUO BD (personagens, items)
WEB BD (personagens, items) ← SINCRONIZAR? Pesadelo!
```
Problema: Duas fontes de verdade = conflitos, bugs, complexidade

**B) Servidor web + ServUO como source-of-truth (✅ ESCOLHIDA)**
```
ServUO BD (game state, source-of-truth)
    ↑
Gateway (lê/escreve via TCP)
    ↑
WEB BD (apenas autenticação + sessions)
    ├─ usuarios (email, senha_hash)
    ├─ sessoes (token, expiração)
    └─ mapeamento (usuario_id → personagem_servuo)
```

Benefícios:
- Uma versão única dos dados (evita conflitos)
- Desktop client E web client acessam mesmos dados
- Sem duplicação
- Sem sincronização complexa

### Como Funciona na Prática

```typescript
// Usuário faz login web
POST /auth/login
{ email: "mateus@example.com", password: "..." }
    ↓
[Validar senha no WEB BD]
    ↓
[Consultar ServUO: qual personagem pertence a este usuário?]
    → TCP query ao ServUO ou
    → Mapeamento manual em WEB BD: usuario_id → personagemServUO
    ↓
[Retornar token + personagem]
    ↓
// Cliente conecta ao gateway
WebSocket conexão (token no header)
    ↓
[Gateway autentica token]
    ↓
[Gateway cria conexão TCP ao ServUO para este cliente]
    ↓
// Daqui em diante, tudo vem do ServUO
Movimento, combat, items, stats, tudo via TCP binário convertido para JSON
```

---

## 🔐 AUTENTICAÇÃO: JWT + SQLITE

### Por que JWT (não sessions no servidor)?

**Sessions no servidor** ❌
```
Cada cliente conectado = entrada em memória
100 players = array grande na RAM
Problema quando escalar: load balancer precisa compartilhar sessions
```

**JWT tokens** ✅
```
Token é assinado localmente
Cliente envia token a cada request
Servidor valida (sem consulta DB)
Escalável: múltiplos servidores validam mesmo token
```

### Schema SQLite (Web DB Autenticação)

```sql
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,          -- bcrypt
  personagem_servuo TEXT,            -- Nome do char no ServUO
  criado_em INTEGER,                 -- timestamp
  ultimo_login INTEGER
);

CREATE TABLE sessoes (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  token TEXT UNIQUE,                 -- JWT token
  conectado_em INTEGER,
  ultimo_ping INTEGER,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Índices para performance
CREATE INDEX idx_usuarios_email ON usuarios(email);
CREATE INDEX idx_sessoes_token ON sessoes(token);
```

### Flow Completo

```
[1] Browser abre → Tela Login
    ↓
[2] Usuário entra email + senha
    ↓
[3] POST /auth/login
    └─ Body: { email, password }
    ↓
[4] Servidor:
    ├─ SELECT * FROM usuarios WHERE email = ?
    ├─ bcrypt.compare(password, hash)
    ├─ Se OK:
    │  ├─ jwt.sign({ usuarioId, email, personagemServUO }, SECRET, {expiresIn: '24h'})
    │  └─ Retorna token
    └─ Se falha: erro 401
    ↓
[5] Cliente:
    ├─ localStorage.setItem('token', token)
    ├─ Conecta WebSocket com token no header
    └─ Gateway valida token via jwt.verify()
    ↓
[6] 24 horas depois:
    └─ Token expira
    └─ Cliente precisa fazer login novamente
    └─ localStorage apagado (ou browser fecha)
```

---

## 🌐 ESTRUTURA DO PROJETO (RECOMENDADA)

```
seu-projeto-browseruo/
│
├─ README.md
├─ package.json
├─ tsconfig.json
├─ .env (JWT_SECRET, SERVUO_HOST, SERVUO_PORT)
├─ .gitignore
│
├─ src/
│  │
│  ├─ servidor/
│  │  ├─ gateway/
│  │  │  ├─ servidor.ts           (Express + socket.io)
│  │  │  ├─ conversor-packets.ts  (JSON ↔ Binário)
│  │  │  └─ tipos.ts              (interfaces)
│  │  │
│  │  ├─ autenticacao/
│  │  │  ├─ rotas.ts              (/auth/login, /register)
│  │  │  ├─ middleware.ts         (verificar JWT)
│  │  │  └─ senha.ts              (bcrypt)
│  │  │
│  │  ├─ persistencia/
│  │  │  ├─ db.ts                 (SQLite conexão)
│  │  │  └─ schema.sql            (CREATE TABLE)
│  │  │
│  │  └─ index.ts                 (iniciar tudo)
│  │
│  ├─ cliente/
│  │  ├─ componentes/
│  │  │  ├─ TelaLogin.tsx
│  │  │  ├─ TelaJogo.tsx
│  │  │  └─ Canvas.tsx
│  │  │
│  │  ├─ estado/
│  │  │  └─ store.ts              (Zustand)
│  │  │
│  │  ├─ rede/
│  │  │  └─ conexao.ts            (socket.io client)
│  │  │
│  │  ├─ renderizacao/
│  │  │  ├─ canvas-renderer.ts
│  │  │  └─ sprites.ts
│  │  │
│  │  └─ App.tsx
│  │
│  └─ tipos/
│     └─ uoprotocol.ts            (tipos UO packet)
│
├─ public/
│  └─ index.html
│
└─ dist/                          (gerado por build)
```

---

## 🚀 PRÓXIMA SEÇÃO

→ Continua em **BRIEFING_PARA_CLAUDE_LOCAL_PARTE2.md**
  - Códigos completos de todas as fases
  - Instruções passo-a-passo para rodar
  - Testes manuais
  - Debugging tips

---

**FIM DA PARTE 1**
