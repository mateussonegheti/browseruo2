# 📋 BRIEFING PARA CLAUDE LOCAL (PARTE 3/3)
## Autenticação, Cliente Web e Testes

**Continuação de**: BRIEFING_PARA_CLAUDE_LOCAL_PARTE2.md

---

## 🔐 CÓDIGO 5: Rotas de Autenticação (Express)

**Arquivo**: `src/servidor/autenticacao/rotas.ts`

```typescript
import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Database } from '../persistencia/db';

export function criarRotasAuth(db: Database, SECRET: string) {
  const router = express.Router();

  /**
   * POST /auth/register
   * Body: { email, password, personagemServUO }
   */
  router.post('/register', async (req: Request, res: Response) => {
    const { email, password, personagemServUO } = req.body;

    // Validações
    if (!email || !password || !personagemServUO) {
      return res.status(400).json({ 
        erro: 'Email, senha e personagem obrigatórios' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        erro: 'Senha deve ter mínimo 6 caracteres' 
      });
    }

    try {
      const senhaHash = await bcrypt.hash(password, 10);
      const agora = Date.now();

      db.run(
        `INSERT INTO usuarios (email, senha_hash, personagem_servuo, criado_em, ultimo_login)
         VALUES (?, ?, ?, ?, ?)`,
        [email, senhaHash, personagemServUO, agora, agora],
        function (err: Error | null) {
          if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
              return res.status(409).json({ 
                erro: 'Email já registrado' 
              });
            }
            return res.status(500).json({ 
              erro: 'Erro ao registrar usuário' 
            });
          }

          const usuarioId = this.lastID;
          const token = jwt.sign(
            {
              usuarioId,
              email,
              personagemServUO,
              iat: Math.floor(Date.now() / 1000),
            },
            SECRET,
            { expiresIn: '24h' }
          );

          res.status(201).json({
            sucesso: true,
            token,
            usuarioId,
            personagemServUO,
          });
        }
      );
    } catch (err: any) {
      console.error('[AUTH] Erro ao registrar:', err);
      res.status(500).json({ erro: 'Erro interno do servidor' });
    }
  });

  /**
   * POST /auth/login
   * Body: { email, password }
   */
  router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        erro: 'Email e senha obrigatórios' 
      });
    }

    db.get(
      `SELECT id, senha_hash, personagem_servuo FROM usuarios WHERE email = ?`,
      [email],
      async (err: Error | null, usuario: any) => {
        if (err) {
          return res.status(500).json({ 
            erro: 'Erro ao buscar usuário' 
          });
        }

        if (!usuario) {
          return res.status(401).json({ 
            erro: 'Email ou senha incorretos' 
          });
        }

        try {
          const senhaCorreta = await bcrypt.compare(
            password,
            usuario.senha_hash
          );

          if (!senhaCorreta) {
            return res.status(401).json({ 
              erro: 'Email ou senha incorretos' 
            });
          }

          // Atualizar último login
          db.run(
            'UPDATE usuarios SET ultimo_login = ? WHERE id = ?',
            [Date.now(), usuario.id]
          );

          const token = jwt.sign(
            {
              usuarioId: usuario.id,
              email,
              personagemServUO: usuario.personagem_servuo,
              iat: Math.floor(Date.now() / 1000),
            },
            SECRET,
            { expiresIn: '24h' }
          );

          res.json({
            sucesso: true,
            token,
            usuarioId: usuario.id,
            personagemServUO: usuario.personagem_servuo,
          });
        } catch (err: any) {
          console.error('[AUTH] Erro ao validar senha:', err);
          res.status(500).json({ 
            erro: 'Erro interno do servidor' 
          });
        }
      }
    );
  });

  /**
   * POST /auth/verify
   * Verifica se token é válido (sem chamar DB)
   * Header: Authorization: Bearer <token>
   */
  router.post('/verify', (req: Request, res: Response) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(400).json({ 
        erro: 'Token obrigatório' 
      });
    }

    try {
      const decoded = jwt.verify(token, SECRET) as any;
      res.json({
        valido: true,
        usuarioId: decoded.usuarioId,
        email: decoded.email,
        personagemServUO: decoded.personagemServUO,
        expiraEm: new Date(decoded.exp * 1000),
      });
    } catch (err: any) {
      res.status(401).json({ 
        erro: 'Token inválido ou expirado' 
      });
    }
  });

  return router;
}
```

