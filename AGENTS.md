# AGENTS.md — word.md (convertidor de Word a Markdown y creador de documentos y datos)

Guía para agentes de IA y personas que trabajen en este código. Léela completa antes de cambiar nada.

## Qué es

Una página web **estática** que convierte archivos `.docx` a Markdown **dentro del navegador**. Se abre con doble clic en `index.html` (protocolo `file://`). No hay servidor, build, framework ni instalación.

Además tiene la sección **Crear**, para que personas no técnicas escriban documentos `.md` (con secciones de datos JSON/XML dentro) y armen archivos `.json`/`.xml` con un formulario.

## Restricciones que no se negocian

1. **Sin internet.** Prohibido cargar nada remoto: ni CDN, ni Google Fonts, ni `fetch` a APIs. Todas las librerías viven en `vendor/`.
2. **Sin instalar programas.** La app no puede requerir Node, Python ni nada más para funcionar. `herramientas/` es solo para desarrollo.
3. **Debe funcionar desde `file://`.** Consecuencias:
   - No uses `fetch()` ni `import` de archivos locales (Chrome los bloquea en `file://`). Por eso la guía está escrita dentro de `index.html` y no se carga desde `GUIA.md`.
   - No uses `<script type="module">`: los módulos ES también fallan en `file://`. Usa scripts clásicos y una IIFE por archivo (`app.js`, `crear.js`); lo que comparten va en `window.wordmd`.
4. **Fuentes del sistema (Windows 11):** `Segoe UI Variable Display/Text` y `Cascadia Code`. No añadas webfonts; si hicieran falta, tendrían que ir en `vendor/` como `.woff2`.
5. **Todo en español**, tanto los textos de la interfaz como los nombres del código (`convertir`, `limpiarTablas`, `pintarResultado`…). Mantén ese estilo.

## Mapa de archivos

| Ruta | Qué contiene |
|---|---|
| `index.html` | Todo el marcado: barra, 7 vistas (`vista-inicio`, `vista-cargando`, `vista-resultado`, `vista-crear`, `vista-documento`, `vista-datos`, `vista-guia`), el aviso flotante y el `<dialog>` que usa Crear. La guía completa está escrita aquí. |
| `styles.css` | Diseño "Pop": variables en `:root` y secciones marcadas (`barra`, `inicio`, `cargando`, `resultado`, `crear`, `guía`, `pantallas pequeñas`). |
| `app.js` | El convertidor y la navegación, dentro de una IIFE. Al final expone `window.wordmd` para `crear.js`. |
| `crear.js` | La sección Crear (editor de documentos y editor de datos), en otra IIFE. Se carga después de `app.js`. |
| `vendor/` | Librerías de terceros, versiones fijas. Ver `vendor/LICENSES.md`. |
| `ejemplo/plantilla.docx` | Word de ejemplo con todos los elementos soportados. Se genera con `herramientas/generar-plantilla.js`. |
| `GUIA.md` | La misma guía de `index.html`, en Markdown, para leerla en GitHub. **Si cambias una, cambia la otra.** |
| `docs/capturas/` | Capturas usadas en el README. Si cambias el diseño, vuelve a generarlas (ver "Cómo probar"). |
| `herramientas/` | Solo para desarrollo (Node): generar los `.docx` de prueba y probar de extremo a extremo con jsdom (`probar.js` para el convertidor, `probar-crear.js` para Crear). |

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
- **Estado**: `estado.archivos` (resultados) y `estado.actual` (el que se muestra).
- **Navegación**: `mostrar(vista)` cambia de vista. Cada vista pertenece a una sección del menú (`SECCION`: `convertir`, `crear`, `guia`) y `ultimaVista` recuerda a qué vista volver en cada sección. Al cambiar de vista se lanza el evento `wordmd:vista`.
- **`nuevoTurndown()`**: crea un Turndown con todas las reglas de arriba. El convertidor usa una instancia y `crear.js` otra, con reglas extra.
- **`window.wordmd`**: lo que `crear.js` usa de aquí (`mostrar`, `aviso`, `recibir`, `descargarBlob`, `copiarTexto`, `nuevoTurndown`, `prepararCodigo`, `limpiarMarkdown`, `limpiarHtml`, `resaltar`, `escapar`, `contar`, `plural`) y `alSoltar`, que define `crear.js` para los archivos que se sueltan en la sección Crear.

## Sección Crear (`crear.js`)

```
Crear (vista-crear)
  ├─ Un documento → vista-documento   escribir con formato ⇄ Markdown; se guarda como .md
  │     └─ + Insertar › Datos en JSON/XML → sección de datos (formulario) = bloque ```json / ```xml
  └─ Datos → vista-datos               formulario ⇄ código; se guarda como .json o .xml
```

### Modelo de datos (sección 1 del archivo)

Todo lo de datos pasa por un **nodo**, que describe el dato como lo ve la persona:

| `tipo` | Forma | JSON | XML |
|---|---|---|---|
| `texto`, `numero`, `sino`, `fecha` | `{tipo, valor}` | valor | `<clave>valor</clave>` |
| `lista` | `{tipoElem, valor: [...]}` | `["a", "b"]` | `<elemento>` por cada uno |
| `tabla` | `{fila, columnas: [{etiqueta, clave, tipo}], filas: [[...]]}` | arreglo de objetos, cada fila en una línea | `<fila>` por cada fila, en una línea |
| `grupo` | `{campos: [{etiqueta, clave, nodo}]}` | objeto | etiquetas anidadas |
| `crudo` | `{valor}` | cualquier JSON que el formulario no sabe mostrar | conversión genérica |

