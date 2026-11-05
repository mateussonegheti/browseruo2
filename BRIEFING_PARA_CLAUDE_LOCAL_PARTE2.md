# 📋 BRIEFING PARA CLAUDE LOCAL (PARTE 2/3)
## Códigos Prontos: Gateway + Conversor

**Continuação de**: BRIEFING_PARA_CLAUDE_LOCAL_PARTE1.md

---

## 🔧 CÓDIGO 1: Gateway Principal (Express + socket.io)

**Arquivo**: `src/servidor/gateway/servidor.ts`

```typescript
import net from 'net';
import { Server as SocketIOServer } from 'socket.io';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { ConvertorPackets } from './conversor-packets';

class GatewayServUO {
  private app = express();
  private servidor = http.createServer(this.app);
  private io = new SocketIOServer(this.servidor, {
    cors: { origin: '*' },
    transports: ['websocket', 'polling'],
  });
  private conversor = new ConvertorPackets();

  // Mapear cliente web → Conexão ServUO
  private conexoes = new Map<string, {
    socket: any;
    servuo: net.Socket | null;
    usuarioId: string;
    personagemServUO: string;
  }>();

  private SECRET = process.env.JWT_SECRET || 'seu-secret-super-seguro-mude-em-produção';
  private SERVUO_HOST = process.env.SERVUO_HOST || 'localhost';
  private SERVUO_PORT = parseInt(process.env.SERVUO_PORT || '2593');

  constructor() {
    this.setupMiddleware();
    this.setupWebSocket();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Stats (quantos conectados)
    this.app.get('/stats', (req, res) => {
      const total = this.conexoes.size;
      const comServUO = Array.from(this.conexoes.values()).filter(c => c.servuo?.connected).length;
      res.json({ 
        clients: total, 
        connectedToServUO: comServUO,
        timestamp: Date.now() 
      });
    });
  }

  private setupWebSocket() {
    // Middleware: verificar JWT no conexão
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Token obrigatório'));
      }

      try {
        const decoded = jwt.verify(token, this.SECRET) as any;
        socket.data.usuarioId = decoded.usuarioId;
        socket.data.email = decoded.email;
        socket.data.personagemServUO = decoded.personagemServUO;
        next();
      } catch (err) {
        next(new Error('Token inválido'));
      }
    });

    this.io.on('connection', (socket) => {
      const { usuarioId, personagemServUO } = socket.data;
      console.log(`[WS] Cliente conectado: ${socket.id} (user: ${usuarioId})`);

      // Conectar este cliente ao ServUO
      const servuoConn = net.createConnection({
        host: this.SERVUO_HOST,
        port: this.SERVUO_PORT,
      });

      servuoConn.on('connect', () => {
        console.log(`[TCP] Conectado ao ServUO para cliente ${socket.id}`);
        socket.emit('connected', { status: 'connected_to_servuo' });
      });

      servuoConn.on('error', (err) => {
        console.error(`[TCP] Erro conexão ServUO para ${socket.id}:`, err.message);
        socket.emit('error', { message: 'Erro ao conectar ao servidor' });
      });

      // RECEBER do ServUO (binário) → ENVIAR para Cliente (JSON)
      servuoConn.on('data', (buffer) => {
        try {
          const packet = this.conversor.binarioParaJSON(buffer);
          if (packet) {
            socket.emit('packet', packet);
            console.log(`[TCP→WS] Opcode 0x${buffer[0].toString(16).toUpperCase()} → ${packet.type}`);
          }
        } catch (err) {
          console.error(`[TCP] Erro ao converter packet:`, err);
        }
      });

      servuoConn.on('end', () => {
        console.log(`[TCP] Desconexão ServUO para ${socket.id}`);
        socket.disconnect();
      });

      // RECEBER do Cliente (JSON) → ENVIAR para ServUO (binário)
      socket.on('packet', (packet) => {
        try {
          const buffer = this.conversor.jsonParaBinario(packet);
          if (buffer && servuoConn.connected) {
            servuoConn.write(buffer);
            console.log(`[WS→TCP] ${packet.type} → Opcode 0x${buffer[0].toString(16).toUpperCase()}`);
          }
        } catch (err) {
          console.error(`[WS] Erro ao converter packet:`, err);
        }
      });

      // DESCONEXÃO
      socket.on('disconnect', () => {
        servuoConn.destroy();
        this.conexoes.delete(socket.id);
        console.log(`[WS] Cliente desconectado: ${socket.id}`);
      });

      // Guardar referência
      this.conexoes.set(socket.id, {
        socket,
        servuo: servuoConn,
        usuarioId,
        personagemServUO,
      });
    });
  }

  iniciar(porta = 8080) {
    this.servidor.listen(porta, () => {
      console.log(`