---

## 🎮 CÓDIGO 6: Cliente Web (React + Zustand)

**Arquivo**: `src/cliente/App.tsx`

```typescript
import React, { useState, useEffect } from 'react';
import { useGameStore } from './estado/store';
import { ClienteRede } from './rede/conexao';
import { TelaLogin } from './componentes/TelaLogin';
import { TelaJogo } from './componentes/TelaJogo';
import './App.css';

export default function App() {
  const [autenticado, setAutenticado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const store = useGameStore();

  useEffect(() => {
    // Ao iniciar, verificar se tem token salvo
    const token = localStorage.getItem('token');
    if (token) {
      // Verificar se token ainda é válido
      fetch('/auth/verify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })
        .then(r => r.json())
        .then(data => {
          if (data.valido) {
            // Token ainda válido, conectar ao gateway
            const cliente = new ClienteRede(token);
            cliente.conectar('ws://localhost:8080');
            setAutenticado(true);
          } else {
            // Token expirou
            localStorage.removeItem('token');
            setAutenticado(false);
          }
        })
        .catch(() => {
          // Erro ao verificar, fazer logout
          localStorage.removeItem('token');
          setAutenticado(false);
        })
        .finally(() => setCarregando(false));
    } else {
      setCarregando(false);
    }
  }, []);

  const handleLogin = (token: string) => {
    localStorage.setItem('token', token);
    const cliente = new ClienteRede(token);
    cliente.conectar('ws://localhost:8080');
    setAutenticado(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    store.setConectado(false);
    setAutenticado(false);
  };

  if (carregando) {
    return (
      <div className="tela-carregando">
        <h1>🎮 BrowserUO</h1>
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {!autenticado ? (
        <TelaLogin onLogin={handleLogin} />
      ) : (
        <TelaJogo onLogout={handleLogout} />
      )}
    </div>
  );
}
```

**Arquivo**: `src/cliente/componentes/TelaLogin.tsx`

```typescript
import React, { useState } from 'react';
import './TelaLogin.css';

interface TelaLoginProps {
  onLogin: (token: string) => void;
}

export function TelaLogin({ onLogin }: TelaLoginProps) {
  const [modo, setModo] = useState<'login' | 'registro'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [personagem, setPersonagem] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErro('');

    try {
      const endpoint = modo === 'login' ? '/auth/login' : '/auth/register';
      const body =
        modo === 'login'
          ? { email, password }
          : { email, password, personagemServUO: personagem };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(data.erro || 'Erro ao fazer login');
        return;
      }

      if (data.token) {
        onLogin(data.token);
      }
    } catch (e: any) {
      setErro(e.message || 'Erro de conexão');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="tela-login">
      <div className="container">
        <h1>🎮 BrowserUO</h1>
        <p>Jogue Ultima Online no navegador</p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />

          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />

          {modo === 'registro' && (
            <input
              type="text"
              placeholder="Nome do personagem (já deve existir no ServUO)"
              value={personagem}
              onChange={(e) => setPersonagem(e.target.value)}
              required
              disabled={loading}
            />
          )}

          <button type="submit" disabled={loading}>
            {loading ? 'Conectando...' : modo === 'login' ? 'Entrar' : 'Registrar'}
          </button>
        </form>

        <button
          className="toggle-modo"
          onClick={() => setModo(modo === 'login' ? 'registro' : 'login')}
          disabled={loading}
        >
          {modo === 'login' ? 'Não tem conta? Registre' : 'Já tem conta? Faça login'}
        </button>

        {erro && <div className="erro">⚠️ {erro}</div>}
        
        <div className="info">
          <p>
            <strong>Nota:</strong> Para criar personagem, use o client desktop do UO 
            ou fale com o admin. Aqui você faz login em personagens que já existem.
          </p>
        </div>
      </div>
    </div>
  );
}
```

