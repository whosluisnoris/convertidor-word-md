// Prueba de extremo a extremo: carga index.html en jsdom con los scripts reales,
// "suelta" uno o varios archivos en la zona y muestra lo que queda en cada pestaña.
//
//   node probar.js ../ejemplo/plantilla.docx [otro.docx|.xlsx|.pptx ...] [viejo.xls]
//
// Un archivo que no exista se simula con contenido "x" (sirve para probar el rechazo de .xls, .doc…).
const { JSDOM, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const rutas = process.argv.slice(2);
if (!rutas.length) {
  console.error('Uso: node probar.js <archivo.docx> [más archivos]');
  process.exit(1);
}

const consola = new VirtualConsole();
consola.on('jsdomError', (e) => console.error('[jsdom]', e.message));
consola.on('error', (e) => console.error('[app]', e));

JSDOM.fromFile(path.join(raiz, 'index.html'), {
  runScripts: 'dangerously',
  resources: 'usable',
  virtualConsole: consola,
  // jsdom no trae TextDecoder (los navegadores sí) y mammoth lo necesita.
  beforeParse(w) {
    w.TextDecoder = TextDecoder; w.TextEncoder = TextEncoder; w.scrollTo = () => {};
    // JSZip programa su trabajo con postMessage, que jsdom no entrega como un navegador.
    w.setImmediate = (f, ...a) => setTimeout(() => f(...a), 0);
    w.confirm = () => true; // Excel: "¿Cómo quieres usarlo?" → la primera opción (datos)
    w.document.execCommand = () => false;
  }
}).then((dom) => {
  dom.window.addEventListener('load', () => {
    const w = dom.window;
    const archivos = rutas.map((r) => {
      const nombre = path.basename(r);
      if (!fs.existsSync(r)) return new w.File(['x'], nombre);
      return new w.File([fs.readFileSync(path.resolve(r))], nombre);
    });
    const ev = new w.Event('drop', { bubbles: true, cancelable: true });
    ev.dataTransfer = { files: archivos };
    w.document.getElementById('soltar').dispatchEvent(ev);

    setTimeout(() => {
      const d = w.document;
      const W = w.wordmd;
      const txt = (id) => d.getElementById(id).textContent.trim();
      const estado = W.pestanas.estado();
      const abiertas = estado.abiertas.map((id) => W.pestanas.indice().find((x) => x.id === id));
      console.log('Vista documento :', !d.getElementById('vista-documento').hidden);
      console.log('Error de inicio :', txt('error-inicio') || '(ninguno)');
      console.log('Pestañas        :', abiertas.map((x) => x.nombre + (x.tipo === 'md' ? '.md' : '.' + x.formato)).join(', ') || '(ninguna)');
      console.log('Aviso           :', d.getElementById('toast').hidden ? '(ninguno)' : txt('toast'));
      console.log('Botón descargar :', txt('doc-descargar'));
      // Cada pestaña: consejos y Markdown.
      abiertas.forEach((x) => {
        W.pestanas.activar(x.id);
        if (x.tipo === 'md') {
          const e = W.editorDoc.estado();
          console.log('\n===== ' + x.nombre + '.md =====');
          console.log('Consejos        :', e.consejos.length ? e.consejos.join(' | ') : '(ninguno)');
          console.log('\n----- Markdown -----\n' + e.md);
        } else {
          console.log('\n===== ' + x.nombre + '.' + x.formato + ' =====');
          console.log(W.datos.aJson(W.editorDatos.estado().nodo));
        }
      });
      setTimeout(() => process.exit(0), 100);
    }, 4000);
  });
});
