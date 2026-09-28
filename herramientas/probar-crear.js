// Pruebas de la sección "Crear": carga index.html en jsdom con los scripts reales y
// comprueba el paso formulario ⇄ JSON/XML y documento ⇄ Markdown con secciones de datos.
//
//   node probar-crear.js
const { JSDOM, VirtualConsole } = require('jsdom');
const assert = require('assert');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const consola = new VirtualConsole();
const erroresApp = [];
consola.on('jsdomError', (e) => { if (!/Not implemented/.test(e.message)) erroresApp.push(e.message); });
consola.on('error', (e) => erroresApp.push(String(e)));

let pasadas = 0;
// Los objetos de la página vienen de otro "realm": se comparan como JSON.
const igual = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
function prueba(nombre, fn) {
  try {
    fn();
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
  }
}).then((dom) => {
  dom.window.addEventListener('load', () => {
    const w = dom.window;
    const d = w.document;
    const C = w.wordmd.crear;

    console.log('Modelo de datos');
    prueba('JSON → formulario → JSON conserva los datos', () => {
      const json = '{\n  "nombre": "Café La Esquina",\n  "abierto": true,\n  "apertura": "2019-03-15",\n  "precio_medio": 42.5,\n' +
        '  "servicios": ["Wifi", "Terraza"],\n  "productos": [\n    { "nombre": "Capuchino", "precio": 48, "disponible": true },\n' +
        '    { "nombre": "Pan", "precio": 30, "disponible": false }\n  ],\n  "direccion": {\n    "calle": "Roma 12",\n    "cp": "06700"\n  }\n}';
      const r = C.leerDatos(json, 'json');
      assert.strictEqual(r.nodo.tipo, 'grupo');
      const tipos = r.nodo.campos.map((c) => c.nodo.tipo).join(',');
      assert.strictEqual(tipos, 'texto,sino,fecha,numero,lista,tabla,grupo');
      assert.strictEqual(C.aJson(r.nodo), json);
    });
    prueba('Las etiquetas se ven bonitas y las claves se respetan', () => {
      const r = C.leerDatos('{"precio_medio": 1, "firstName": "a"}', 'json');
      igual(r.nodo.campos.map((c) => c.etiqueta), ['Precio medio', 'firstName']);
      assert.strictEqual(C.aJson(r.nodo), '{\n  "precio_medio": 1,\n  "firstName": "a"\n}');
      assert.strictEqual(C.aClave('Fecha de apertura'), 'fecha_de_apertura');
      assert.strictEqual(C.aClave('Teléfono (casa)'), 'telefono_casa');
    });
    prueba('Formas raras quedan como JSON editable (sin perder datos)', () => {
      const json = '[1, "dos", {"tres": [3]}]';
      const r = C.leerDatos(json, 'json');
      assert.strictEqual(r.nodo.tipo, 'crudo');
      igual(JSON.parse(C.aJson(r.nodo)), JSON.parse(json));
    });
    prueba('Error de JSON dice la línea', () => {
      try {
        C.leerDatos('{\n  "a": 1\n  "b": 2\n}', 'json');
        assert.fail('debió fallar');
      } catch (e) {
        assert.ok(e instanceof C.ErrorDatos, 'es ErrorDatos');
        assert.strictEqual(e.linea, 3);
      }
    });
    prueba('XML → formulario → XML conserva los datos', () => {
      const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<tienda>\n  <nombre>Café &amp; Pan</nombre>\n  <abierto>true</abierto>\n' +
        '  <servicios>\n    <elemento>Wifi</elemento>\n    <elemento>Terraza</elemento>\n  </servicios>\n  <productos>\n' +
        '    <producto><nombre>Capuchino</nombre><precio>48</precio><disponible>true</disponible></producto>\n  </productos>\n</tienda>';
      const r = C.leerDatos(xml, 'xml');
      assert.strictEqual(r.nombre, 'tienda');
      assert.strictEqual(r.nodo.campos[3].nodo.tipo, 'tabla', 'un solo <producto> dentro de <productos> es tabla');
      assert.strictEqual(r.nodo.campos[3].nodo.fila, 'producto');
      assert.strictEqual(C.aXmlDocumento(r.nodo, r.nombre), xml);
    });
    prueba('JSON ⇄ XML con el mismo formulario', () => {
      const r = C.leerDatos('{"productos": [{"nombre": "Té", "precio": 20}]}', 'json');
      const xml = C.aXmlDocumento(r.nodo, 'datos');
      assert.ok(xml.includes('<elemento><nombre>Té</nombre><precio>20</precio></elemento>'), xml);
      const vuelta = C.leerDatos(xml, 'xml');
      igual(C.aValor(vuelta.nodo), { productos: [{ nombre: 'Té', precio: 20 }] });
    });
    prueba('Los nombres de campo sirven como etiquetas XML', () => {
      assert.strictEqual(C.nombreXml('1 año'), '_1_ano');
      assert.strictEqual(C.nombreXml('precio'), 'precio');
    });
    prueba('Error de XML se detecta', () => {
      assert.throws(() => C.leerDatos('<a><b>1</a>', 'xml'), (e) => e instanceof C.ErrorDatos);
    });
    prueba('Pegar desde Excel adivina los tipos de columna', () => {
      const t = C.tablaDesdeTsv('Nombre\tPrecio\tDisponible\tDesde\r\nCafé\t$1,234.50\tsí\t15/03/2019\r\n"Té ""verde"""\t30\tno\t01/01/2020\r\n');
      igual(t.columnas.map((c) => c.tipo), ['texto', 'numero', 'sino', 'fecha']);
      igual(t.filas[0], ['Café', 1234.5, true, '2019-03-15']);
      assert.strictEqual(t.filas[1][0], 'Té "verde"');
    });
    prueba('Heredar etiquetas al volver del código', () => {
      const viejo = C.leerDatos('{"telefono": "1"}', 'json').nodo;
      viejo.campos[0].etiqueta = 'Teléfono';
      const nuevo = C.leerDatos('{"telefono": "2", "correo": "x"}', 'json').nodo;
      C.heredarEtiquetas(nuevo, viejo);
      igual(nuevo.campos.map((c) => c.etiqueta), ['Teléfono', 'Correo']);
    });

    console.log('Documento con secciones de datos');
    const md = '# Menú de otoño\n\nProductos de **temporada**.\n\n## Productos\n\n```json\n[\n  { "nombre": "Latte", "precio": 58, "disponible": true },\n' +
      '  { "nombre": "Pan de muerto", "precio": 32, "disponible": false }\n]\n```\n\nPrecios con IVA.\n\n```xml\n<menu>\n  <bebida>Café</bebida>\n</menu>\n```\n\n```js\nconsole.log(1)\n```\n';
    prueba('Markdown → editor: las secciones ```json/```xml se vuelven formularios', () => {
      C.cargarDocumento(md, { nombre: 'menu' });
      const bloques = d.querySelectorAll('#doc-editor .bloque-datos');
      assert.strictEqual(bloques.length, 2);
      assert.strictEqual(bloques[0].querySelectorAll('.tabla-datos tbody tr').length, 2);
      assert.strictEqual(d.querySelectorAll('#doc-editor pre code').length, 1, 'el bloque js sigue siendo código');
    });
    prueba('Editor → Markdown da el mismo texto', () => {
      assert.strictEqual(C.markdownDelEditor(), md);
    });
    prueba('Editar una celda cambia el Markdown', () => {
      const celda = d.querySelector('#doc-editor .bloque-datos .entrada-celda');
      celda.value = 'Latte de calabaza';
      celda.dispatchEvent(new w.Event('input', { bubbles: true }));
      assert.ok(C.markdownDelEditor().includes('"nombre": "Latte de calabaza"'));
    });
    prueba('Cambiar una sección a XML', () => {
      const boton = [...d.querySelectorAll('#doc-editor .bloque-datos .interruptor button')].find((b) => b.textContent === 'XML');
      boton.click();
      const texto = C.markdownDelEditor();
      assert.ok(texto.includes('```xml\n<datos>\n  <elemento><nombre>Latte de calabaza</nombre><precio>58</precio><disponible>true</disponible></elemento>'), texto);
    });
    prueba('Vista Markdown con error: se marca la línea y no se pierde nada', () => {
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
    prueba('Chips del documento', () => {
      assert.ok(/1 sección de datos/.test(d.getElementById('doc-chips').textContent), d.getElementById('doc-chips').textContent);
      assert.ok(!d.getElementById('doc-datos').hidden);
    });

    console.log('Editor de datos');
    prueba('Plantilla de productos pinta el formulario', () => {
      C.abrirPlantilla('productos');
      assert.ok(!d.getElementById('vista-datos').hidden);
      assert.strictEqual(d.querySelectorAll('#datos-form .campo').length, 5);
      assert.ok(/5 campos/.test(d.getElementById('datos-chips').textContent));
    });
    prueba('Agregar un campo desde el menú', () => {
      d.querySelector('#datos-form .btn-punteado.campo-ancho').click();
      const opcion = [...d.querySelectorAll('.menu .menu-item')].find((b) => /Fecha/.test(b.textContent));
      opcion.click();
      assert.strictEqual(d.querySelectorAll('#datos-form .campos-raiz > .campo').length, 6);
      assert.ok(C.textoDatos().includes('"fecha": "'));
    });
    prueba('Interruptor Sí/No cambia el valor', () => {
      const sino = d.querySelector('#datos-form .campo .sino');
      assert.strictEqual(sino.getAttribute('aria-checked'), 'true');
      sino.click();
      assert.ok(C.textoDatos().includes('"abierto_hoy": false'));
    });
    prueba('Formulario ⇄ código JSON ⇄ XML', () => {
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
    prueba('Abrir un JSON con error lo deja en la vista de código', () => {
      C.cargarDatosTexto('{\n  "a": [1, 2\n}', 'json', 'roto');
      assert.ok(!d.getElementById('datos-codigo').hidden);
      assert.ok(/línea 3/.test(d.getElementById('datos-error').textContent), d.getElementById('datos-error').textContent);
    });

    console.log('Navegación');
    prueba('Menú "Crear" abre la pantalla de elegir', () => {
      d.querySelector('.nav a[data-ir="crear"]').click();
      assert.ok(!d.getElementById('vista-datos').hidden, 'vuelve a la última vista de Crear');
      d.querySelector('.nav a[data-ir="convertir"]').click();
      assert.ok(!d.getElementById('vista-inicio').hidden);
      assert.strictEqual(d.querySelector('.nav a[aria-current]').dataset.ir, 'convertir');
    });

    if (erroresApp.length) {
      console.error('Errores en la app:\n' + erroresApp.join('\n'));
      process.exitCode = 1;
    }
    console.log('\n' + pasadas + ' pruebas pasadas' + (process.exitCode ? ' (con fallos)' : ''));
    setTimeout(() => process.exit(process.exitCode || 0), 50);
  });
});
