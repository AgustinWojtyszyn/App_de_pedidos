# Pruebas de carga con Locust

Suite de carga para la App de Pedidos. Simula usuarios autenticados contra Supabase usando cuentas ficticias dedicadas.

## Seguridad

- Por defecto la suite es **solo lectura**.
- Los usuarios de prueba usan emails `locust.load.XXXX@servifood.test`.
- Las credenciales se generan en `testing/locust/.users.csv` y no se versionan.
- El modo escritura requiere `LOCUST_ENABLE_WRITES=1`.
- Cada usuario ficticio crea como máximo un pedido por ejecución.
- `npm run locust:cleanup` elimina pedidos y usuarios sintéticos.

## Requisitos

Python 3.11+ y las variables del proyecto en `.env`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Locust está fijado a 2.46.6.

## Instalación

```bash
npm run locust:install
```

## 1. Crear usuarios ficticios

Por defecto crea 250 usuarios, todos con rol normal.

```bash
npm run locust:seed
```

Opcional:

```bash
LOCUST_TEST_USERS=500 \
LOCUST_COMPANY_SLUG=epse \
LOCUST_LOCATION="Padre Bueno" \
npm run locust:seed
```

## 2. Smoke test

```bash
npm run locust:smoke
```

Hace 10 usuarios / 30 s en modo lectura.

## 3. Escalado automático

```bash
npm run locust:staged
```

Por defecto prueba:

`10 -> 25 -> 50 -> 100 -> 200` usuarios, 45 segundos por etapa.

Se puede cambiar sin tocar código:

```bash
LOCUST_STAGES=50,100,200,300,500 LOCUST_RUN_TIME=60s npm run locust:staged
```

La ejecución se detiene si:
- el ratio de errores supera 1%; o
- el p95 supera 1500 ms.

Umbrales configurables:

```bash
LOCUST_FAIL_RATIO_MAX=0.02 LOCUST_P95_MAX_MS=2000 npm run locust:staged
```

Los CSV y HTML quedan en `testing/locust/results/`.

## 4. Interfaz web de Locust

```bash
npm run locust:ui
```

Abrir luego `http://localhost:8089`.

## 5. Prueba de escritura

Hacerla recién después de aprobar lectura:

```bash
LOCUST_ENABLE_WRITES=1 LOCUST_TAGS=write LOCUST_STAGES=10,25,50 npm run locust:staged
```

El test usa el RPC productivo `create_order_idempotent`, marca los pedidos con `LOCUST_LOAD_TEST` y luego verifica que el pedido sea visible para su dueño.

## 6. Limpieza

```bash
npm run locust:cleanup
```

## Qué representa la prueba

El modo lectura reproduce los accesos que más se repiten en el uso normal:

- login con Supabase Auth;
- lectura del dashboard personal;
- menú global y de empresa;
- contexto de horarios;
- opciones personalizables;
- perfil propio.

No mide únicamente Render: la mayor parte de la carga operativa de la app llega directamente a Supabase.

## Interpretación

No tomar como capacidad el último número que “terminó”. El techo operativo debe quedar por debajo del punto donde comienzan a subir de forma sostenida el p95, los 429, los 5xx o los errores de RPC.
