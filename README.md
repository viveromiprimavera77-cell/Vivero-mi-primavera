# Mi Primavera Vivero

Primera versión funcional de la web pública + panel administrador.

## Qué incluye

- Inicio con video principal configurable.
- Carrusel de plantas destacadas.
- Catálogo dinámico por categorías.
- Menú lateral con acceso directo a categorías y plantas.
- Estados públicos:
  - 🟢 En stock
  - Consultar disponibilidad
- Sección Envíos.
- Sección Acerca de nosotros.
- Botón flotante de WhatsApp.
- Footer con Efectivo, Tarjeta y Mercado Pago.
- Panel `/admin` para:
  - crear y editar plantas,
  - precio y costo,
  - categoría,
  - foto,
  - disponibilidad,
  - destacadas,
  - visibilidad,
  - crear/editar categorías,
  - cambiar WhatsApp, textos y video,
  - calculadora de ganancia.
- Imágenes y video se guardan en Supabase Storage.

## Backend ya configurado

Proyecto Supabase:

`Vivero-Mi-Primavera`

La web usa una **publishable key**, que puede estar en el frontend. Las modificaciones están protegidas por RLS y requieren un usuario presente en `public.admin_users`.

## Crear el primer administrador

1. Entrá a Supabase.
2. Abrí **Authentication > Users**.
3. Creá un usuario con tu email y una contraseña.
4. Abrí **SQL Editor**.
5. Usá el archivo `ADMIN_SETUP.sql`, reemplazando `TU_EMAIL_AQUI`.

Después podés entrar a:

`/admin`

## Subir a GitHub

Como el conector de ChatGPT no está pudiendo escribir en GitHub:

1. Descargá/descomprimí este proyecto.
2. En GitHub abrí `Vivero-mi-primavera`.
3. Elegí **Add file > Upload files**.
4. Subí **el contenido de esta carpeta**, no la carpeta contenedora.
5. Confirmá el commit.

Si Vercel está conectado a ese repositorio, hará un deploy automáticamente.

## Vercel

No necesita build. Es un sitio estático.

- Framework preset: **Other**
- Build command: vacío
- Output directory: vacío / raíz

`vercel.json` ya incluye la ruta limpia `/admin`.

## Archivos principales

- `index.html` — web pública
- `styles.css` — estilos públicos
- `app.js` — catálogo dinámico
- `admin.html` — panel
- `admin.css` — estilos del panel
- `admin.js` — gestión de catálogo, ajustes y calculadora
- `config.js` — URL + publishable key de Supabase
- `assets/logo-mi-primavera.jpg` — logo