**Arquivo**: `src/cliente/estado/store.ts`

```typescript
import { create } from 'zustand';

export interface Jogador {
  id: string;
  nome: string;
  x: number;
  y: number;
  z: number;
  direcao: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  correndo: boolean;
}

export interface EstadoJogo {
  // Estado
  jogador: Jogador | null;
  outrosJogadores: Map<string, Jogador>;
  conectado: boolean;
  ultimaSequencia: number;

  // Ações
  setJogador: (j: Jogador) => void;
  atualizarJogador: (mudancas: Partial<Jogador>) => void;
  atualizarOutroJogador: (id: string, j: Jogador) => void;
  removerOutroJogador: (id: string) => void;
  setConectado: (c: boolean) => void;
  proximaSequencia: () => number;
}

export const useGameStore = create<EstadoJogo>((set, get) => ({
  jogador: null,
  outrosJogadores: new Map(),
  conectado: false,
  ultimaSequencia: 0,

  setJogador: (j) => set({ jogador: j }),

  atualizarJogador: (mudancas) =>
    set((state) => ({
      jogador: state.jogador ? { ...state.jogador, ...mudancas } : null,
    })),

  atualizarOutroJogador: (id, j) =>
    set((state) => {
      const mapa = new Map(state.outrosJogadores);
      mapa.set(id, j);
      return { outrosJogadores: mapa };
    }),

  removerOutroJogador: (id) =>
    set((state) => {
      const mapa = new Map(state.outrosJogadores);
      mapa.delete(id);
      return { outrosJogadores: mapa };
    }),

  setConectado: (c) => set({ conectado: c }),

  proximaSequencia: () => {
    const state = get();
    const nova = (state.ultimaSequencia + 1) % 256;
    set({ ultimaSequencia: nova });
    return nova;
  },
}));
```

---

## 🧪 GUIA DE TESTES

### Teste 1: Gateway Básico

```bash
# Terminal 1: ServUO
cd ~/ServUO
mono ServUO.exe
# Esperado: "Login server listening on 0.0.0.0:2593"

# Terminal 2: Gateway
cd projeto
npm install
npx ts-node src/servidor/gateway/servidor.ts
# Esperado: 
# [Gateway] Escutando em ws://localhost:8080
# [Gateway] Conectado ao ServUO em localhost:2593

# Terminal 3: Testar com websocat
npm install -g websocat

# Passo 1: Enviar login ao gateway
websocat ws://localhost:8080
# Servidor espera token... (vai dar erro, normal)

# Passo 2: Gerar token manualmente (para testes)
# Use um JWT gerador online ou execute:
# node -e "console.log(require('jsonwebtoken').sign({usuarioId:1, email:'test@test.com'}, 'secret', {expiresIn: '24h'}))"
```

### Teste 2: Autenticação

```bash
# Testar registro
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@exemplo.com",
    "password": "senha123",
    "personagemServUO": "MeuPersonagem"
  }'

# Esperado: { token: "eyJhbGciOiJIUzI1NiIs...", usuarioId: 1 }

# Testar login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@exemplo.com",
    "password": "senha123"
  }'

# Esperado: { token: "...", usuarioId: 1 }

# Testar verify token
TOKEN="seu-token-aqui"
curl -X POST http://localhost:3000/auth/verify \
  -H "Authorization: Bearer $TOKEN"

# Esperado: { valido: true, usuarioId: 1, email: "teste@exemplo.com", ... }
```

### Teste 3: Conversão de Packets

