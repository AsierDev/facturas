# Facturas

Proyecto con dos aplicaciones separadas para facturación de alquiler:

- `web-app`: versión actual (web + wrapper desktop), persistencia en `localStorage`.
- `desktop-app`: nueva versión desktop nativa con `Electron + SQLite`.

## Estructura

- `web-app/`: app actual, ya funcional, empaquetable como instalador.
- `desktop-app/`: app nueva con base de datos local real.
- `.github/workflows/build-desktop.yml`: pipeline CI para generar instaladores por plataforma.

## Requisitos

- Node.js 22+
- npm 10+
- Para empaquetado local:
  - macOS: Xcode CLI Tools
  - Windows: toolchain de build de Node (si aplica nativo)
  - Linux: dependencias de empaquetado AppImage

## Qué usar según caso

- Si quieres mantener la app existente y tener instalador rápido: usa `web-app`.
- Si quieres persistencia robusta en disco (SQLite): usa `desktop-app`.

## Instaladores y artefactos

Cada app tiene scripts:

- `npm run test`
- `npm run dist:win`
- `npm run dist:mac`
- `npm run dist:linux`

Salida local:

- `web-app/release/`
- `desktop-app/release/`

## CI/CD (GitHub Actions)

Workflow: `.github/workflows/build-desktop.yml`

Genera artefactos para ambas apps en matrix:

- Windows (`.exe` NSIS)
- macOS (`.dmg`)
- Linux (`.AppImage`)

## Iconos y metadata

Se han añadido iconos para ambas apps:

- `build/icon.png`
- `build/icon.ico`
- `build/icon.icns`

Y metadata de app en `package.json` (`description`, `author`, rutas de icono para mac/win/linux).

## Instalación para usuario final

1. Descargar el instalador (`.exe` en Windows / `.dmg` en macOS).
2. Instalar con doble click (siguiente, siguiente, finalizar).
3. Abrir la app desde el icono del escritorio o menú inicio.

No necesita terminal para uso diario.

## Validación recomendada antes de subir cambios

En cada app (`web-app` y `desktop-app`):

```bash
npm run test
npm run build
```
