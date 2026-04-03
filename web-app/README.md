# web-app

Versión actual de Facturas, mantenida y empaquetada como app desktop.

## Tecnología

- React + Vite + Tailwind
- Wrapper Electron
- Persistencia: `localStorage` del renderer

## Scripts

- `npm run dev`: desarrollo web (Vite)
- `npm run dev:desktop`: desarrollo desktop (Vite + Electron)
- `npm run build`: build web
- `npm run preview`: preview web
- `npm run start:desktop`: arrancar app desktop con build existente
- `npm run dist:win`: instalador Windows (NSIS `.exe`)
- `npm run dist:mac`: instalador macOS (`.dmg`)
- `npm run dist:linux`: instalador Linux (`.AppImage`)

## Ejecutar en local

```bash
npm install
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
