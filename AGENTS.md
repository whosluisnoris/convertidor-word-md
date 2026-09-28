# AGENTS.md — word.md (convierte Word, Excel y PowerPoint; crea documentos y datos)

Guía para agentes de IA y personas que trabajen en este código. Léela completa antes de cambiar nada.

## Qué es

Una página web **estática** para personas no técnicas. Se abre con doble clic en `index.html` (protocolo `file://`). No hay servidor, build, framework ni instalación. Todo ocurre **dentro del navegador**:

- **Convertir** Word (`.docx`), Excel (`.xlsx`) y PowerPoint (`.pptx`) a Markdown (o, un Excel, a datos `.json`/`.xml`).
- **Editar** el resultado, o **crear** desde cero un documento `.md` (que puede llevar secciones de datos JSON/XML) o un archivo de datos con un formulario.
- Trabajar con **pestañas**, como en el navegador. Los documentos se guardan en `localStorage` y siguen en **Mis documentos** aunque se cierre su pestaña.
- **Analizar** un documento: revisión local sin internet y, de forma opcional, con un modelo de IA (Claude).

## Restricciones que no se negocian

1. **Sin internet.** Prohibido cargar nada remoto: ni CDN, ni Google Fonts, ni `fetch` a APIs. Todas las librerías viven en `vendor/`.
   - **Única excepción: los proveedores de análisis en línea** (`analisis.js`, p. ej. Claude). Solo se llaman cuando la persona elige ese proveedor, escribe su clave y pulsa *Analizar* con el aviso de privacidad a la vista. Nunca de forma automática, nunca al abrir la app. Cualquier proveedor nuevo con `usaInternet: true` debe seguir las mismas reglas.
2. **Sin instalar programas.** La app no puede requerir Node, Python ni nada más para funcionar. `herramientas/` es solo para desarrollo.
3. **Debe funcionar desde `file://`.** Consecuencias:
   - No uses `fetch()` ni `import` de archivos locales (Chrome los bloquea en `file://`). Por eso la guía está escrita dentro de `index.html` y no se carga desde `GUIA.md`.
   - No uses `<script type="module">`: los módulos ES también fallan en `file://`. Usa scripts clásicos y una IIFE por archivo; lo que comparten va en `window.wordmd`. Por eso tampoco se puede usar el SDK de Anthropic: la llamada a la API es un `fetch` directo.
   - `localStorage` funciona en `file://` en Chrome y Edge. Todo acceso va en `try/catch` (puede estar lleno o bloqueado).
4. **Fuentes del sistema (Windows 11):** `Segoe UI Variable Display/Text` y `Cascadia Code`. No añadas webfonts; si hicieran falta, tendrían que ir en `vendor/` como `.woff2`.
5. **Todo en español**, tanto los textos de la interfaz como los nombres del código (`convertir`, `limpiarTablas`, `pintarResultado`…). Mantén ese estilo.

## Mapa de archivos

| Ruta | Qué contiene |
|---|---|
| `index.html` | Todo el marcado: la barra (logo, pestañas, botón Guía), 5 vistas (`vista-inicio`, `vista-cargando`, `vista-documento`, `vista-datos`, `vista-guia`), el aviso flotante y tres `<dialog>` (texto/enlace, opciones, analizar). La guía completa está escrita aquí. |
| `styles.css` | Diseño "Pop": variables en `:root` y secciones marcadas (`barra`, `inicio`, `cargando`, `tarjeta azul`, `guía`, `crear`, `diálogos`, `pantallas pequeñas`). |
| `app.js` | Núcleo: conversión de Word (mammoth → Turndown) y utilidades compartidas. Crea `window.wordmd`. |
| `importar.js` | Lectores propios de Excel y PowerPoint (sobre JSZip y DOMParser). |
| `crear.js` | Modelo de datos (nodos, JSON/XML), formulario, editor de documentos y editor de datos. |
| `analisis.js` | Diálogo *Analizar* y registro de proveedores (local y Claude). |
| `pestanas.js` | Almacén de documentos, pestañas, Inicio, Mis documentos, plantillas y entrada de archivos. **Se carga el último y arranca la app.** |
| `vendor/` | Librerías de terceros, versiones fijas. Ver `vendor/LICENSES.md`. |
| `ejemplo/` | `plantilla.docx` (todos los elementos de Word; `herramientas/generar-plantilla.js`), `ventas.xlsx` y `presentacion.pptx` (`herramientas/generar-office.js`). |
| `GUIA.md` | La misma guía de `index.html`, en Markdown, para leerla en GitHub. **Si cambias una, cambia la otra.** |
| `docs/capturas/` | Capturas usadas en el README. Si cambias el diseño, vuelve a generarlas (ver "Cómo probar"). |
| `herramientas/` | Solo para desarrollo (Node): generar los archivos de ejemplo y probar con jsdom (`probar.js` convierte archivos, `probar-crear.js` prueba todo lo demás). |

