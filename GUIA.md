# Guía de word.md

Markdown solo entiende estructura: títulos, listas, tablas, énfasis. Si tu Word usa los estilos correctos, el resultado queda perfecto a la primera.

> Esta guía también está dentro de la app, en la pestaña **Guía**.

## 1. Usar el convertidor

1. Abre `index.html` con doble clic. Se abre en tu navegador (Chrome o Edge).
2. Arrastra uno o varios archivos `.docx` a la zona blanca, o pulsa **Elegir archivos**.
3. Revisa el Markdown y la vista previa. Si aparecen consejos amarillos, léelos: te dicen qué corregir en el Word.
4. Pulsa **Descargar**:
   - Si el documento no tiene imágenes, recibes un archivo `.md`.
   - Si tiene imágenes, recibes un `.zip` con el `.md` y una carpeta `imagenes/`. Descomprímelo y mantén ambos juntos.
   - Si convertiste varios archivos, **Descargar todos (.zip)** los junta en un solo archivo.

No necesita internet: puedes copiar la carpeta completa a una memoria USB y usarla en cualquier computadora con Windows, Mac o Linux.

## 2. Cómo se traduce cada cosa

| En Word usa… | Queda en Markdown |
|---|---|
| Estilo **Título 1** | `# Título` |
| Estilo **Título 2** … **Título 6** | `##` … `######` |
| Estilo **Título** (portada) | `# Título` |
| **Negrita** (Ctrl+N) | `**texto**` |
| *Cursiva* (Ctrl+K) | `*texto*` |
| ~~Tachado~~ | `~~texto~~` |
| Botón de viñetas | `- elemento` |
| Botón de numeración | `1. elemento` |
| Hipervínculo (Ctrl+Alt+K) | `[texto](url)` |
| Tabla | `\| a \| b \|` |
| Estilo **Cita** | `> cita` |
| Estilo **Código** | bloque ```` ``` ```` |
| Imagen "En línea con el texto" | `![texto alternativo](imagenes/imagen-1.png)` |

## 3. Reglas de oro para preparar el Word

- **Títulos con estilos, no con formato.** Selecciona el texto y elige *Título 1*, *Título 2*… en *Inicio › Estilos*. Un texto grande y en negrita se queda como texto normal en negrita.
- **No saltes niveles.** Después de un Título 1 va un Título 2, no un Título 4.
- **Listas con los botones** de viñetas o numeración. No escribas guiones o números a mano. Usa Tab para crear subniveles y Shift+Tab para volver.
- **Tablas sencillas.** La primera fila es el encabezado. Evita combinar o dividir celdas y no pongas tablas dentro de tablas.
- **Imágenes "En línea con el texto"** (*Formato de imagen › Ajustar texto*). Añade texto alternativo con clic derecho › *Ver texto alternativo*: se usa como descripción en el Markdown.
- **Una idea por párrafo.** Usa Enter para separar párrafos; no uses líneas vacías para dar espacio.
- **Código:** crea un estilo de párrafo llamado exactamente **Código** (o **Code**) con fuente Consolas y aplícalo a cada línea del bloque. La plantilla de ejemplo ya lo trae.

## 4. Lo que se pierde

- Colores, fuentes, tamaños y resaltados.
- Encabezados, pies de página y números de página.
- Cuadros de texto, formas, SmartArt, WordArt y gráficos (conviértelos en imagen primero: clic derecho › *Guardar como imagen*).
- Celdas combinadas y alineación de tablas.
- Comentarios y control de cambios (acéptalos antes de convertir: *Revisar › Aceptar todos los cambios*).
- Tablas de contenido automáticas (en Markdown sobran: los títulos ya son el índice).
- Archivos `.doc` antiguos: ábrelos en Word y usa *Archivo › Guardar como › Documento de Word (.docx)*.

## 5. Plantilla de ejemplo

`ejemplo/plantilla.docx` usa todos los elementos soportados. Úsala así:

- **Para aprender:** conviértela y compara el Word con el Markdown.
- **Como base:** ábrela en Word, borra el contenido y escribe el tuyo. Los estilos *Cita* y *Código* ya están creados.

## 6. Problemas frecuentes

| Problema | Solución |
|---|---|
| "No se pudo leer el archivo" | El archivo tiene contraseña o está dañado. Ábrelo en Word, quita la protección y usa *Guardar como .docx*. |
| Los títulos salen como texto normal | No tienen estilo de título. Aplícales *Título 1*, *Título 2*… |
| Las viñetas salen como párrafos | Se escribieron a mano. Usa el botón de viñetas. |
| Una imagen no se ve en la vista previa | Está en formato EMF/WMF/TIFF. En Word: clic derecho › *Guardar como imagen* › PNG, y vuelve a insertarla. |
| La tabla sale desalineada | Tiene celdas combinadas. Sepáralas en Word (*Diseño › Dividir celdas*). |
| No pasa nada al soltar el archivo | Asegúrate de soltarlo sobre la página. Si abriste el archivo desde un .zip, descomprime la carpeta primero. |
