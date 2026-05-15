# Plan de Diseño y Desarrollo: Metria Metrics "Spectacular Landing"

## 1. Visión Estética (The Glass Engine)
Inspirado en el lujo minimalista de `fluid.glass` y la energía técnica de `drinksom.eu`, crearemos una experiencia que posicione a Metria como el motor de inteligencia de negocios definitivo.

### Identidad Visual
- **Glassmorphism**: Uso intensivo de `backdrop-filter: blur()`, bordes semitransparentes y sombras profundas para crear capas de profundidad.
- **Paleta de Colores**:
  - Fondo: `Obsidian Deep` (#050505).
  - Acentos: `Metria Emerald` (#10b981) para salud financiera y `Electric Cyan` (#06b6d4) para tecnología.
  - Mesh Gradients: Gradientes animados sutiles en las esquinas para evitar un negro plano.
- **Tipografía**:
  - Headers: `Outfit` o `Inter` Extra Bold con espaciado ajustado (Kinetic Typography).
  - Cuerpo/Datos: `JetBrains Mono` o `Diatype Mono` para un look técnico y preciso.

## 2. Estructura de la Landing Page

### A. Hero Section: "The Core"
- **Visual**: Un "Data Orb" 3D o una estructura de cristal abstracta en el centro (Generada por AI).
- **Interacción**: Los elementos orbitan el título principal. 
- **Copy**: "Domina tus métricas. Multiplica tu rentabilidad."
- **CTA**: Botón con efecto de brillo líquido "Entrar al Dashboard".

### B. The Bento Grid: Integraciones & Conectividad
- Una cuadrícula de alta densidad (Bento Style) mostrando:
  - Tarjeta Meta Ads (Vibrante Azul).
  - Tarjeta TikTok Ads (Neón Pink/Cyan).
  - Tarjeta Google Ads (Minimalista Blanco/Multicolor).
  - Tarjeta Shopify/Dropi (Logística y Órdenes).
- **Animación**: Hover 3D (GPU accelerated) que inclina las tarjetas al pasar el cursor.

### C. The Pulse: Real-Time Intelligence
- Una sección que simula un dashboard fluido.
- Gráficos de líneas interactivos que se dibujan al hacer scroll.
- Contadores numéricos que "suben" al entrar en vista.

### D. The Secret Sauce: Atribución Inteligente
- Explicación visual de cómo Metria conecta cada céntimo invertido en ads con un producto específico.
- Uso de conectores animados (líneas de flujo).

### E. Footer: Minimalista y Profesional
- Disclaimer, redes y acceso directo.

## 3. Implementación Técnica

### Fase 1: Fundamentos (CSS & Libs)
- Instalar `lenis` para scroll fluido.
- Instalar `framer-motion` para animaciones complejas.
- Configurar variables de color en `globals.css`.

### Fase 2: Generación de Assets
- Generar el "Hero Background" y el "3D Data Core" usando `generate_image`.

### Fase 3: Construcción de Componentes
1. `Navbar`: Vidrio flotante.
2. `HeroSection`: Typografía cinética y 3D.
3. `BentoGrid`: Componentes de tarjetas interactivos.
4. `StatsSection`: Contadores animados.

### Fase 4: Pulido (The /audit Gate)
- Ajustar espaciado (gap tokens).
- Asegurar respuesta inmediata (<100ms).
- Optimización de carga (LCP).

## 4. Cronograma de Tareas (TODO)
- [ ] Generar imágenes base para el Hero.
- [ ] Configurar `globals.css` con el tema Metria Glass.
- [ ] Implementar el Layout base en `app/page.tsx` (reemplazando el redirect).
- [ ] Crear componentes de la Landing.
- [ ] Añadir interactividad (framer-motion y lenis).
- [ ] Ejecutar `/audit` y corregir hasta obtener 10/10.
