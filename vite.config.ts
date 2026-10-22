import { defineConfig, type Plugin } from 'vite';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Regra idêntica à do cliente (src/persistencia/arena-io.ts): impede path traversal.
const REGEX_NOME_ARENA = /^[a-z0-9_-]{1,40}$/i;
const LIMITE_BYTES = 5 * 1024 * 1024;

/** Só no `npm run dev`: permite ao editor gravar a arena em public/arenas/. */
function salvarArenasPlugin(): Plugin {
  return {
    name: 'browseruo-salvar-arenas',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/arenas', (req, res) => {
        const nome = (req.url ?? '').replace(/^\//, '').split('?')[0] ?? '';
        const responder = (codigo: number, texto: string) => { res.statusCode = codigo; res.end(texto); };
        if (req.method !== 'POST') return responder(405, 'use POST');
        if (!REGEX_NOME_ARENA.test(nome)) return responder(400, 'nome inválido');

        const partes: Buffer[] = [];
        let total = 0;
        req.on('data', (p: Buffer) => {
          total += p.length;
          if (total > LIMITE_BYTES) { responder(413, 'arquivo grande demais'); req.destroy(); return; }
          partes.push(p);
        });
        req.on('end', async () => {
          if (res.writableEnded) return;
          try {
            const corpo = Buffer.concat(partes).toString('utf-8');
            JSON.parse(corpo); // garante JSON válido antes de gravar
            await writeFile(resolve(server.config.root, 'public/arenas', `${nome}.json`), corpo, 'utf-8');
            responder(200, 'ok');
          } catch (e) {
            responder(400, `JSON inválido: ${String(e)}`);
          }
        });
      });
    },
  };
}

export default defineConfig({ plugins: [salvarArenasPlugin()] });
