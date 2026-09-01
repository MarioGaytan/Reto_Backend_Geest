// Se ejecuta antes de que los tests importen la aplicacion, para que
// config/env.ts lea la configuracion de pruebas y no la de desarrollo.
import { config } from 'dotenv';

config({ path: '.env.test', override: true });
