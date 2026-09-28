// Genera los ejemplos de Excel y PowerPoint que usan las pruebas (y que cualquiera puede abrir en la app):
//   ejemplo/ventas.xlsx        dos hojas: números, fechas, sí/no, una fórmula y una celda combinada
//   ejemplo/presentacion.pptx  portada, viñetas con subniveles, tabla, imagen, notas del orador;
//                              títulos con marcador y títulos en cuadros de texto sueltos
//
//   node generar-office.js
const ExcelJS = require('exceljs');
const PptxGenJS = require('pptxgenjs');
const path = require('path');

const destino = path.resolve(__dirname, '..', 'ejemplo');

async function excel() {
  const libro = new ExcelJS.Workbook();
  const ventas = libro.addWorksheet('Ventas');
  ventas.addRow(['Producto', 'Precio', 'Disponible', 'Desde', 'Total']);
  const filas = [
    ['Café americano', 35, true, new Date(Date.UTC(2024, 0, 15))],
    ['Capuchino', 48.5, true, new Date(Date.UTC(2024, 2, 1))],
    ['Pan de elote', 30, false, new Date(Date.UTC(2023, 10, 20))]
  ];
  filas.forEach((f, i) => {
    const fila = ventas.addRow(f);
    fila.getCell(4).numFmt = 'dd/mm/yyyy';
    fila.getCell(5).value = { formula: 'B' + (i + 2) + '*10', result: f[1] * 10 };
  });
  const clientes = libro.addWorksheet('Clientes');
  clientes.addRow(['Nombre', 'Ciudad']);
  clientes.addRow(['Ana López', 'Puebla']);
  clientes.addRow(['Luis Pérez', 'Mérida']);
  clientes.addRow(['Equipo de ventas (combinada)']);
  clientes.mergeCells('A4:B4');
  await libro.xlsx.writeFile(path.join(destino, 'ventas.xlsx'));
}

async function powerpoint() {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'ANCHO', width: 13.33, height: 7.5 });
  pres.layout = 'ANCHO';
  // Un patrón con marcador de título, como las presentaciones hechas en PowerPoint.
  pres.defineSlideMaster({
    title: 'CON_TITULO',
    objects: [{ placeholder: { options: { name: 'titulo', type: 'title', x: 0.5, y: 0.3, w: 12, h: 1 }, text: '' } }]
  });

  const portada = pres.addSlide();
  portada.addText('Informe trimestral', { x: 0.5, y: 2.5, w: 12, h: 1.5, fontSize: 44, bold: true });
  portada.addText('Equipo de ventas · Tercer trimestre', { x: 0.5, y: 4.2, w: 12, h: 0.8, fontSize: 20 });

  const resultados = pres.addSlide({ masterName: 'CON_TITULO' });
  resultados.addText('Resultados', { placeholder: 'titulo' });
  resultados.addText([
    { text: 'Ventas: +12 %', options: { bullet: true, bold: true } },
    { text: 'Norte: 1.2 M', options: { bullet: true, indentLevel: 1 } },
    { text: 'Sur: 0.9 M', options: { bullet: true, indentLevel: 1 } },
    { text: 'Clientes nuevos: 38', options: { bullet: true } }
  ], { x: 0.5, y: 1.5, w: 12, h: 3, fontSize: 20 });
  resultados.addNotes('Recordar mencionar la oficina nueva de Mérida.');

  const tabla = pres.addSlide({ masterName: 'CON_TITULO' });
  tabla.addText('Por región', { placeholder: 'titulo' });
  tabla.addTable([
    [{ text: 'Región' }, { text: 'Ventas' }],
    [{ text: 'Norte' }, { text: '1.2 M' }],
    [{ text: 'Sur' }, { text: '0.9 M' }]
  ], { x: 0.5, y: 1.5, w: 8 });

  const imagen = pres.addSlide();
  imagen.addText('Nuestra oficina', { x: 0.5, y: 0.3, w: 12, h: 1, fontSize: 32, bold: true });
  // Un cuadrado azul de 2×2 píxeles basta para probar que la imagen se extrae.
  const png = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPQ1///n4GBgYEBAB0cA/0ZkWUuAAAAAElFTkSuQmCC';
  imagen.addImage({ data: png, x: 0.5, y: 1.5, w: 3, h: 3, altText: 'Foto de la oficina' });

  await pres.writeFile({ fileName: path.join(destino, 'presentacion.pptx') });
}

(async () => {
  await excel();
  await powerpoint();
  console.log('Listo: ejemplo/ventas.xlsx y ejemplo/presentacion.pptx');
})();