Orden de carga (importa): `vendor/*` → `app.js` → `importar.js` → `crear.js` → `analisis.js` → `pestanas.js`.

## Flujo de un archivo

```
archivo(s) soltados o elegidos
  └─ pestanas.js · recibirArchivos()   clasifica por extensión; rechaza .doc/.xls/.ppt con un mensaje claro
     └─ importar()                     uno por uno, con la vista "cargando"
        ├─ .docx → W.convertirWord()        (app.js)       → documento .md + imágenes + consejos
        ├─ .pptx → W.importar.leerPowerPoint (importar.js) → documento .md + imágenes + consejos
        ├─ .xlsx → W.importar.leerExcel      (importar.js) → pregunta: ¿datos o documento?
        ├─ .md/.txt                                         → documento .md
        └─ .json/.xml → W.datos.leerDatos    (crear.js)     → datos (si tiene errores, se abre en la vista de código)
     └─ crearDocumento() por cada uno → se abren como pestañas → activar(el primero)
```

## Conversión de Word (`app.js`)

```
.docx
  1. mammoth.convertToHtml(buffer, {styleMap: MAPA_ESTILOS, convertImage})
     · cada imagen → imagenes/imagen-N.ext; los bytes se guardan en base64
  2. traducirMensajes()  avisos de mammoth → consejos en español
  3. DOMParser → limpiarTablas() + prepararCodigo()
  4. turndown.turndown()  HTML → Markdown (con reglas propias)
  5. limpiarMarkdown()    espacios, saltos de más, "# 1\." → "# 1."
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
- **`limpiarHtml()`**: quita `script`, `iframe`, atributos `on*` y enlaces `javascript:`. Se usa con todo HTML que viene de Markdown o de lo pegado.
- **`agregarAZip()`**: un documento en un `.zip`; con imágenes va en su carpeta para que las rutas relativas funcionen.
- **`nuevoTurndown()`**: crea un Turndown con todas las reglas de arriba. El convertidor, PowerPoint y el editor de documentos usan cada uno su instancia.
- **`window.wordmd`** (se va completando al cargar cada archivo):
  - `app.js`: `convertirWord`, `aviso`, `descargarBlob`, `agregarAZip`, `copiarTexto`, `nuevoTurndown`, `prepararCodigo`, `limpiarMarkdown`, `limpiarHtml`, `resaltar`, `escapar`, `contar`, `plural`.
  - `importar.js`: `importar` (`leerExcel`, `excelAMarkdown`, `leerPowerPoint`).
  - `crear.js`: `editorDoc`, `editorDatos` (`cargar(registro)`, `estado()`), `datos` (modelo y utilidades de interfaz), `indicarGuardado`, `crear` (para pruebas).
  - `analisis.js`: `analisis` (`registrar`, `proveedores`, `abrir`, `analizarLocal`).
  - `pestanas.js`: `mostrar`, `cambio`, `abrirArchivos`, `pestanas` (`activar`, `abrir`, `cerrar`, `crear`, `recibir`, `guardar`, `documentoActivo`…).

## Excel y PowerPoint (`importar.js`)

Los dos son un `.zip` con XML; se abren con JSZip y se leen con `DOMParser`, buscando por nombre local (`getElementsByTagNameNS('*', 't')`) para no depender de prefijos.

- **Excel** → `{hojas: [{nombre, filas: [[valor]]}], consejos}`.
  - Textos compartidos (`sharedStrings.xml`), booleanos, errores y texto en línea.
  - **Fechas**: Excel las guarda como número; se reconocen por el formato de la celda (`styles.xml`: `numFmtId` integrados 14–22, 45–47… o códigos propios con `d`/`y`/`h`). Soporta el sistema 1904.
  - Fórmulas: se usa el valor calculado que guarda el archivo. Se recortan filas y columnas vacías de los bordes.
  - Como datos, cada hoja es un campo tabla (`W.datos.tablaDesdeCeldas`); como documento, una tabla GFM por hoja (`excelAMarkdown`).
- **PowerPoint** → `{md, imagenes, consejos}` (misma forma que Word).
  - Orden de diapositivas: `presentation.xml` → `sldIdLst`. Dentro de cada una, primero el título y luego de arriba abajo y de izquierda a derecha (si todas las formas tienen posición).
  - **Título**: el marcador `title`/`ctrTitle`. Si no hay, el primer cuadro de texto con una sola línea corta en ≥ 24 pt o en negrita. El título de la portada es el `# título` del documento.
  - Viñetas: los marcadores de cuerpo tienen viñeta salvo `buNone`; los cuadros de texto solo con `buChar`/`buAutoNum`. `lvl` da el subnivel. Se arma HTML y se pasa por Turndown.
  - Tablas (`a:tbl`), imágenes (`p:pic` → `imagenes/imagen-N.ext`) y notas del orador (como cita). Gráficos y SmartArt dan un consejo.
