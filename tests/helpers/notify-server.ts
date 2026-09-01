import { createServer, type Server } from 'node:http';

export type NotifyMode = 'ok' | '500' | '404' | 'reset';

interface ReceivedRequest {
  at: number;
  body: unknown;
}

/**
 * Destino controlable para NOTIFY_URL. Permite forzar exito, error 5xx,
 * rechazo 4xx o ausencia de respuesta, y comprobar que llegan los envios.
 */
export class NotifyServer {
  private server: Server | null = null;
  public mode: NotifyMode = 'ok';
  public received: ReceivedRequest[] = [];

  async start(port: number): Promise<void> {
    this.server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        this.received.push({ at: Date.now(), body: raw ? JSON.parse(raw) : null });

        if (this.mode === 'reset') {
          req.socket.destroy();
          return;
        }

        const status = this.mode === '500' ? 500 : this.mode === '404' ? 404 : 200;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: status === 200 }));
      });
    });

    await new Promise<void>((resolve) => this.server!.listen(port, '127.0.0.1', resolve));
  }

  reset(mode: NotifyMode = 'ok'): void {
    this.mode = mode;
    this.received = [];
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }
}

/** Puerto que coincide con NOTIFY_URL de .env.test */
export const NOTIFY_PORT = 4599;

/**
 * Instancia compartida por toda la suite. Se levanta antes de cada archivo de
 * tests para que las notificaciones tengan siempre un destino: sin el, cada
 * archivado dejaria reintentos en segundo plano fallando contra un puerto
 * cerrado despues de que el test haya terminado.
 */
export const notifyServer = new NotifyServer();
