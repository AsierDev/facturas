# web-app

Versión actual de Facturas, mantenida y empaquetada como app desktop.

## Tecnología

- React + Vite + Tailwind
- Wrapper Electron
- Persistencia: `localStorage` del renderer

## Arquitectura (modular)

- `src/domain/types.ts`: contratos y tipos de dominio.
- `src/domain/core.ts`: reglas de negocio y utilidades de facturación.
- `src/domain/storage.ts`: carga/guardado, migración legacy y backup JSON.
- `src/domain/printing.ts`: plantilla imprimible y helpers de impresión.
- `src/components/FormFields.tsx`: componentes de formulario reutilizables.
- `src/components/views/*.tsx`: vistas de `Nueva factura`, `Lista` y `Configuración`.
- `src/App.tsx`: orquestación de estado y composición de vistas.

## Scripts

- `npm run dev`: desarrollo web (Vite)
- `npm run dev:desktop`: desarrollo desktop (Vite + Electron)
- `npm run test`: ejecutar tests unitarios (Vitest)
- `npm run test:watch`: tests en modo watch
- `npm run build`: build web
- `npm run preview`: preview web
- `npm run start:desktop`: arrancar app desktop con build existente
- `npm run dist:win`: instalador Windows (NSIS `.exe`)
- `npm run dist:mac`: instalador macOS (`.dmg`)
- `npm run dist:linux`: instalador Linux (`.AppImage`)

## Ejecutar en local

```bash
npm install
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

## Persistencia de datos

- Se guarda en `localStorage` del contexto de la app.
- Incluye backup manual (`Exportar copia` / `Importar copia`).
- En modo desktop, además exporta automáticamente snapshot legacy para migración:
  - Ruta compartida: `Documentos/Facturas/legacy-snapshot.json`

## Pruebas rápidas recomendadas

1. Crear factura.
2. Cerrar app y volver a abrir.
3. Confirmar que factura sigue visible.
4. Probar `Imprimir` y `Guardar PDF`.
5. Probar exportar e importar copia.

## Instalación para usuario final

1. Abrir instalador generado (`.exe`/`.dmg`/`.AppImage`).
2. Instalar.
3. Abrir desde icono de la app.