- Formatos viejos (`.xls`, `.ppt`, `.doc`) son binarios: no se leen; se pide guardarlos en el formato nuevo.

## Pestañas y documentos (`pestanas.js`)

- **Almacén** en `localStorage`:
  - `wordmd.documentos`: índice `[{id, tipo: 'md'|'datos', nombre, formato, actualizado}]`.
  - `wordmd.doc.<id>`: contenido. Documento: `{md, imagenes, etiquetas, consejos}`. Datos: `{nodo, formato, raiz, codigo}`.
  - `wordmd.pestanas`: `{abiertas: [id], activa: id|'inicio'|'guia', guia: bool, anterior}`.
  - `memoria[id]` guarda lo mismo mientras la app está abierta, por si `localStorage` se llena (entonces se intenta sin imágenes: estado `parcial`).
- **Editores únicos**: hay un solo editor de documentos y uno de datos. Al cambiar de pestaña se guarda lo pendiente (`guardarPendiente`) y se carga el otro documento en el editor (`W.editorDoc.cargar` / `W.editorDatos.cargar`). Pulsar la pestaña que ya se ve no recarga (se perdería el cursor).
- **Guardado**: `crear.js` llama a `W.cambio()` en cada cambio; se guarda 500 ms después (`guardarActiva`) y también al ocultar o cerrar la página.
- **Cerrar ≠ borrar**: la × solo quita la pestaña. Borrar se hace desde *Mis documentos* (con confirmación).
- **Guía**: es una pestaña más (`'guia'`), que al cerrarse vuelve a la anterior.
- Migra lo guardado por la versión anterior (`wordmd.crear.documento` / `wordmd.crear.datos`) como documentos nuevos.

## Editores (`crear.js`)

```
vista-documento   escribir con formato ⇄ Markdown; se guarda como .md
  └─ + Insertar › Datos en JSON/XML → sección de datos (formulario) = bloque ```json / ```xml
vista-datos       formulario ⇄ código; se guarda como .json o .xml
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

### Lo que se guarda de cada editor

- `W.editorDoc.estado()` → `{nombre, md, imagenes (solo las usadas), etiquetas, consejos}`. `etiquetas` son los modelos de las secciones de datos en orden: el `.md` solo tiene claves (`fecha_de_apertura`) y así se recuperan las etiquetas con acentos al volver a abrir.
- `W.editorDatos.estado()` → `{nombre, formato, raiz, nodo, codigo}`. `codigo` solo existe si se estaba corrigiendo el código y todavía no se aplicó (puede tener errores).
- `consejos` son los de la conversión (Word, Excel, PowerPoint). Se muestran en el panel hasta que la persona los cierra.

## Analizar (`analisis.js`)

Arquitectura de **proveedores**. Cada uno es un objeto:

```js
W.analisis.registrar({
  id: 'mi-proveedor',
  nombre: 'Mi proveedor',
  descripcion: 'Qué hace, en una frase para personas no técnicas.',
  usaInternet: true,                      // true → aviso de privacidad y botón desactivado hasta tener lo necesario
  campos: [                               // ajustes que se piden en el diálogo
    { id: 'clave', etiqueta: 'Clave de API', tipo: 'password', ayuda: '…' },
    { id: 'modelo', etiqueta: 'Modelo', tipo: 'select', porDefecto: 'x', opciones: [['x', 'X']] }
  ],
  listo: function (config) { return !!config.clave; },
  analizar: function (documento, config, pregunta) {
    // documento = {tipo: 'md'|'datos', nombre: 'menu.md', formato: 'md'|'json'|'xml', texto}
    return Promise.resolve({ resumen: '…', puntos: [{ tipo: 'aviso'|'idea'|'bien', texto: '…' }], modelo: '…' });
  }
});
```

- Errores: rechaza la promesa con un `Error` cuyo mensaje sea **en español y para la persona** (el diálogo lo muestra tal cual).
- **local**: revisión de estructura sin internet (títulos, niveles, párrafos largos, imágenes sin texto alternativo, enlaces "aquí", datos vacíos o con errores).
- **claude**: `POST https://api.anthropic.com/v1/messages` con `fetch` (sin SDK: la app no tiene módulos ni empaquetador).
  - Encabezados: `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true` (necesario para llamar desde una página) y `anthropic-beta: server-side-fallback-2026-07-01`.
  - Cuerpo: `model` (por defecto `claude-opus-5-5`), `max_tokens: 16000`, `fallbacks: 'default'` (si el modelo rechaza la solicitud, Anthropic la reintenta con el modelo recomendado), `output_config: {effort: 'medium', format: {type: 'json_schema', schema}}` para recibir exactamente `{resumen, puntos}`, y el documento dentro de `<documento>` en el mensaje. El `system` pide tratarlo como material, no como instrucciones.
  - Se revisa `stop_reason` (`refusal`, `max_tokens`) antes de leer el contenido; los errores HTTP (401, 402, 403, 404, 413, 429, 5xx) y la falta de conexión tienen mensajes propios. No se recorta el documento: si pasa de ~1.5 M caracteres se avisa.
