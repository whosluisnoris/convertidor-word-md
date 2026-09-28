# AGENTS.md — word.md (convertidor de Word a Markdown)

Guía para agentes de IA y personas que trabajen en este código. Léela completa antes de cambiar nada.

## Qué es

Una página web **estática** que convierte archivos `.docx` a Markdown **dentro del navegador**. Se abre con doble clic en `index.html` (protocolo `file://`). No hay servidor, build, framework ni instalación.

## Restricciones que no se negocian

1. **Sin internet.** Prohibido cargar nada remoto: ni CDN, ni Google Fonts, ni `fetch` a APIs. Todas las librerías viven en `vendor/`.
2. **Sin instalar programas.** La app no puede requerir Node, Python ni nada más para funcionar. `herramientas/` es solo para desarrollo.
3. **Debe funcionar desde `file://`.** Consecuencias:
   - No uses `fetch()` ni `import` de archivos locales (Chrome los bloquea en `file://`). Por eso la guía está escrita dentro de `index.html` y no se carga desde `GUIA.md`.
   - No uses `<script type="module">`: los módulos ES también fallan en `file://`. Usa scripts clásicos y una IIFE.
4. **Fuentes del sistema (Windows 11):** `Segoe UI Variable Display/Text` y `Cascadia Code`. No añadas webfonts; si hicieran falta, tendrían que ir en `vendor/` como `.woff2`.
5. **Todo en español**, tanto los textos de la interfaz como los nombres del código (`convertir`, `limpiarTablas`, `pintarResultado`…). Mantén ese estilo.

## Mapa de archivos

| Ruta | Qué contiene |
|---|---|
| `index.html` | Todo el marcado: barra, 4 vistas (`vista-inicio`, `vista-cargando`, `vista-resultado`, `vista-guia`) y el aviso flotante. La guía completa está escrita aquí. |
| `styles.css` | Diseño "Pop": variables en `:root` y secciones marcadas (`barra`, `inicio`, `cargando`, `resultado`, `guía`, `pantallas pequeñas`). |
| `app.js` | Toda la lógica, dentro de una IIFE. Ver la sección siguiente. |
| `vendor/` | Librerías de terceros, versiones fijas. Ver `vendor/LICENSES.md`. |
| `ejemplo/plantilla.docx` | Word de ejemplo con todos los elementos soportados. Se genera con `herramientas/generar-plantilla.js`. |
| `GUIA.md` | La misma guía de `index.html`, en Markdown, para leerla en GitHub. **Si cambias una, cambia la otra.** |
| `herramientas/` | Solo para desarrollo (Node): generar los `.docx` de prueba y probar de extremo a extremo con jsdom. |

## Flujo de conversión (`app.js`)

```
archivo .docx
  └─ recibir()            filtra .docx y rechaza .doc u otros formatos con un mensaje claro
     └─ convertirTodos()  procesa uno por uno y cambia a la vista "cargando"
        └─ convertir()
           1. mammoth.convertToHtml(buffer, {styleMap: MAPA_ESTILOS, convertImage})
              · cada imagen → imagenes/imagen-N.ext; los bytes se guardan en base64
           2. traducirMensajes()  avisos de mammoth → consejos en español
           3. DOMParser → limpiarTablas() + prepararCodigo()
           4. turndown.turndown()  HTML → Markdown (con reglas propias)
           5. limpiarMarkdown()    espacios, saltos de más, "# 1\." → "# 1."
           6. contar()             chips: títulos, tablas, imágenes, palabras
        └─ pintarResultado()      tarjeta, lista de archivos, consejos, Markdown resaltado y vista previa
```

### Secciones importantes de `app.js`

- **`MAPA_ESTILOS`** (arriba del todo): traduce estilos de Word a HTML. Word guarda los estilos integrados con su nombre en inglés (`heading 1`, que mammoth ya entiende), pero los estilos creados por la persona usan el nombre del idioma. Por eso hay entradas en español e inglés (`Título`/`Title`, `Cita`/`Quote`, `Código`/`Code`).
  - ⚠️ **No mapees `List Paragraph`/`Párrafo de lista`.** Un mapeo explícito anula la detección de listas de mammoth y las viñetas salen como párrafos sueltos (ya pasó una vez).
- **Reglas de Turndown** (`celdaSegura`, `saltoEnCelda`, `elementoLista`, `tachado`, `anclaVacia`). `addRule` pone la regla nueva al principio, así que estas tienen prioridad sobre las del plugin GFM.
  - `elementoLista`: escribe `- item` / `1. item` (Turndown pone `-   item`) y ajusta la sangría de los subniveles al ancho del marcador.
  - `tachado`: usa `~~` (el plugin GFM pone una sola `~`).
  - `celdaSegura`: deja cada celda en una línea y escapa `|`.
