# Mi Primavera Vivero — v4

Cambios principales:
- logo duplicado en la raíz del proyecto y rutas absolutas para evitar fallas en Vercel;
- botón del video: ya no abre WhatsApp; lleva a destacadas/catálogo;
- cada planta separa **tipo de presentación** (Maceta soplada, Terrón, etc.) de **litros**;
- una presentación puede tener múltiples litros y cada combinación tiene su precio y costo;
- al elegir los litros en el catálogo cambia el precio automáticamente;
- carrito persistente arriba a la derecha;
- agregar al carrito desde la calculadora;
- opción Seguir comprando o Continuar con el pedido;
- resumen completo editable antes de confirmar;
- se puede cambiar cantidad, borrar un artículo o vaciar el carrito;
- el carrito lateral muestra productos, total, Confirmar mi pedido y Seguir comprando;
- pedidos de varios artículos se registran en Supabase con un único código y luego abren WhatsApp.

## Backend
Supabase ya fue actualizado para:
- permitir varios litros dentro de un mismo tipo de presentación;
- registrar un pedido completo de varios artículos mediante `create_cart_order`.

## Subida
Reemplazá los archivos del repositorio por los de este ZIP. Es importante subir también:
- `cart.js`
- `calculator.js`
- `calculadora.html`
- `logo-mi-primavera.jpg` en la raíz
- la carpeta `assets`
