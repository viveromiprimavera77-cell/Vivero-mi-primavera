# Mi Primavera Vivero — v9

Cambios de esta versión:
- se agregó **Teléfono / WhatsApp** al formulario de confirmación;
- el teléfono queda guardado con el pedido en Supabase;
- en el panel, cada pedido muestra Dirección + Código Postal y debajo/como siguiente dato el Teléfono;
- botón **Ver en WhatsApp** para abrir directamente el chat del cliente;
- pedidos cancelados quedan excluidos del acumulado de ventas/ganancias;
- el pie de página ahora muestra **Efectivo · Transferencias · Mercado Pago**;
- la flecha para volver al inicio ahora queda centrada en la parte inferior.

## Backend
Supabase ya fue actualizado con la columna `orders.phone` y una nueva versión de `create_cart_order` que recibe `p_phone`.

## Subida
Reemplazá los archivos del repositorio por los de este ZIP. Vercel debería desplegar automáticamente.
