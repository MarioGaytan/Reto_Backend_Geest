# Reto GEEST — API de gestión de tareas

API REST para crear tareas, asignarlas a varias personas y archivarlas automáticamente cuando todas completan su parte, notificando a un sistema externo.

**Stack:** Node.js 20 · TypeScript · Express · PostgreSQL 16 · Jest

> URL pública: _pendiente de despliegue_

---

## Ejecutar localmente

Requisitos: Node >= 20, npm >= 10 y Docker.

```bash
git clone <url-del-repositorio>
cd Reto_Backend_Geest
npm install
cp .env.example .env
docker compose up -d
npm run migrate
npm run dev
```

La API queda en `http://localhost:3000`. Comprobar:

```bash
curl http://localhost:3000/health
```

### Comandos

| Comando | Descripción |
|---|---|
| `npm run dev` | Desarrollo con recarga automática |
| `npm test` | **Tests automatizados** |
| `npm run migrate` | Aplica las migraciones pendientes |
| `npm run build` / `npm start` | Compila / ejecuta la versión compilada |

### Variables de entorno

Se copian de `.env.example`. `DATABASE_URL`, `NOTIFY_URL` y `API_KEY` son obligatorias y se validan al arrancar.

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL |
| `NOTIFY_URL` | Webhook externo notificado al archivar una tarea |
| `API_KEY` | Clave de acceso a la API (header `x-api-key`) |
| `PORT` · `NODE_ENV` · `DATABASE_SSL` | Opcionales, con valor por defecto |

---

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/users` | Registra un usuario. Valida email y campos obligatorios |
| `GET` | `/users` | Usuarios con sus tareas pendientes |
| `POST` | `/tasks` | Registra una tarea con estado `open` |
| `GET` | `/tasks` | Tareas con sus asignados. Acepta `?status=open\|archived` |
| `GET` | `/tasks/:idTask` | Detalle de una tarea y quién completó su parte |
| `POST` | `/tasks/:idTask/assign` | Asigna usuarios sin duplicar la relación |
| `POST` | `/tasks/:idTask/complete` | Marca la parte del usuario; archiva si ya no queda nadie |
| `GET` | `/users/:idUser/tasks` | Tareas del usuario, indicando si completó su parte |
| `GET` | `/tasks/:idTask/notifications` | Intentos de notificación de esa tarea |
| `GET` | `/health` | Estado del servicio y de la base (público, sin clave) |

Todos los endpoints de negocio exigen el header `x-api-key` (ver [Extra](#extra)). `/health` queda fuera para que el proveedor pueda monitorizar el servicio.

```bash
curl -H "x-api-key: $API_KEY" http://localhost:3000/users
```

Todos los `POST` aceptan el header `Idempotency-Key`. Con la misma llave y el mismo cuerpo la operación se ejecuta una sola vez y ambas respuestas son idénticas, incluso si los requests llegan en paralelo. Con la misma llave y un cuerpo distinto se responde `422`.

Los errores siempre responden con la misma forma:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "email: no es un correo electronico valido" } }
```

---

## Modelo de datos

El esquema está versionado como migraciones SQL en [`migrations/`](migrations/), aplicadas en orden por `npm run migrate`.

```mermaid
erDiagram
    users ||--o{ task_assignments : "se le asignan"
    tasks ||--o{ task_assignments : "agrupa"
    tasks ||--o{ notification_attempts : "genera"

    users {
        int id PK "identity"
        varchar name "not null"
        varchar last_name "not null"
        varchar email UK "unico, comparado en minusculas"
        timestamptz created_at "default now()"
    }

    tasks {
        int id PK "identity"
        varchar title "not null"
        text description "nullable"
        task_status status "enum: open o archived, default open"
        timestamptz created_at "default now()"
        timestamptz archived_at "nullable, obligatorio si archived"
    }

    task_assignments {
        int id PK "identity"
        int task_id FK "tasks.id, on delete cascade"
        int user_id FK "users.id, on delete restrict"
        boolean completed "default false"
        timestamptz completed_at "nullable, obligatorio si completed"
        timestamptz assigned_at "default now()"
    }

    notification_attempts {
        int id PK "identity"
        int task_id FK "tasks.id, on delete cascade"
        int attempt_number "unico junto a task_id"
        int http_status "nullable si el destino no respondio"
        boolean success "default false"
        timestamptz created_at "default now()"
    }

    idempotency_keys {
        int id PK "identity"
        varchar idem_key "unico junto a endpoint"
        varchar endpoint "unico junto a idem_key"
        varchar request_hash "sha-256 del body"
        int response_status "nullable mientras la operacion esta en vuelo"
        jsonb response_body "respuesta ya calculada"
        timestamptz created_at "default now()"
    }
```

