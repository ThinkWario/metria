# Lessons Learned

- **Directiva "use client"**: Debe ser SIEMPRE la primera línea del archivo. Un salto de línea antes de la directiva puede romper el reconocimiento por parte de Next.js (Turbopack), causando errores de renderizado.
- **Importaciones en SSR**: Si una utilidad como `cn` falla en el servidor a pesar de estar importada con alias (`@/`), intentar usar rutas relativas (`../../lib/utils`) para forzar la resolución del módulo.
