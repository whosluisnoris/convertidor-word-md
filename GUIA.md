# Guía de word.md

Convierte un Word, un Excel o un PowerPoint, escribe un documento o arma un archivo de datos. Cada cosa se abre en su pestaña, como en el navegador, y todo se guarda solo en tu computadora.

Markdown solo entiende estructura: títulos, listas, tablas, énfasis. Si tu Word usa los estilos correctos, el resultado queda perfecto a la primera.

> Esta guía también está dentro de la app, en la pestaña **Guía**.

## 1. Convertir un archivo

1. Abre `index.html` con doble clic. Se abre en tu navegador (Chrome o Edge).
2. En **Inicio**, arrastra uno o varios archivos a la zona blanca, o pulsa **Elegir archivos**. Sirven **Word** (`.docx`), **Excel** (`.xlsx`) y **PowerPoint** (`.pptx`).
3. Cada archivo se abre en su **pestaña**, listo para corregir: cambia títulos, borra o agrega lo que quieras. Si aparecen consejos amarillos, léelos: te dicen qué revisar.
4. Con un **Excel**, la app pregunta si lo quieres **como datos** (`.json`/`.xml`) o **como tabla en un documento** (`.md`). Cada hoja se vuelve una tabla; las fórmulas quedan con su resultado.
5. Con un **PowerPoint**, cada diapositiva se vuelve una sección con su título, sus viñetas, tablas, imágenes y notas del orador. El diseño y las animaciones se pierden.
6. Pulsa **Descargar**:
   - Si el documento no tiene imágenes, recibes un archivo `.md`.
   - Si tiene imágenes, recibes un `.zip` con el `.md` y una carpeta `imagenes/`. Descomprímelo y mantén ambos juntos.
   - Si tienes varias pestañas abiertas, el botón **+** › **Descargar todas las pestañas** las junta en un `.zip`.

Los formatos antiguos (`.doc`, `.xls`, `.ppt`) no se pueden leer: ábrelos en Office y usa *Guardar como* con el formato nuevo.

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

## 5. Crear documentos y datos

En el **Inicio** eliges entre **Un documento** (`.md`) o **Datos** (`.json` o `.xml`). También hay plantillas y un botón para abrir un `.md`, `.json` o `.xml` que ya tengas.

### Un documento (.md)

1. Escribe como en Word.
2. Elige el tipo de texto en el botón amarillo (*Párrafo*, *Título 1*, *Cita*…) o escribe `#` y un espacio al inicio de una línea.
3. Con **+ Insertar** agregas tablas, imágenes y **secciones de datos** en JSON o XML. Se llenan como un formulario y en el `.md` quedan como un bloque ```` ```json ```` o ```` ```xml ````.
4. El botón **Markdown** muestra el texto tal cual se guarda. Puedes corregirlo ahí y volver a **Formateado** (Ctrl+M).
5. **Descargar solo los datos** guarda las secciones de datos como archivos aparte.

### Datos (.json o .xml)

1. Pulsa **+ Agregar campo** y elige qué quieres guardar. Ponle el nombre que quieras: la app escribe el nombre técnico por ti ("Fecha de apertura" → `fecha_de_apertura`).
2. Para muchas filas usa una **Tabla**. Puedes pegar celdas copiadas de Excel directamente en ella, o usar **Pegar desde Excel**.
3. Elige **.json** o **.xml** en *Guardar como* y pulsa **Descargar**.

| Tipo de campo | Para qué sirve | En JSON | En XML |
|---|---|---|---|
| **Texto** | Nombres, direcciones, notas | `"nombre": "Ana"` | `<nombre>Ana</nombre>` |
| **Número** | Precios, cantidades | `"precio": 35` | `<precio>35</precio>` |
| **Sí / No** | Algo que se cumple o no | `"activo": true` | `<activo>true</activo>` |
| **Fecha** | Un día del calendario | `"fecha": "2026-09-28"` | `<fecha>2026-09-28</fecha>` |
| **Lista** | Varias palabras | `["Wifi", "Terraza"]` | un `<elemento>` por cada una |
| **Tabla** | Filas con las mismas columnas | `[{ … }, { … }]` | una etiqueta por fila |
| **Grupo** | Varios campos juntos | `{ … }` | etiquetas dentro de otra |

Lo que escribes se guarda solo en este navegador, en tu computadora. Si corriges el código a mano y tiene un error, la app te marca la línea antes de volver al formulario.

### Pestañas y Mis documentos

- **Inicio** siempre está a la izquierda: desde ahí conviertes, creas o abres algo.
- El botón amarillo **+** abre algo nuevo en otra pestaña.
- La **×** cierra la pestaña, pero el documento **no se borra**: sigue en **Mis documentos**, en el Inicio. Borrar solo se hace desde ahí.
- Al volver a abrir la app aparecen las mismas pestañas que tenías.

### Analizar un documento

El botón **Analizar** (en el panel derecho) revisa el documento de la pestaña:

- **Revisión rápida** funciona sin internet: avisa si faltan títulos, si se salta un nivel, si hay imágenes sin descripción o datos vacíos.
- **Claude (Anthropic)** escribe un resumen y sugerencias con inteligencia artificial. Es opcional: **usa internet** y necesita tu clave de API de Anthropic (el uso se cobra en tu cuenta). Antes de enviar, la app te dice qué documento sale de tu computadora. No lo uses con información confidencial. La clave no se guarda, salvo que marques *Recordar la clave en este navegador*.

## 6. Archivos de ejemplo

En la carpeta `ejemplo/` hay un archivo de cada tipo para probar: `plantilla.docx`, `ventas.xlsx` (dos hojas, con fechas, sí/no, una fórmula y una celda combinada) y `presentacion.pptx` (portada, viñetas, tabla, imagen y notas).

`ejemplo/plantilla.docx` usa todos los elementos soportados del Word. Úsala así:

- **Para aprender:** conviértela y compara el Word con el Markdown.
- **Como base:** ábrela en Word, borra el contenido y escribe el tuyo. Los estilos *Cita* y *Código* ya están creados.

## 7. Problemas frecuentes

| Problema | Solución |
|---|---|
| "No se pudo leer el archivo" | El archivo tiene contraseña o está dañado. Ábrelo en Word, quita la protección y usa *Guardar como .docx*. |
| Los títulos salen como texto normal | No tienen estilo de título. Aplícales *Título 1*, *Título 2*… |
| Las viñetas salen como párrafos | Se escribieron a mano. Usa el botón de viñetas. |
| Una imagen no se ve en la vista previa | Está en formato EMF/WMF/TIFF. En Word: clic derecho › *Guardar como imagen* › PNG, y vuelve a insertarla. |
| La tabla sale desalineada | Tiene celdas combinadas. Sepáralas en Word (*Diseño › Dividir celdas*). |
| No pasa nada al soltar el archivo | Asegúrate de soltarlo sobre la página. Si abriste el archivo desde un .zip, descomprime la carpeta primero. |
| No puedo volver al formulario desde el código | El JSON o XML tiene un error. Corrige la línea marcada en rojo (suele faltar una coma, unas comillas o una etiqueta de cierre). |
| Mi documento de Crear desapareció | Se guarda en el navegador. Si borraste los datos de navegación o usas otro navegador, no estará. Descarga el archivo para tener una copia. |
