# Reto Backend GEEST

API REST construida con **Node.js + TypeScript + Express + PostgreSQL**.

> Estado: scaffold inicial. Todavia no hay endpoints de negocio implementados.

---

## Requisitos previos

| Herramienta | Version | Comprobar con |
|---|---|---|
| Node.js | >= 20 | `node -v` |
| npm | >= 10 | `npm -v` |
| Docker Desktop | cualquiera reciente | `docker -v` |

No necesitas instalar PostgreSQL en tu maquina: se levanta en un contenedor.

---

## Puesta en marcha desde cero

Cuatro pasos desde un clon limpio.

### 1. Clonar e instalar dependencias

```bash
git clone <url-del-repositorio>
cd Reto_Backend_Geest
npm install
```

### 2. Crear el archivo de entorno

El archivo `.env` no se versiona. Se genera a partir de la plantilla:

```bash
cp .env.example .env
```

En PowerShell, si `cp` te da problemas:

```bash
Copy-Item .env.example .env
```

Los valores por defecto ya funcionan en local. Revisa la tabla de [variables de entorno](#variables-de-entorno) para saber cuales debes cambiar.

### 3. Levantar la base de datos

```bash
docker compose up -d
```

Esto arranca un PostgreSQL 16 llamado `geest-postgres`. Espera a que quede sano:

```bash
docker compose ps
```

Debe mostrar `healthy` en la columna de estado.

### 4. Aplicar migraciones y arrancar

```bash
npm run migrate
npm run dev
```

La API queda escuchando en `http://localhost:3000`.

> Mientras no existan archivos en `migrations/`, el comando `migrate` responde `No hay migraciones pendientes`. Es correcto.

### Verificar que todo funciona

```bash
curl http://localhost:3000/api/health
```

Respuesta esperada:

```json
{ "status": "ok", "db": "up", "uptime": 3, "timestamp": "..." }
```

Si `db` aparece como `"down"`, la API arranco pero no alcanza la base de datos. Ve a [Problemas comunes](#problemas-comunes).

---

## Comandos disponibles

| Comando | Que hace |
|---|---|
| `npm run dev` | Arranca en modo desarrollo con recarga automatica (tsx watch) |
| `npm run build` | Compila TypeScript a `dist/` |
| `npm start` | Ejecuta la version compilada (requiere `build` previo) |
| `npm test` | Corre la suite de tests con Jest |
| `npm run test:watch` | Tests en modo watch |
| `npm run migrate` | Aplica las migraciones SQL pendientes |
| `npm run migrate:prod` | Igual que `migrate`, pero sobre el codigo compilado |
| `npm run typecheck` | Valida tipos sin generar archivos |

### Comandos de Docker

| Comando | Que hace |
|---|---|
| `docker compose up -d` | Levanta PostgreSQL en segundo plano |
| `docker compose ps` | Muestra el estado del contenedor |
| `docker compose logs -f db` | Sigue los logs de la base de datos |
| `docker compose stop` | Detiene el contenedor conservando los datos |
| `docker compose down` | Detiene y elimina el contenedor (los datos sobreviven en el volumen) |
| `docker compose down -v` | Elimina tambien el volumen: **borra todos los datos** |

---

## Variables de entorno

Definidas en `.env`. La plantilla de referencia es `.env.example`.

| Variable | Obligatoria | Por defecto | Descripcion |
|---|---|---|---|
| `PORT` | No | `3000` | Puerto donde escucha la API |
| `NODE_ENV` | No | `development` | `development` \| `test` \| `production` |
| `DATABASE_URL` | **Si** | — | Cadena de conexion a PostgreSQL |
| `DATABASE_SSL` | No | `false` | Ponlo en `true` con proveedores cloud (Neon, Render, Heroku) |
| `NOTIFY_URL` | **Si** | — | Webhook externo al que se notifican los cambios de estado |
| `API_KEY` | **Si** | — | Clave que exigen los endpoints protegidos (header `x-api-key`) |

Las tres obligatorias se validan al arrancar: si falta alguna, el proceso termina con un mensaje explicito en lugar de fallar mas adelante.

> **Cambia `API_KEY`.** El valor de la plantilla es un placeholder.

### Sobre el puerto de la base de datos

`docker-compose.yml` publica PostgreSQL en el puerto **5436** del host, no en el 5432 habitual. Es deliberado: evita chocar con otros contenedores de PostgreSQL que ya tengas corriendo. Dentro del contenedor el puerto sigue siendo el 5432.

Si prefieres el 5432 y lo tienes libre, cambia el mapeo en `docker-compose.yml` y el puerto en `DATABASE_URL`. Deben coincidir.

---

## Estructura del proyecto

```
src/
  app.ts              Configuracion de Express y montaje de rutas
  server.ts           Arranque del servidor y apagado ordenado
  config/env.ts       Carga y validacion de variables de entorno
  routes/             Definicion de rutas
  controllers/        Manejo de request y response
  services/           Logica de negocio
  db/
    pool.ts           Pool de conexiones, query() y withTransaction()
    migrate.ts        Ejecutor de migraciones
  middlewares/        apiKey, errorHandler, notFound, requestLogger
  utils/              AppError y logger
migrations/           Migraciones SQL, se aplican en orden alfabetico
tests/                Tests automatizados
```

---

## Tests

```bash
npm test
```

Los tests no requieren base de datos: el health check acepta tanto `200` como `503`, de modo que la suite pasa aunque PostgreSQL este apagado.

---

## Problemas comunes

### `password authentication failed for user "..."`

Tu `DATABASE_URL` apunta a un PostgreSQL distinto al del proyecto, normalmente otro contenedor ocupando el mismo puerto. Revisa que puertos estan en uso:

```bash
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

Confirma que el puerto de `DATABASE_URL` coincide con el que publica `geest-postgres`.

### `Arranque abortado: PostgreSQL no responde`

La base de datos no esta levantada o no es alcanzable. El log incluye host, puerto, base y usuario contra los que se intento conectar. Levantala con:

```bash
docker compose up -d
```

### `Falta la variable de entorno obligatoria: X`

No existe `.env` o le falta esa variable. Regeneralo desde la plantilla:

```bash
cp .env.example .env
```

### El puerto 3000 ya esta en uso

Cambia `PORT` en tu `.env` a un puerto libre.

### Empezar la base de datos desde cero

Borra el volumen y vuelve a levantar:

```bash
docker compose down -v
docker compose up -d
npm run migrate
```
