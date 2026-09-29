// Pruebas de la sección "Crear": carga index.html en jsdom con los scripts reales y
// comprueba el paso formulario ⇄ JSON/XML y documento ⇄ Markdown con secciones de datos.
//
//   node probar-crear.js
const { JSDOM, VirtualConsole } = require('jsdom');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const raiz = path.resolve(__dirname, '..');
const consola = new VirtualConsole();
const erroresApp = [];
consola.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) erroresApp.push(e.message); });
consola.on('error', (e) => erroresApp.push(String(e)));

let pasadas = 0;
// Los objetos de la página vienen de otro "realm": se comparan como JSON.
const igual = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
async function prueba(nombre, fn) {
  try {
    await fn();
    pasadas++;
    console.log('  ✓ ' + nombre);
  } catch (e) {
    console.error('  ✗ ' + nombre + '\n' + (e.stack || e));
    process.exitCode = 1;
  }
}

JSDOM.fromFile(path.join(raiz, 'index.html'), {
  runScripts: 'dangerously',
  resources: 'usable',
  virtualConsole: consola,
  beforeParse(w) {
    w.TextDecoder = TextDecoder;
    w.TextEncoder = TextEncoder;
    w.scrollTo = () => {};
    w.confirm = () => true;
    // jsdom no implementa execCommand (lo usa el editor en el navegador).
    w.document.execCommand = () => false;
    // JSZip programa su trabajo con postMessage, que jsdom no entrega como un navegador.
    w.setImmediate = (f, ...a) => setTimeout(() => f(...a), 0);
    // jsdom no tiene localStorage en páginas file:// (Chrome y Edge sí): uno en memoria.
    const guardado = new Map();
    Object.defineProperty(w, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
        setItem: (k, v) => guardado.set(k, String(v)),
        removeItem: (k) => guardado.delete(k)
      }
    });
  }
}).then((dom) => {
  dom.window.addEventListener('load', async () => {
    const w = dom.window;
    const d = w.document;
    const C = w.wordmd.crear;

    console.log('Modelo de datos');
    await prueba('JSON → formulario → JSON conserva los datos', () => {
      const json = '{\n  "nombre": "Café La Esquina",\n  "abierto": true,\n  "apertura": "2019-03-15",\n  "precio_medio": 42.5,\n' +
        '  "servicios": ["Wifi", "Terraza"],\n  "productos": [\n    { "nombre": "Capuchino", "precio": 48, "disponible": true },\n' +
        '    { "nombre": "Pan", "precio": 30, "disponible": false }\n  ],\n  "direccion": {\n    "calle": "Roma 12",\n    "cp": "06700"\n  }\n}';
      const r = C.leerDatos(json, 'json');
      assert.strictEqual(r.nodo.tipo, 'grupo');
      const tipos = r.nodo.campos.map((c) => c.nodo.tipo).join(',');
      assert.strictEqual(tipos, 'texto,sino,fecha,numero,lista,tabla,grupo');
      assert.strictEqual(C.aJson(r.nodo), json);
    });
    await prueba('Las etiquetas se ven bonitas y las claves se respetan', () => {
      const r = C.leerDatos('{"precio_medio": 1, "firstName": "a"}', 'json');
      igual(r.nodo.campos.map((c) => c.etiqueta), ['Precio medio', 'firstName']);
      assert.strictEqual(C.aJson(r.nodo), '{\n  "precio_medio": 1,\n  "firstName": "a"\n}');
      assert.strictEqual(C.aClave('Fecha de apertura'), 'fecha_de_apertura');
      assert.strictEqual(C.aClave('Teléfono (casa)'), 'telefono_casa');
    });
    await prueba('Formas raras quedan como JSON editable (sin perder datos)', () => {
      const json = '[1, "dos", {"tres": [3]}]';
      const r = C.leerDatos(json, 'json');
      assert.strictEqual(r.nodo.tipo, 'crudo');
      igual(JSON.parse(C.aJson(r.nodo)), JSON.parse(json));
    });
    await prueba('Error de JSON dice la línea', () => {
      try {
        C.leerDatos('{\n  "a": 1\n  "b": 2\n}', 'json');
        assert.fail('debió fallar');
      } catch (e) {
        assert.ok(e instanceof C.ErrorDatos, 'es ErrorDatos');
        assert.strictEqual(e.linea, 3);
      }
    });
    await prueba('XML → formulario → XML conserva los datos', () => {
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<tienda>\n  <nombre>Café &amp; Pan</nombre>\n  <abierto>true</abierto>\n' +
        '  <servicios>\n    <elemento>Wifi</elemento>\n    <elemento>Terraza</elemento>\n  </servicios>\n  <productos>\n' +
        '    <producto><nombre>Capuchino</nombre><precio>48</precio><disponible>true</disponible></producto>\n  </productos>\n</tienda>';
      const r = C.leerDatos(xml, 'xml');
      assert.strictEqual(r.nombre, 'tienda');
      assert.strictEqual(r.nodo.campos[3].nodo.tipo, 'tabla', 'un solo <producto> dentro de <productos> es tabla');
      assert.strictEqual(r.nodo.campos[3].nodo.fila, 'producto');
      assert.strictEqual(C.aXmlDocumento(r.nodo, r.nombre), xml);
    });
    await prueba('JSON ⇄ XML con el mismo formulario', () => {
      const r = C.leerDatos('{"productos": [{"nombre": "Té", "precio": 20}]}', 'json');
      const xml = C.aXmlDocumento(r.nodo, 'datos');
      assert.ok(xml.includes('<elemento><nombre>Té</nombre><precio>20</precio></elemento>'), xml);
      const vuelta = C.leerDatos(xml, 'xml');
      igual(C.aValor(vuelta.nodo), { productos: [{ nombre: 'Té', precio: 20 }] });
    });
    await prueba('Los nombres de campo sirven como etiquetas XML', () => {
      assert.strictEqual(C.nombreXml('1 año'), '_1_ano');
      assert.strictEqual(C.nombreXml('precio'), 'precio');
    });
    await prueba('Error de XML se detecta', () => {
      assert.throws(() => C.leerDatos('<a><b>1</a>', 'xml'), (e) => e instanceof C.ErrorDatos);
    });
    await prueba('Pegar desde Excel adivina los tipos de columna', () => {
      const t = C.tablaDesdeTsv('Nombre\tPrecio\tDisponible\tDesde\r\nCafé\t$1,234.50\tsí\t15/03/2019\r\n"Té ""verde"""\t30\tno\t01/01/2020\r\n');
      igual(t.columnas.map((c) => c.tipo), ['texto', 'numero', 'sino', 'fecha']);
      igual(t.filas[0], ['Café', 1234.5, true, '2019-03-15']);
      assert.strictEqual(t.filas[1][0], 'Té "verde"');
    });
    await prueba('Heredar etiquetas al volver del código', () => {
      const viejo = C.leerDatos('{"telefono": "1"}', 'json').nodo;
      viejo.campos[0].etiqueta = 'Teléfono';
      const nuevo = C.leerDatos('{"telefono": "2", "correo": "x"}', 'json').nodo;
      C.heredarEtiquetas(nuevo, viejo);
      igual(nuevo.campos.map((c) => c.etiqueta), ['Teléfono', 'Correo']);
    });

    console.log('Documento con secciones de datos');
    const md = '# Menú de otoño\n\nProductos de **temporada**.\n\n## Productos\n\n```json\n[\n  { "nombre": "Latte", "precio": 58, "disponible": true },\n' +
      '  { "nombre": "Pan de muerto", "precio": 32, "disponible": false }\n]\n```\n\nPrecios con IVA.\n\n```xml\n<menu>\n  <bebida>Café</bebida>\n</menu>\n```\n\n```js\nconsole.log(1)\n```\n';
    await prueba('Markdown → editor: las secciones ```json/```xml se vuelven formularios', () => {
      C.cargarDocumento(md, { nombre: 'menu' });
      const bloques = d.querySelectorAll('#doc-editor .bloque-datos');
      assert.strictEqual(bloques.length, 2);
      assert.strictEqual(bloques[0].querySelectorAll('.tabla-datos tbody tr').length, 2);
      assert.strictEqual(d.querySelectorAll('#doc-editor pre code').length, 1, 'el bloque js sigue siendo código');
    });
    await prueba('Editor → Markdown da el mismo texto', () => {
      assert.strictEqual(C.markdownDelEditor(), md);
    });
    await prueba('Editar una celda cambia el Markdown', () => {
      const celda = d.querySelector('#doc-editor .bloque-datos .entrada-celda');
      celda.value = 'Latte de calabaza';
      celda.dispatchEvent(new w.Event('input', { bubbles: true }));
      assert.ok(C.markdownDelEditor().includes('"nombre": "Latte de calabaza"'));
    });
    await prueba('Cambiar una sección a XML', () => {
      const boton = [...d.querySelectorAll('#doc-editor .bloque-datos .interruptor button')].find((b) => b.textContent === 'XML');
      boton.click();
      const texto = C.markdownDelEditor();
      assert.ok(texto.includes('```xml\n<datos>\n  <elemento><nombre>Latte de calabaza</nombre><precio>58</precio><disponible>true</disponible></elemento>'), texto);
    });
    await prueba('Vista Markdown con error: se marca la línea y no se pierde nada', () => {
      C.verVistaDoc('codigo');
      const area = d.querySelector('#doc-codigo textarea');
      area.value = '# Hola\n\n```json\n{ "a": 1,, }\n```\n';
      area.dispatchEvent(new w.Event('input', { bubbles: true }));
      C.verVistaDoc('formateado');
      assert.ok(!d.getElementById('doc-codigo').hidden, 'sigue en la vista de código');
      assert.ok(/línea 4/.test(d.getElementById('doc-error').textContent), d.getElementById('doc-error').textContent);
      assert.ok(d.querySelector('#doc-codigo .linea-mala'), 'hay una línea marcada');
      area.value = '# Hola\n\n```json\n{ "a": 1 }\n```\n';
      area.dispatchEvent(new w.Event('input', { bubbles: true }));
      C.verVistaDoc('formateado');
      assert.ok(d.getElementById('doc-codigo').hidden);
      assert.strictEqual(d.querySelectorAll('#doc-editor .bloque-datos').length, 1);
      assert.strictEqual(C.markdownDelEditor(), '# Hola\n\n```json\n{\n  "a": 1\n}\n```\n');
    });
    await prueba('Chips del documento', () => {
      assert.ok(/1 sección de datos/.test(d.getElementById('doc-chips').textContent), d.getElementById('doc-chips').textContent);
      assert.ok(!d.getElementById('doc-datos').hidden);
    });

    await prueba('Tablas del texto: agregar y quitar filas y columnas', () => {
      C.cargarDocumento('| Nombre | Precio |\n| :--- | ---: |\n| Café | 30 |\n| Té | 25 |', { nombre: 'tabla' });
      const enCelda = (texto) => {
        const celda = [...d.querySelectorAll('#doc-editor td, #doc-editor th')].find((c) => c.textContent === texto);
        const r = d.createRange();
        r.setStart(celda, 0);
        C.estado.doc.rango = r;
      };
      enCelda('Nombre');
      C.accionTabla('col-derecha');
      enCelda('Café');
      C.accionTabla('fila-abajo');
      enCelda('Té');
      C.accionTabla('fila-arriba');
      assert.strictEqual(C.markdownDelEditor(),
        '| Nombre | Columna 3 | Precio |\n| :-- | :-- | --: |\n| Café |  | 30 |\n|  |  |  |\n|  |  |  |\n| Té |  | 25 |\n');
      enCelda('Café');
      C.accionTabla('quitar-fila');
      enCelda('Columna 3');
      C.accionTabla('quitar-col');
      assert.strictEqual(C.markdownDelEditor(), '| Nombre | Precio |\n| :-- | --: |\n|  |  |\n|  |  |\n| Té | 25 |\n');
      enCelda('Té');
      C.accionTabla('quitar-tabla');
      assert.strictEqual(d.querySelectorAll('#doc-editor table').length, 0);
    });

    console.log('Editor de datos');
    await prueba('Plantilla de productos pinta el formulario', () => {
      d.querySelector('[data-plantilla="productos"]').click();
      assert.ok(!d.getElementById('vista-datos').hidden);
      assert.strictEqual(d.querySelectorAll('#datos-form .campo').length, 5);
      assert.ok(/5 campos/.test(d.getElementById('datos-chips').textContent));
    });
    await prueba('Agregar un campo desde el menú', () => {
      d.querySelector('#datos-form .btn-punteado.campo-ancho').click();
      const opcion = [...d.querySelectorAll('.menu .menu-item')].find((b) => /Fecha/.test(b.textContent));
      opcion.click();
      assert.strictEqual(d.querySelectorAll('#datos-form .campos-raiz > .campo').length, 6);
      assert.ok(C.textoDatos().includes('"fecha": "'));
    });
    await prueba('Interruptor Sí/No cambia el valor', () => {
      const sino = d.querySelector('#datos-form .campo .sino');
      assert.strictEqual(sino.getAttribute('aria-checked'), 'true');
      sino.click();
      assert.ok(C.textoDatos().includes('"abierto_hoy": false'));
    });
    await prueba('Formulario ⇄ código JSON ⇄ XML', () => {
      C.verVistaDatos('codigo');
      const area = d.querySelector('#datos-codigo textarea');
      assert.ok(area.value.startsWith('{\n  "nombre": "Café La Esquina"'));
      C.cambiarFormatoDatos('xml');
      assert.ok(area.value.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<tienda>'), area.value.slice(0, 80));
      assert.ok(area.value.includes('<producto><nombre>Café americano</nombre><precio>35</precio><disponible>true</disponible></producto>'));
      area.value = area.value.replace('Café americano', 'Café de olla');
      area.dispatchEvent(new w.Event('input', { bubbles: true }));
      C.verVistaDatos('formulario');
      assert.ok(!d.getElementById('datos-hoja').hidden);
      assert.strictEqual(d.querySelector('#datos-form .entrada-celda').value, 'Café de olla');
      assert.strictEqual(d.querySelectorAll('#datos-form .campo-nombre')[1].value, 'Teléfono', 'conserva la etiqueta con acento');
    });
    await prueba('Abrir un JSON con error lo deja en la vista de código', () => {
      C.cargarDatosTexto('{\n  "a": [1, 2\n}', 'json', 'roto');
      assert.ok(!d.getElementById('datos-codigo').hidden);
      assert.ok(/línea 3/.test(d.getElementById('datos-error').textContent), d.getElementById('datos-error').textContent);
    });

    const W = w.wordmd, P = W.pestanas;
    const archivo = (f) => new w.File([fs.readFileSync(path.join(raiz, 'ejemplo', f))], f);

    console.log('Pestañas');
    let id1;
    await prueba('Cada documento en su pestaña; cambiar de pestaña conserva lo escrito', () => {
      d.getElementById('crear-documento').click();
      id1 = P.estado().activa;
      C.cargarDocumento('# Primero\n\nHola.\n', { nombre: 'primero' });
      W.cambio();
      P.guardar();
      d.getElementById('crear-datos').click();
      const id2 = P.estado().activa;
      assert.notStrictEqual(id1, id2);
      assert.ok(!d.getElementById('vista-datos').hidden);
      P.activar(id1);
      assert.ok(!d.getElementById('vista-documento').hidden);
      assert.strictEqual(C.markdownDelEditor(), '# Primero\n\nHola.\n');
      assert.strictEqual(d.querySelector('#pestanas .pestana.activa .pestana-nombre').textContent, 'primero.md');
      assert.ok(JSON.parse(w.localStorage.getItem('wordmd.doc.' + id1)).md.includes('Primero'), 'se guarda en localStorage');
    });
    await prueba('Cerrar la pestaña no borra el documento: sigue en Mis documentos', () => {
      d.querySelector('#pestanas .pestana.activa .pestana-cerrar').click();
      assert.ok(P.estado().abiertas.indexOf(id1) < 0);
      P.activar('inicio');
      const fila = [...d.querySelectorAll('#lista-documentos .doc-fila')].find((f) => f.textContent.includes('primero.md'));
      assert.ok(fila, 'aparece en Mis documentos');
      assert.ok(!fila.querySelector('.doc-abierto'), 'ya no dice Abierto');
      fila.querySelector('.doc-abrir').click();
      assert.strictEqual(P.estado().activa, id1);
      assert.strictEqual(C.markdownDelEditor(), '# Primero\n\nHola.\n');
    });
    await prueba('La guía se abre como pestaña y se cierra', () => {
      d.getElementById('abrir-guia').click();
      assert.ok(!d.getElementById('vista-guia').hidden);
      assert.ok(d.getElementById('abrir-guia').hidden, 'el botón se oculta mientras la pestaña existe');
      d.querySelector('#pestanas .pestana[data-id="guia"] .pestana-cerrar').click();
      assert.ok(!P.estado().guia);
      assert.ok(!d.getElementById('vista-documento').hidden, 'vuelve a la pestaña anterior');
    });
    await prueba('El logo lleva al Inicio', () => {
      d.getElementById('logo').click();
      assert.ok(!d.getElementById('vista-inicio').hidden);
      assert.strictEqual(d.querySelector('#pestanas .pestana-inicio').getAttribute('aria-current'), 'page');
    });

    console.log('Excel y PowerPoint');
    await prueba('Excel como datos: una tabla por hoja, con números, fechas y sí/no', async () => {
      w.confirm = () => true; // "¿Cómo quieres usarlo?" → Como datos
      await P.recibir([archivo('ventas.xlsx')]);
      const v = W.datos.aValor(W.editorDatos.estado().nodo);
      igual(v.ventas[1], { producto: 'Capuchino', precio: 48.5, disponible: true, desde: '2024-03-01', total: 485 });
      assert.strictEqual(v.clientes.length, 3);
    });
    await prueba('Excel como documento: una tabla Markdown por hoja', async () => {
      w.confirm = () => false; // → Como tabla en un documento
      await P.recibir([archivo('ventas.xlsx')]);
      const e = W.editorDoc.estado();
      assert.ok(e.md.includes('| Capuchino | 48.5 | Sí | 2024-03-01 | 485 |'), e.md);
      assert.ok(e.consejos.some((c) => /celdas combinadas/.test(c)));
      w.confirm = () => true;
    });
    await prueba('PowerPoint: títulos, viñetas con subniveles, tabla, imagen y notas', async () => {
      await P.recibir([archivo('presentacion.pptx')]);
      const e = W.editorDoc.estado();
      assert.ok(e.md.startsWith('# Informe trimestral\n'), e.md.slice(0, 60));
      assert.ok(e.md.includes('## Resultados\n\n- **Ventas: +12 %**\n  - Norte: 1.2 M'), e.md);
      assert.ok(e.md.includes('> **Notas:** Recordar mencionar la oficina nueva de Mérida.'));
      assert.ok(e.md.includes('| Norte | 1.2 M |'));
      assert.ok(e.md.includes('![Foto de la oficina](imagenes/imagen-1.png)'));
      assert.ok(e.imagenes['imagenes/imagen-1.png'], 'la imagen viaja con el documento');
    });
    await prueba('Archivos viejos (.doc, .xls, .ppt) se rechazan con un mensaje claro', async () => {
      await P.recibir([new w.File(['x'], 'viejo.ppt')]);
      assert.ok(!d.getElementById('vista-inicio').hidden);
      assert.ok(/\.pptx/.test(d.getElementById('error-inicio').textContent));
    });

    console.log('Analizar');
    await prueba('Revisión local: título principal, niveles, imágenes y datos vacíos', async () => {
      const r = await W.analisis.analizarLocal({ tipo: 'md', nombre: 'x.md', formato: 'md', texto: '## Sin principal\n\n#### Salto\n\n![](imagenes/a.png)\n\n```json\n{"a": ""}\n```\n' });
      assert.ok(r.puntos.some((p) => /título principal/.test(p.texto)));
      assert.ok(r.puntos.some((p) => /salta un nivel/.test(p.texto)));
      assert.ok(r.puntos.some((p) => /texto alternativo/.test(p.texto)));
      assert.ok(r.puntos.some((p) => /dato vacío/.test(p.texto)));
    });
    const claude = W.analisis.proveedores().find((p) => p.id === 'claude');
    const docPrueba = { tipo: 'md', nombre: 'menu.md', formato: 'md', texto: '# Menú\n\nCafé: 35' };
    await prueba('Claude: la solicitud lleva la clave, el modelo, el esquema y el documento', async () => {
      let pedido;
      w.fetch = async (url, op) => {
        pedido = { url, op };
        return { ok: true, status: 200, json: async () => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ resumen: 'Un menú.', puntos: [{ tipo: 'bien', texto: 'Es claro.' }] }) }] }) };
      };
      const r = await claude.analizar(docPrueba, { clave: ' sk-ant-prueba ', modelo: 'claude-opus-5-5' }, '¿Faltan precios?');
      assert.strictEqual(pedido.url, 'https://api.anthropic.com/v1/messages');
      const h = pedido.op.headers;
      assert.strictEqual(h['x-api-key'], 'sk-ant-prueba');
      assert.strictEqual(h['anthropic-version'], '2023-06-01');
      assert.strictEqual(h['anthropic-dangerous-direct-browser-access'], 'true');
      const b = JSON.parse(pedido.op.body);
      assert.strictEqual(b.model, 'claude-opus-5-5');
      assert.strictEqual(b.fallbacks, 'default');
      assert.strictEqual(b.output_config.format.type, 'json_schema');
      assert.ok(b.messages[0].content.includes('Café: 35') && b.messages[0].content.includes('¿Faltan precios?'));
      assert.strictEqual(r.resumen, 'Un menú.');
    });
    await prueba('Claude: errores en español (clave, sin conexión, rechazo)', async () => {
      const conf = { clave: 'x', modelo: 'claude-opus-5-5' };
      w.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
      await assert.rejects(claude.analizar(docPrueba, conf, ''), /clave de API no es válida/);
      w.fetch = async () => { throw new TypeError('Failed to fetch'); };
      await assert.rejects(claude.analizar(docPrueba, conf, ''), /No se pudo conectar/);
      w.fetch = async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'refusal', content: [] }) });
      await assert.rejects(claude.analizar(docPrueba, conf, ''), /no quiso/);
    });
    await prueba('Sin clave no se puede enviar nada; con clave se avisa qué sale a internet', () => {
      let llamadas = 0;
      w.fetch = async () => { llamadas++; };
      P.activar(id1);
      W.analisis.abrir();
      d.getElementById('analisis-p-claude').checked = true;
      d.getElementById('analisis-p-claude').dispatchEvent(new w.Event('change'));
      assert.ok(d.getElementById('analisis-ir').disabled, 'Analizar desactivado sin clave');
      const clave = d.getElementById('analisis-c-claude-clave');
      clave.value = 'sk-ant-x';
      clave.dispatchEvent(new w.Event('input'));
      assert.ok(!d.getElementById('analisis-ir').disabled);
      assert.ok(/primero\.md/.test(d.getElementById('analisis-privacidad').textContent));
      assert.strictEqual(w.localStorage.getItem('wordmd.analisis').includes('sk-ant-x'), false, 'la clave no se guarda si no se pide');
      assert.strictEqual(llamadas, 0);
    });

    if (erroresApp.length) {
      console.error('Errores en la app:\n' + erroresApp.join('\n'));
      process.exitCode = 1;
    }
    console.log('\n' + pasadas + ' pruebas pasadas' + (process.exitCode ? ' (con fallos)' : ''));
    setTimeout(() => process.exit(process.exitCode || 0), 50);
  });
});