- **`limpiarTablas()`**: reconstruye cada tabla como `<thead>` (primera fila) + `<tbody>`. Esto hace falta porque Word a veces marca todas las filas como encabezado, o ninguna, y GFM exige exactamente una fila de encabezado. También expande `colspan` en celdas vacías, iguala el número de columnas, junta los párrafos de una celda con `<br>` y aplana las listas que haya dentro de las celdas.
- **`prepararCodigo()`**: mammoth produce `<pre>texto</pre>`, pero Turndown solo genera un bloque con cercas (```` ``` ````) si encuentra `<pre><code>`.
- **`traducirMensajes()`**: convierte los avisos de mammoth en consejos legibles y quita los que no aportan nada. Para añadir un consejo nuevo, agrégalo aquí o en `convertir()` (ahí están los consejos de celdas combinadas, imágenes EMF/TIFF y documento sin títulos).
- **`resaltar()` / `enLinea()`**: resaltado de sintaxis ligero, línea por línea. Las clases `.h .b .l .t .i .c .q .k` están en `styles.css` (sección `.codigo`).
- **`vistaPrevia()`**: `marked` + limpieza básica (quita `script`, `iframe` y atributos `on*`), y cambia `imagenes/…` por un `data:` URI para que la vista previa muestre las imágenes.
- **Descargas**:
  - Sin imágenes se descarga un `.md`. Con imágenes, un `.zip` con `nombre.md` + `imagenes/`.
  - "Descargar todos" pone cada documento que tiene imágenes en su propia carpeta, para que las rutas relativas sigan funcionando.
- **Estado**: `estado.archivos` (resultados) y `estado.actual` (el que se muestra). `mostrar(vista)` cambia de vista; `vistaConversion` recuerda a qué vista volver al salir de la guía.

## Diseño

- Viene de la propuesta **C · Pop** del lienzo de Claude Design (https://claude.ai/artifact/C1ZBgXMedY5cVj1aJkdYuK).
- Paleta (variables en `:root`):
  - `--azul #2F4BFF`, `--amarillo #FFD23F`, `--coral #FF5C5C`
  - `--tinta #16161D`, `--fondo #F4F3EE`
- Radios: 36 px para los bloques grandes y 24 px para los medianos.
- En la vista de resultado, el texto coral usa `--coral-texto` (más oscuro) para que tenga contraste suficiente.
- Por debajo de 980 px todo pasa a una sola columna, y el resultado usa pestañas (Markdown / Vista previa).
- Se respeta `prefers-reduced-motion`.

## Cómo probar

Requiere Node, pero solo para desarrollar:

```bash
cd herramientas
npm install
npm run probar        # convierte ejemplo/plantilla.docx e imprime el Markdown
npm run probar:todo   # Word desordenado + plantilla + un .txt: comprueba consejos, varios archivos y rechazo
npm run plantilla     # vuelve a generar ejemplo/plantilla.docx
```

`probar.js` carga `index.html` en jsdom con los scripts reales y simula soltar los archivos. Le añade `TextDecoder` a jsdom porque mammoth lo necesita.

Revisión visual sin instalar nada, con Chrome o Edge headless:

```bash
chrome --headless=new --window-size=1440,900 --screenshot=inicio.png "file:///RUTA/index.html"
```

Chrome headless en Windows no baja de unos 500 px de ancho; para ver cómo queda en móvil usa `--window-size=500,900`.

Prueba manual final: abre `index.html` con doble clic, suelta `ejemplo/plantilla.docx` y comprueba títulos, listas anidadas, tabla, cita, bloque de código e imagen. Descarga el `.zip` y ábrelo.

## Actualizar librerías de `vendor/`

Descárgalas **una vez** desde jsDelivr y guárdalas en `vendor/`; nunca las enlaces desde la página. Versiones actuales:

| Archivo | Librería |
|---|---|
| `mammoth.browser.min.js` | mammoth 1.8.0 |
| `turndown.js` | turndown 7.2.0 |
| `turndown-plugin-gfm.js` | turndown-plugin-gfm 1.0.2 |
| `marked.min.js` | marked 12.0.2 |
| `jszip.min.js` | jszip 3.10.1 |

Después de actualizar, ejecuta `npm run probar:todo` y compara la salida.

## Ideas pendientes

- Editar el Markdown antes de descargarlo (hoy es de solo lectura).
- Conservar las notas al pie como `[^1]` (hoy mammoth las deja como enlaces al final).
- Modo oscuro.
