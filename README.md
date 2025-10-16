# Misiones – Admin de Puntajes (Vite + React + TS)

## Requisitos
- Node.js 18+ y npm
- Cuenta de Supabase y un proyecto con las tablas/vistas ya creadas

## Configuración
1. Copiá `.env.example` a `.env` y completá `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
2. Instalá dependencias:
   ```bash
   npm install
   ```
3. Levantá el entorno local:
   ```bash
   npm run dev
   ```

## Estructura
- `src/components/AdminPuntajes.tsx`: componente principal provisto por Iván.
- `src/lib/supabase.ts`: cliente de Supabase.

> Tailwind se carga por CDN en `index.html`.