- `etiqueta` es lo que ve la persona ("Fecha de apertura"); `clave` es lo que se escribe (`fecha_de_apertura`, con `aClave()`). Al importar se respeta la clave original y se genera una etiqueta legible (`etiquetaDe()`).
- `aJson()` / `aXml()` escriben; `leerDatos(texto, formato)` lee y lanza `ErrorDatos` (mensaje en español + `linea`) si el texto tiene errores.
- `desdeValor()` (JSON) y `elementoANodo()` (XML) adivinan el tipo de cada dato. Ojo: `<productos><producto>…</producto></productos>` se lee como tabla aunque tenga una sola fila.
- `heredarEtiquetas()` conserva las etiquetas con acentos al volver del código al formulario.
- `tablaDesdeTsv()` convierte lo copiado de Excel (tabuladores) en una tabla, adivinando números, sí/no y fechas `dd/mm/aaaa`.

### Formulario (sección 3)

`pintarRaiz(nodo, ctx)` dibuja cualquier nodo. Se usa en el editor de datos y dentro de cada sección de datos del documento. `ctx.cambio(tipo)` avisa de los cambios:
- `'valor'`: se escribió algo. **No se repinta** (para no perder el foco).
- `'fijo'`: terminó un cambio. Se guarda en el historial para deshacer.
- `'estructura'`: se agregó o quitó algo. Historial y repintar.

Para enfocar algo después de repintar, marca el objeto del modelo con `_enfocar = true`; el pintor pone `data-enfocar` y `enfocarPendiente()` lo enfoca.

### Editor de documentos (sección 5)

- Es un `contenteditable` y usa `document.execCommand` (formatBlock, bold, insertHTML…). Está obsoleto, pero es lo único que funciona sin librerías y conserva Ctrl+Z.
- **Markdown → editor**: `htmlDesdeMarkdown()` usa `marked`, limpia con `limpiarHtml` y cambia cada `pre > code.language-json|xml` válido por una sección de datos (`pintarBloque()`, con `contenteditable="false"`). Los modelos están en `doc.bloques[id]`.
- **Editor → Markdown**: `markdownDelEditor()` usa `tdDoc`, un Turndown con dos reglas extra: `bloqueDatos` (escribe el bloque desde el modelo) e `imagenDoc` (las imágenes se ven con `data:` pero se guardan como `imagenes/imagen-N.ext`; con imágenes se descarga un `.zip`).
- Las secciones de datos detienen `keydown`, `input`, `paste`… para que el editor de texto no los procese.
- Al volver de la vista Markdown, `validarSecciones()` revisa cada ```` ```json ````/```` ```xml ```` y marca la línea del error. No se puede volver hasta corregirlo.
- Lo pegado se pasa por Markdown (`turndown` → `marked`), así queda limpio y con la misma estructura.
- Atajos: `# `, `## `, `### `, `- `, `1. `, `> ` al inicio de un párrafo; Ctrl+Mayús+0…3 para el tipo de texto (Ctrl+Alt choca con AltGr en teclados en español y Ctrl+número cambia de pestaña); Ctrl+K enlace; Ctrl+M cambia de vista.

### Guardado

Documento y datos se guardan solos en `localStorage` (`wordmd.crear.documento`, `wordmd.crear.datos`) medio segundo después de cada cambio. Si no caben las imágenes, se guarda sin ellas y el indicador lo dice. Todo acceso a `localStorage` va en `try/catch`.

## Diseño

- Viene de la propuesta **C · Pop** del lienzo de Claude Design (https://claude.ai/artifact/C1ZBgXMedY5cVj1aJkdYuK).
- La sección Crear viene de las filas **E** (barra de D1, formateado ⇄ código), **F** (datos con formulario) y **G** (secciones de datos dentro del documento) del mismo lienzo.
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

`npm run probar:crear` (`probar-crear.js`) prueba la sección Crear: ida y vuelta JSON/XML, pegar desde Excel, Markdown con secciones de datos, errores con número de línea y navegación. jsdom no implementa `execCommand`, así que el formato del texto (títulos, negrita, listas) hay que probarlo en un navegador de verdad.

Revisión visual sin instalar nada, con Chrome o Edge headless:

```bash
chrome --headless=new --window-size=1440,900 --screenshot=inicio.png "file:///RUTA/index.html"
```

Chrome headless en Windows no baja de unos 500 px de ancho; para ver cómo queda en móvil usa `--window-size=500,900`.

Prueba manual final: abre `index.html` con doble clic, suelta `ejemplo/plantilla.docx` y comprueba títulos, listas anidadas, tabla, cita, bloque de código e imagen. Descarga el `.zip` y ábrelo.

Para Crear: abre la plantilla *Acta de reunión*, cambia un título con el menú amarillo, inserta una sección *Datos en XML*, pega celdas de Excel en ella, cambia a la vista Markdown y vuelve. Luego abre *Lista de productos*, agrega un campo, cambia a `.xml` y descarga.

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

- Editar el Markdown del convertidor antes de descargarlo (hoy es de solo lectura). Podría abrirse en el editor de Crear.
- Conservar las notas al pie como `[^1]` (hoy mammoth las deja como enlaces al final).
- Modo oscuro.
