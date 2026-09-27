# Mi Primavera Vivero — v8

Cambios principales:
- nuevo selector **Priorizar altura en el catálogo** por planta;
- si está activado, el cliente elige altura y cambian automáticamente presentación, litros (si existen) y precio;
- si no hay litros en ninguna opción pero sí hay alturas, la web cambia automáticamente a selector de altura;
- en casos mixtos, el tilde Priorizar altura decide que la altura sea la variable principal;
- si está desactivado y hay litros, el comportamiento por defecto sigue priorizando litros;
- admite casos mixtos: por ejemplo 2 m en envase de 10 L y 6 m en terrón;
- la calculadora y el resumen respetan la misma prioridad;
- el panel exige que todas las opciones tengan altura cuando se activa Priorizar altura;
- las etiquetas de tiempo de cierre muestran distancia, litros y altura cuando corresponda.

Supabase ya fue actualizado con `prioritize_height`. La planta actual llamada Palmera quedó marcada para priorizar altura.
