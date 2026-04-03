# desktop-app

Nueva app desktop de Facturas con persistencia en SQLite.

## Tecnología

- Electron (main + preload + renderer React)
- React + Vite + Tailwind
- SQLite local con `better-sqlite3`
- IPC seguro (sin `nodeIntegration`)

## Arquitectura (modular)

- `src/domain/types.ts`: tipos, contratos e interfaz de API desktop.
- `src/domain/core.ts`: reglas de negocio y utilidades de facturación.
- `src/domain/printing.ts`: plantilla imprimible y helpers de impresión.
- `src/components/FormFields.tsx`: componentes de formulario reutilizables.
- `src/components/views/*.tsx`: vistas de `Nueva factura`, `Lista` y `Configuración`.
- `src/App.tsx`: orquestación de estado, IPC y composición de vistas.

## Base de datos

Archivo SQLite:

- `app.getPath('userData')/facturas.db`

Tablas:

- `meta`
- `config`
- `invoices`

## IPC disponible

- `migration:run`
- `config:get`, `config:set`
- `invoice:list`, `invoice:create`, `invoice:delete`
- `backup:export`, `backup:import`

## Scripts

- `npm run dev`: desarrollo web
- `npm run dev:desktop`: desarrollo desktop (Vite + Electron)
- `npm run test`: ejecutar tests unitarios (Vitest)
- `npm run test:watch`: tests en modo watch
- `npm run build`: build renderer
- `npm run preview`: preview web
- `npm run start:desktop`: ejecutar desktop
- `npm run rebuild:native`: recompilar dependencias nativas para Electron
- `npm run dist:win`: instalador Windows
- `npm run dist:mac`: instalador macOS
- `npm run dist:linux`: instalador Linux

## Ejecutar en local

```bash
npm install
npm run rebuild:native
npm run test
npm run dev:desktop
```

## Empaquetar instalador

```bash
npm run dist:mac
# o
npm run dist:win
# o
npm run dist:linux
```

Artefactos en `release/`.

## Migración automática (primer arranque)

Si la base de datos está vacía, intenta migrar en este orden:

1. Snapshot compartido: `Documentos/Facturas/legacy-snapshot.json`.
2. `localStorage` moderno (`facturas_alquiler_app_v1`).
3. Claves legacy (`facturas_emisor`, `facturas_inquilino`, `facturas_lista`, `facturas_proximo_numero`).

Si no encuentra fuente, arranca limpio sin bloquear la app.

## Backup

- `Exportar copia`: guarda JSON desde diálogo nativo.
- `Importar copia`: carga JSON y reemplaza el estado actual.

## Pruebas rápidas recomendadas

1. Primer arranque con datos legacy presentes: comprobar migración.
2. Crear, listar y eliminar facturas.
3. Cerrar/abrir app y confirmar persistencia SQLite.
4. Exportar backup, borrar datos, importar backup y verificar restauración.
5. Probar impresión/PDF.

## Instalación para usuario final

1. Ejecutar instalador (`.exe`/`.dmg`/`.AppImage`).
2. Finalizar asistente.
3. Abrir desde icono.
4. Usar normalmente (sin terminal).