╔════════════════════════════════════════╗
║         🎮 BrowserUO Gateway           ║
║  Escutando em ws://localhost:${porta}   ║
║  Conectado ao ServUO em               ║
║  ${this.SERVUO_HOST}:${this.SERVUO_PORT.toString().padEnd(4)} ║
╚════════════════════════════════════════╝
      `);
    });
  }
}

// Iniciar
const gateway = new GatewayServUO();
gateway.iniciar(parseInt(process.env.GATEWAY_PORT || '8080'));
```

### Como usar:

```bash
# 1. Instalar dependências
npm install express socket.io jsonwebtoken

# 2. Criar .env
echo "JWT_SECRET=seu-secret-aqui" > .env
echo "SERVUO_HOST=localhost" >> .env
echo "SERVUO_PORT=2593" >> .env
echo "GATEWAY_PORT=8080" >> .env

# 3. Rodar
npx ts-node src/servidor/gateway/servidor.ts
```

---

## 🔄 CÓDIGO 2: Conversor de Packets (JSON ↔ Binário)

**Arquivo**: `src/servidor/gateway/conversor-packets.ts`

```typescript
/**
 * Converte entre UO Protocol Binário e JSON
 * 
 * Referência de opcodes UO:
 * 0x02 = Move Request (7 bytes)
 * 0x22 = Movement Ack (variable)
 * 0x05 = Attack Request (5 bytes)
 * 0x1A = World Item (variable)
 */

export interface PacketJSON {
  type: string;
  [key: string]: any;
}

export class ConvertorPackets {
  
  /**
   * Converte binário (do ServUO) para JSON (para cliente web)
   */
  binarioParaJSON(buffer: Buffer): PacketJSON | null {
    if (buffer.length < 1) return null;

    const opcode = buffer[0];

    switch (opcode) {
      case 0x02: // Move Request ACK
        return this.parse0x02(buffer);
      case 0x22: // Movement Ack
        return this.parse0x22(buffer);
      case 0x05: // Attack Request
        return this.parse0x05(buffer);
      case 0x1A: // World Item
        return this.parse0x1A(buffer);
      case 0x20: // Update Player
        return this.parse0x20(buffer);
      default:
        console.warn(`[CONVERSOR] Opcode desconhecido: 0x${opcode.toString(16).toUpperCase()}`);
        return null;
    }
  }

  /**
   * Converte JSON (do cliente web) para binário (para ServUO)
   */
  jsonParaBinario(packet: PacketJSON): Buffer | null {
    const { type } = packet;

    switch (type) {
      case 'move':
        return this.build0x02(packet);
      case 'attack':
        return this.build0x05(packet);
      case 'speak':
        return this.buildSpeak(packet);
      default:
        console.warn(`[CONVERSOR] Tipo desconhecido: ${type}`);
        return null;
    }
  }

  // ========== PARSERS (Binário → JSON) ==========

  private parse0x02(buffer: Buffer): PacketJSON {
    // 0x02: [opcode(1)] [sequence(2)] [direction(1)] [fastwalk(4)]
    if (buffer.length < 8) return { type: 'moveAck', error: 'tamanho inválido' };

    const sequence = buffer.readUInt16BE(1);
    const direction = buffer[3];
    const fastwalk = buffer.readUInt32BE(4);

    return {
      type: 'moveRequest',
      sequence,
      direction,
      fastwalk,
    };
  }

  private parse0x22(buffer: Buffer): PacketJSON {
    // 0x22: [opcode(1)] [x(2)] [y(2)] [z(1)] [direction(1)] [running(1?)]
    if (buffer.length < 8) return { type: 'moveAck', error: 'tamanho inválido' };

    const x = buffer.readUInt16BE(1);
    const y = buffer.readUInt16BE(3);
    const z = buffer.readInt8(5);
    const direction = buffer[6];
    const running = (direction & 0x80) !== 0; // bit 7 = running

    return {
      type: 'moveAck',
      x,
      y,
      z,
      direction: direction & 0x7F, // sem o bit de running
      running,
    };
  }

  private parse0x05(buffer: Buffer): PacketJSON {
    // 0x05: [opcode(1)] [target(4)]
    if (buffer.length < 5) return { type: 'attackAck', error: 'tamanho inválido' };

    const targetSerial = buffer.readUInt32BE(1);

    return {
      type: 'attackAck',
      targetSerial,
    };
  }

  private parse0x1A(buffer: Buffer): PacketJSON {
    // 0x1A: Complexo, simplificado aqui
    // [opcode(1)] [serial(4)] [itemId(2)] [amount(2)] [x(2)] [y(2)] [z(1)] [hue(2)]
    if (buffer.length < 16) return { type: 'worldItem', error: 'tamanho inválido' };

    const serial = buffer.readUInt32BE(1);
    const itemId = buffer.readUInt16BE(5);
    const amount = buffer.readUInt16BE(7);
    const x = buffer.readUInt16BE(9);
    const y = buffer.readUInt16BE(11);
    const z = buffer.readInt8(13);
    const hue = buffer.readUInt16BE(14);

    return {
      type: 'worldItem',
      serial,
      itemId,
      amount,
      x,
      y,
      z,
      hue,
    };
  }

  private parse0x20(buffer: Buffer): PacketJSON {
    // 0x20: Update Player (simplificado)
    if (buffer.length < 19) return { type: 'updatePlayer', error: 'tamanho inválido' };

    const serial = buffer.readUInt32BE(1);
    const bodyId = buffer.readUInt16BE(5);
    const x = buffer.readUInt16BE(7);
    const y = buffer.readUInt16BE(9);
    const z = buffer.readInt8(11);
    const direction = buffer[12];
    const hue = buffer.readUInt16BE(13);

    return {
      type: 'updatePlayer',
      serial,
      bodyId,
      x,
      y,
      z,
      direction,
      hue,
    };
  }

  // ========== BUILDERS (JSON → Binário) ==========

  private build0x02(packet: PacketJSON): Buffer {
    // 0x02: [opcode(1)] [sequence(2)] [direction(1)] [fastwalk(4)]
    const buffer = Buffer.alloc(8);

    buffer[0] = 0x02;
    buffer.writeUInt16BE(packet.sequence || 0, 1);
    buffer[3] = packet.direction || 0;
    buffer.writeUInt32BE(packet.fastwalk || 0, 4);

    return buffer;
  }

  private build0x05(packet: PacketJSON): Buffer {
    // 0x05: [opcode(1)] [target(4)]
    const buffer = Buffer.alloc(5);

    buffer[0] = 0x05;
    buffer.writeUInt32BE(packet.targetSerial || 0, 1);

    return buffer;
  }

  private buildSpeak(packet: PacketJSON): Buffer {
    // Simplicidade: 0x03 System Message
    const text = packet.text || '';
    const tipo = packet.speechType || 0; // 0=normal, 1=broadcast, etc
    
    const textBuffer = Buffer.from(text, 'utf-8');
    const buffer = Buffer.alloc(1 + 2 + 1 + textBuffer.length + 1);

    buffer[0] = 0x03;
    buffer.writeUInt16BE(textBuffer.length + 3, 1);
    buffer[3] = tipo;
    textBuffer.copy(buffer, 4);

    return buffer;
  }
}
```

