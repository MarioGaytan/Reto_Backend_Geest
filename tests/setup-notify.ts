import { NOTIFY_PORT, notifyServer } from './helpers/notify-server';

// Todos los archivos de tests necesitan un destino escuchando en NOTIFY_URL:
// cualquier archivado dispara una notificacion, y sin servidor quedarian
// reintentos en segundo plano golpeando un puerto cerrado.
beforeAll(async () => {
  await notifyServer.start(NOTIFY_PORT);
});

afterAll(async () => {
  await notifyServer.stop();
});

beforeEach(() => {
  notifyServer.reset('ok');
});