`task_assignments` es la tabla central: resuelve la relación muchos-a-muchos y guarda el completado **por persona y por tarea**. `idempotency_keys` no tiene relaciones porque es infraestructura transversal a todos los `POST`.

---

## Decisiones técnicas

**PostgreSQL sobre SQLite.** El reto exige escrituras concurrentes correctas (dos usuarios completando a la vez). SQLite serializa con un lock global de escritura; Postgres ofrece `SELECT … FOR UPDATE` a nivel de fila, que es la herramienta exacta para archivar exactamente una vez.

**Sin ORM: driver `pg` y SQL a mano.** El núcleo del reto es control transaccional fino (locks de fila, `ON CONFLICT`). Un ORM oculta justo eso y obligaría a escribir SQL crudo en los puntos críticos de todos modos.

**Migraciones SQL planas con ejecutor propio** (~60 líneas, `src/db/migrate.ts`). Cumple el requisito de esquema versionado sin sumar una dependencia. Aplica solo lo pendiente, cada archivo en su transacción, y registra lo aplicado en `schema_migrations`.

**`status` como `ENUM` y no `VARCHAR`.** La integridad la garantiza la base, no la disciplina del código.

**Las reglas críticas viven en la base, no solo en el servicio.** `UNIQUE (task_id, user_id)` impide duplicar la asignación aunque lleguen requests en paralelo — un `SELECT` previo no lo lograría. `UNIQUE (idem_key, endpoint)` es lo que hace que dos requests simultáneos con la misma `Idempotency-Key` colisionen al insertar en vez de ejecutarse dos veces. `UNIQUE (task_id, attempt_number)` impide registrar dos veces el mismo intento de notificación.

**Restricciones `CHECK` que hacen imposible el estado inconsistente.** Una tarea `archived` siempre tiene `archived_at`; una `open` nunca lo tiene. Igual para `completed` / `completed_at`. Un archivado a medias no puede existir ni por error de código.

**Unicidad de email insensible a mayúsculas** (índice sobre `lower(email)`). `Mario@x.com` y `mario@x.com` son la misma persona.

**La idempotencia la arbitra el índice único, no una lectura previa.** Entre un `SELECT` que comprueba si la llave existe y el `INSERT` que la crea hay una ventana en la que dos requests paralelos verían ambos "no existe". En su lugar se inserta directamente en `idempotency_keys`: el request que gana mantiene su transacción abierta mientras ejecuta la operación, y el gemelo queda bloqueado en su propio `INSERT` hasta el `COMMIT`, momento en el que lee la respuesta ya guardada y la reproduce. Si la operación falla con `5xx` se hace `ROLLBACK` y la llave queda libre para un reintento real.

**El archivado automático se serializa con un lock de fila.** `POST /tasks/:idTask/complete` abre una transacción que empieza con `SELECT … FOR UPDATE` sobre la tarea. Si los dos últimos asignados completan a la vez, el segundo espera al primero, ve la tarea ya archivada y no repite la transición. Como solo esa transacción realiza el cambio, solo ella notifica: archivado y notificación ocurren exactamente una vez.

**La notificación se envía fuera de la transacción.** Los reintentos con backoff tardan segundos y, dentro de la transacción, mantendrían el lock de la fila bloqueando al resto. Se espera únicamente al primer intento —el caso normal— y los reintentos siguen en segundo plano, para no hacer esperar varios segundos a quien completó su parte. Cada intento se registra en la base **antes** de lanzar la petición y se actualiza con el resultado, de modo que queda constancia aunque el proceso muera a mitad del envío. Se reintenta hasta 3 veces con esperas de 1 s y 2 s ante `5xx` o ausencia de respuesta; un `4xx` no se reintenta, porque el destino entendió y rechazó.

