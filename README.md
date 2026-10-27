# Banco de Talentos MT · Frontend

React 19 + TypeScript + Vite. Multi-tenant, multi-idioma (es/en) y con soporte offline (PWA + IndexedDB).

## Rutas

| Ruta | Uso |
|---|---|
| `/:tenant/login` | Login del tenant con su logo y sus colores (ej. `/fractal/login`) |
| `/:tenant` | Panel del tenant: inicio, marca y colores, usuarios, API de integración |
| `/admin/login`, `/admin` | Super Admin: tenants y aprobación de API keys |
| `/invitacion/:token` | Activación de una cuenta invitada |

## Sistema de diseño

- **Tokens:** están en `src/styles/tokens.css` y tienen dos capas.
  - *Marca* (`--brand-*`): la sobrescribe el branding del tenant en tiempo de ejecución.
  - *Semántica* (`--color-*`, `--space-*`, `--text-*`, `--radius-*`, `--shadow-*`): es la que usan los componentes.
  - No se usan colores hex sueltos en los componentes.
- **Componentes:** están en `src/components/ui`. Son Button (primary, secondary, ghost, danger; md, sm; loading), Field, PasswordField, SelectField, ColorField, Card, StatusBadge, Modal (se cierra con Esc y gestiona el foco), Toast, LangSwitch y CopyButton.
- **Layout:** `AppShell`, con Sidebar y Topbar, y un banner de modo offline.

## Seguridad en el cliente

- El access token vive solo en memoria. El refresh token es una cookie HttpOnly que la página no puede leer.
- No se usa `dangerouslySetInnerHTML`. Todo el contenido del tenant se renderiza como texto.

## Offline

- `src/lib/offline.ts` mantiene una cola de operaciones en IndexedDB. Cada operación lleva su `X-Client-Op-Id` y se reenvía al reconectar.
- También guarda una caché del branding y de los datos.
- La app se precachea con un service worker (vite-plugin-pwa).

## Local

```bash
cp .env.example .env
npm install
npm run dev            # http://localhost:5173 (proxy /api -> http://localhost:8080)
npx playwright install chromium
npm run test:e2e       # requiere la API corriendo y .env.e2e con E2E_SA_EMAIL/E2E_SA_PASSWORD
```

Las pruebas E2E incluyen `e2e/security.spec.ts`, con casos de hacking ético basados en OWASP Top 10. Deben pasar en cada release.
