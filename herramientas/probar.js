// Prueba de extremo a extremo: carga index.html en jsdom con los scripts reales,
// "suelta" uno o varios archivos en la zona y muestra lo que pinta la app.
//
//   node probar.js ../ejemplo/plantilla.docx [otro.docx ...] [algo.txt]
//
// Un .txt que no exista se simula (sirve para probar el rechazo de no-.docx).
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
  beforeParse(w) { w.TextDecoder = TextDecoder; w.TextEncoder = TextEncoder; w.scrollTo = () => {}; }
}).then((dom) => {
  dom.window.addEventListener('load', () => {
    const w = dom.window;
    const archivos = rutas.map((r) => {
      const nombre = path.basename(r);
      if (r.endsWith('.txt') && !fs.existsSync(r)) return new w.File(['x'], nombre);
      return new w.File([fs.readFileSync(path.resolve(r))], nombre);
    });
    const ev = new w.Event('drop', { bubbles: true, cancelable: true });
    ev.dataTransfer = { files: archivos };
    w.document.getElementById('soltar').dispatchEvent(ev);

    setTimeout(() => {
      const d = w.document;
      const txt = (id) => d.getElementById(id).textContent.trim();
      console.log('Vista resultado :', !d.getElementById('vista-resultado').hidden);
      console.log('Error de inicio :', txt('error-inicio') || '(ninguno)');
      console.log('Archivo actual  :', txt('res-nombre'));
      console.log('Botón descargar :', txt('btn-descargar'));
      console.log('Varios archivos :', d.getElementById('res-archivos').hidden ? 'no' : txt('res-archivos-lista'));
      console.log('Consejos        :', txt('res-consejos') || '(ninguno)');
      console.log('\n----- Markdown -----\n' + d.getElementById('res-md').textContent);
      process.exit(0);
    }, 4000);
  });
});