**Lecturas agregadas en una sola consulta.** `GET /users` y `GET /tasks` construyen sus arreglos anidados con `jsonb_agg` en la base, en vez de consultar las relaciones por cada fila. Evita el problema N+1 sin añadir un ORM.

---

## Supuestos

- **La notificación externa no se desarrolla.** `NOTIFY_URL` apunta a un endpoint de prueba (webhook.site) para demostrar los reintentos, tal como permite el enunciado.
- **Una tarea sin usuarios asignados nunca se archiva sola.** El archivado solo se evalúa al completar una parte; sin asignados no hay nada que completar.
- **El archivado no se revierte.** No existe endpoint para reabrir una tarea ni el enunciado lo pide.
- **`status` se almacena, no se deriva** de las asignaciones. Es una desnormalización deliberada: archivar dispara un efecto externo (la notificación) y necesita ser una transición bloqueable para garantizar el "exactamente una vez".
- Un usuario con tareas asignadas no puede borrarse (`ON DELETE RESTRICT`): perdería el histórico y alteraría el conteo de completados.
- **No hay contraseñas ni sesiones de usuario.** El contrato del reto no las contempla: `POST /users` no recibe contraseña y `POST /tasks/:idTask/complete` recibe el `userId` en el cuerpo. Se interpreta como una API máquina-a-máquina donde el cliente afirma en nombre de quién actúa; la autenticación protege el perímetro con una API Key, no con sesiones por usuario.
- **Asignar a una tarea archivada devuelve `409`.** Añadir un asignado pendiente a una tarea ya archivada la dejaría en un estado que nada volvería a cerrar, porque no existe reapertura.
- **Completar dos veces la misma parte no es error.** La segunda llamada responde éxito sin alterar el `completedAt` original, que es el comportamiento esperado ante un doble clic.

---

## Alcance y recortes

_Se completará al cierre del reto._

---

## Extra: autenticación por API Key

**Qué problema resuelve.** Sin autenticación la API está completamente abierta: cualquiera que descubra la URL puede crear, asignar y archivar tareas, y leer los nombres y correos de todos los usuarios con un `GET /users`. Hay además un abuso menos evidente y más serio: al archivar una tarea la API hace un `POST` saliente a `NOTIFY_URL`, así que un desconocido que archive tareas en bucle convierte el servicio en un amplificador de tráfico contra un tercero, desde esta IP.

**Por qué era necesaria.** Es el único hueco que impediría desplegar esto en producción tal cual. El resto de mejoras posibles optimizan un servicio que funciona; esta cierra un servicio que no debería estar expuesto.

**Por qué sobre otras alternativas.** Se consideraron tres. *Autenticación por usuario con JWT* contradice el contrato del reto: `POST /users` no recibe contraseña y `/complete` recibe el `userId` en el cuerpo, de modo que el actor lo afirma el cliente; introducir sesiones habría exigido columnas fuera del modelo y alterado la funcionalidad requerida. *Rate limiting* trata el síntoma y no la causa: limitar peticiones sin autenticar sigue permitiendo que cualquiera escriba datos, solo que más despacio. *Paginación* es una mejora de escalabilidad, no un hueco del producto.

**Cómo funciona.** Un middleware compara el header `x-api-key` con la variable `API_KEY` usando `crypto.timingSafeEqual`, para que el tiempo de respuesta no revele la clave carácter a carácter. También acepta `Authorization: Bearer <clave>`. Si falta o no coincide responde `401` con el formato de error estándar. Se aplica a los routers de negocio y no a `/health`: un healthcheck autenticado haría que el proveedor diera el despliegue por muerto y reiniciara el contenedor en bucle.

**Hacia dónde crece.** Toda la autenticación vive en un archivo, así que sustituir la clave compartida por claves por cliente (una tabla con la clave hasheada), añadir permisos de solo lectura o aplicar rate limiting por clave en vez de por IP son cambios localizados en ese punto.

---

## Despliegue

_Se completará al desplegar._