- **Clave**: se guarda en memoria; en `localStorage` (`wordmd.analisis`) solo si la persona marca *Recordar la clave*. Los demás ajustes (proveedor elegido, modelo) sí se recuerdan.

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

`npm run probar:crear` (`probar-crear.js`) prueba el resto: ida y vuelta JSON/XML, pegar desde Excel, Markdown con secciones de datos, errores con número de línea, pestañas (cambiar, cerrar, Mis documentos, guía), Excel y PowerPoint, y *Analizar* (la solicitud a Claude se simula con un `fetch` falso: **las pruebas nunca llaman a internet**).

Arreglos que necesita jsdom (y que el navegador no): `TextDecoder`, `setImmediate` (JSZip programa su trabajo con `postMessage`, que jsdom no entrega igual), un `localStorage` en memoria (jsdom no lo da en `file://`) y un `execCommand` vacío. jsdom tampoco tiene `<dialog>.showModal`, así que el Excel usa la respuesta de `confirm`. El formato del texto (títulos, negrita, listas) hay que probarlo en un navegador de verdad.

`npm run office` vuelve a generar `ejemplo/ventas.xlsx` y `ejemplo/presentacion.pptx` (con `exceljs` y `pptxgenjs`, solo para desarrollo).

Revisión visual sin instalar nada, con Chrome o Edge headless:

```bash
chrome --headless=new --window-size=1440,900 --screenshot=inicio.png "file:///RUTA/index.html"
```

Chrome headless en Windows no baja de unos 500 px de ancho; para ver cómo queda en móvil usa `--window-size=500,900`.

Prueba manual final: abre `index.html` con doble clic, suelta `ejemplo/plantilla.docx` y comprueba títulos, listas anidadas, tabla, cita, bloque de código e imagen. Descarga el `.zip` y ábrelo.

Luego suelta a la vez `ventas.xlsx` y `presentacion.pptx`: elige *Como datos* para el Excel y revisa las dos pestañas. Recarga la página: deben volver las mismas pestañas.

Para los editores: abre la plantilla *Acta de reunión*, cambia un título con el menú amarillo, inserta una sección *Datos en XML*, pega celdas de Excel en ella, cambia a la vista Markdown y vuelve. Luego abre *Lista de productos*, agrega un campo, cambia a `.xml` y descarga. Por último, *Analizar* con la revisión rápida.

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

- Probar en Chrome/Edge de Windows (se probó en Chromium sobre Linux) y regenerar `docs/capturas/` con las fuentes de Windows.
- Excel como datos no muestra sus consejos (celdas combinadas…): el editor de datos no tiene el recuadro de consejos del documento.
- Al importar JSON, un `null` se vuelve texto vacío; los atributos XML se vuelven campos.
- Otros proveedores de análisis (otro servicio en la nube, un modelo local en `http://localhost`) con `W.analisis.registrar`.
- Analizar más allá del resumen: aplicar las sugerencias al documento con un clic.
- Conservar las notas al pie como `[^1]` (hoy mammoth las deja como enlaces al final).
- Modo oscuro.