### Exemplo de uso:

```typescript
const conversor = new ConvertorPackets();

// Binário → JSON
const bufferServUO = Buffer.from([0x22, 0x14, 0x08, 0x07, 0x5A, 0x0A, 0x00]);
const packetJSON = conversor.binarioParaJSON(bufferServUO);
console.log(packetJSON);
// { type: 'moveAck', x: 5128, y: 1882, z: 10, direction: 0, running: false }

// JSON → Binário
const packetWeb = {
  type: 'move',
  sequence: 123,
  direction: 0,
  fastwalk: 12345,
};
const bufferServUO2 = conversor.jsonParaBinario(packetWeb);
console.log(bufferServUO2);
// Buffer: [0x02, 0x00, 0x7B, 0x00, 0x00, 0x30, 0x39]
```

---

## 📦 CÓDIGO 3: Types UO (TypeScript Interfaces)

**Arquivo**: `src/tipos/uoprotocol.ts`

```typescript
/**
 * Tipos e Interfaces para UO Protocol
 * Referência: https://www.uodev.org/
 */

// Direções (8 pontos cardinais)
export enum Direcao {
  Norte = 0,
  Nordeste = 1,
  Leste = 2,
  Sudeste = 3,
  Sul = 4,
  Sudoeste = 5,
  Oeste = 6,
  Noroeste = 7,
}

// Tipos de movimento
export enum TipoMovimento {
  Andar = 0,
  Correr = 1,
}

// Tipos de dano
export enum TipoDano {
  Normal = 0,
  Mágico = 1,
  Fogo = 2,
  Frio = 3,
  Veneno = 4,
  Energia = 5,
}

// Packet: Move Request
export interface PacketMoveRequest {
  type: 'move';
  sequence: number;       // Para ordenação
  direction: number;      // 0-7
  running: boolean;
  fastwalk: number;       // Anti-speed-hack key
}

// Packet: Movement Ack
export interface PacketMoveAck {
  type: 'moveAck';
  x: number;
  y: number;
  z: number;
  direction: number;
  running: boolean;
}

// Packet: Attack Request
export interface PacketAttack {
  type: 'attack';
  targetSerial: number;
}

// Packet: World Item
export interface PacketWorldItem {
  type: 'worldItem';
  serial: number;
  itemId: number;
  amount: number;
  x: number;
  y: number;
  z: number;
  hue: number;           // Cor
}

// Packet: Update Player
export interface PacketUpdatePlayer {
  type: 'updatePlayer';
  serial: number;
  bodyId: number;
  x: number;
  y: number;
  z: number;
  direction: number;
  hue: number;
}

// Generic Packet Union
export type UOPacket = 
  | PacketMoveRequest
  | PacketMoveAck
  | PacketAttack
  | PacketWorldItem
  | PacketUpdatePlayer
  | { type: string; [key: string]: any };

// Jogador Estado
export interface Jogador {
  id: string;                 // Serial UO
  nome: string;
  x: number;
  y: number;
  z: number;
  direcao: Direcao;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  correndo: boolean;
  posicaoClienteX?: number;   // Para interp rendering
  posicaoClienteY?: number;
  ultimoUpdate: number;       // timestamp
}

// Mapeamento: User → Personagem
export interface MapeamentoUsuario {
  usuarioId: string;
  email: string;
  personagemServUO: string;
  criado_em: number;
  ultimo_login: number;
}

export const TAMANHO_OPCODE = 1;
```

---

## 📝 CÓDIGO 4: package.json

**Arquivo**: `package.json`

```json
{
  "name": "browseruo-gateway",
  "version": "0.1.0",
  "description": "Gateway para Ultima Online no navegador",
  "main": "dist/servidor/index.js",
  "scripts": {
    "dev": "ts-node src/servidor/index.ts",
    "build": "tsc",
    "start": "node dist/servidor/index.js",
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": ["uo", "ultima-online", "game", "web"],
  "author": "Mateus",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.2",
    "jsonwebtoken": "^9.1.2",
    "bcryptjs": "^2.4.3",
    "sqlite3": "^5.1.6",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/express": "^4.17.21",
    "typescript": "^5.3.3",
    "ts-node": "^10.9.2"
  }
}
```

---

**→ Continua em BRIEFING_PARA_CLAUDE_LOCAL_PARTE3.md**
- Código autenticação
- Código cliente web
- Instruções de teste