```typescript
// Arquivo: teste-conversor.ts
import { ConvertorPackets } from './src/servidor/gateway/conversor-packets';

const conversor = new ConvertorPackets();

// Teste 1: Move ACK (0x22)
console.log('=== Teste 1: Move ACK (0x22) ===');
const bufferMoveAck = Buffer.from([
  0x22,           // opcode
  0x14, 0x08,     // x = 5128
  0x07, 0x5A,     // y = 1882
  0x0A,           // z = 10
  0x00,           // direction = norte, not running
]);
const resultMoveAck = conversor.binarioParaJSON(bufferMoveAck);
console.log('Input:', bufferMoveAck);
console.log('Output:', resultMoveAck);
// Esperado: { type: 'moveAck', x: 5128, y: 1882, z: 10, direction: 0, running: false }

// Teste 2: JSON para Binário (Move)
console.log('\n=== Teste 2: JSON → Binário (Move) ===');
const packetJSON = {
  type: 'move',
  sequence: 123,
  direction: 0,
  running: false,
  fastwalk: 12345,
};
const resultBinario = conversor.jsonParaBinario(packetJSON);
console.log('Input:', packetJSON);
console.log('Output:', resultBinario);
console.log('Hex:', resultBinario?.toString('hex'));
// Esperado: Buffer 8 bytes começando com 0x02

// Teste 3: Round-trip
console.log('\n=== Teste 3: Round-trip ===');
const binariaOrigem = Buffer.from([0x02, 0x00, 0x7B, 0x00, 0x00, 0x30, 0x39]);
const json = conversor.binarioParaJSON(binariaOrigem);
const binariaVolta = conversor.jsonParaBinario(json!);
console.log('Origem:', binariaOrigem);
console.log('JSON:', json);
console.log('Volta:', binariaVolta);
console.log('Match:', Buffer.compare(binariaOrigem, binariaVolta!) === 0);
// Esperado: true

console.log('\n✅ Todos os testes devem passar!');
```

---

## 📋 CHECKLIST: PRÓXIMAS AÇÕES

### Imediatamente
- [ ] Copiar PARTE 1, 2 e 3 deste briefing
- [ ] Compartilhar com Claude local
- [ ] Revisar decisões e contexto

### Fase 1 (Gateway)
- [ ] Criar repo com estrutura de pastas
- [ ] Implementar `servidor.ts` (gateway Express + socket.io)
- [ ] Implementar `conversor-packets.ts` (JSON ↔ Binário)
- [ ] Implementar `types.ts` (tipos UO)
- [ ] Rodar teste com websocat
- [ ] Adicionar logging/debug

### Fase 2 (Autenticação)
- [ ] Implementar `rotas.ts` (login/register)
- [ ] Criar BD SQLite com schema
- [ ] Testar com curl
- [ ] Integrar com gateway

### Fase 3+ (Cliente Web)
- [ ] Scaffold React project (Vite)
- [ ] Implementar `App.tsx`
- [ ] Implementar `TelaLogin.tsx`
- [ ] Implementar Zustand store
- [ ] Implementar `ClienteRede`
- [ ] Tela jogo básica
- [ ] Canvas rendering

---

## 🎓 RECURSOS PARA CLAUDE LOCAL

### Documentação Referência
1. **UO Protocol**: https://www.uodev.org/files/packet_guide.zip
2. **ServUO GitHub**: https://github.com/ServUO/ServUO
3. **Socket.io Docs**: https://socket.io/docs/
4. **TypeScript**: https://www.typescriptlang.org/

### Perguntas Frequentes para Claude Local

**P1: Como testei que o gateway conecta ao ServUO?**
A: Terminal rodando gateway mostra `[TCP] Conectado ao ServUO para cliente <id>`

**P2: Como faço round-trip de um packet?**
A: Use `teste-conversor.ts` - binário → JSON → binário, deve ser idêntico

**P3: Token expira em 24h, o que fazer?**
A: Cliente em localStorage perde token, precisa fazer login novamente

**P4: E se ServUO cair enquanto jogo?**
A: Gateway desconecta todos clientes, mostra erro, prompt login novamente

---

## 🚀 STATUS FINAL

✅ Contexto legal confirmado (preservação histórica, sem lucro)  
✅ Arquitetura aprovada (Gateway Node.js)  
✅ Decisões confirmadas (JWT, JSON, Zustand, etc)  
✅ Códigos prontos (Gateway, Auth, Cliente, Testes)  
✅ Instruções claras (para Claude local)  

**Próximo passo**: Claude local implementa Fase 1 usando este briefing!

---

**Fim do Briefing**  
**Total de 3 partes**: PARTE1.md, PARTE2.md, PARTE3.md
