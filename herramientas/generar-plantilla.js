// Genera ejemplo/plantilla.docx: un Word que usa todos los elementos que el convertidor entiende.
// Uso: npm run plantilla   (o: node generar-plantilla.js ../ejemplo/plantilla.docx)
const fs = require('fs');
const zlib = require('zlib');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Table, TableRow, TableCell,
  WidthType, ShadingType, ImageRun, LevelFormat, AlignmentType, BorderStyle
} = require('docx');

// ---- PNG simple (bloques de colores del diseño) ----
function png(w, h, pixel) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const AZUL = [47, 75, 255], AMA = [255, 210, 63], COR = [255, 92, 92], FON = [244, 243, 238];
const imagen = png(600, 240, (x, y) => {
  const dc = (cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 < r * r;
  if (x > 20 && x < 380 && y > 20 && y < 220) return dc(380, 220, 110) ? AMA : AZUL;
  if (dc(480, 120, 80)) return COR;
  return FON;
});

const P = (...runs) => new Paragraph({ children: runs.map(r => typeof r === 'string' ? new TextRun(r) : r) });
const H = (texto, nivel) => new Paragraph({ text: texto, heading: nivel });
const B = (t) => new TextRun({ text: t, bold: true });
const I = (t) => new TextRun({ text: t, italics: true });
const vineta = (t, nivel = 0) => new Paragraph({ children: [new TextRun(t)], numbering: { reference: 'vinetas', level: nivel } });
const numero = (t) => new Paragraph({ children: [new TextRun(t)], numbering: { reference: 'numeros', level: 0 } });
const codigo = (t) => new Paragraph({ style: 'Codigo', children: [new TextRun(t)] });

const borde = { style: BorderStyle.SINGLE, size: 4, color: 'CFCFE0' };
const bordes = { top: borde, bottom: borde, left: borde, right: borde };
const anchos = [3000, 3000, 3026];
const celda = (t, i, cab) => new TableCell({
  borders: bordes, width: { size: anchos[i], type: WidthType.DXA },
  shading: cab ? { fill: 'F0EFEA', type: ShadingType.CLEAR, color: 'auto' } : undefined,
  margins: { top: 80, bottom: 80, left: 120, right: 120 },
  children: [new Paragraph({ children: [new TextRun({ text: t, bold: cab })] })]
});
const fila = (vals, cab = false) => new TableRow({ ...(cab ? { tableHeader: true } : {}), children: vals.map((v, i) => celda(v, i, cab)) });

const doc = new Document({
  creator: 'word.md',
  title: 'Plantilla de ejemplo',
  styles: {
    default: { document: { run: { font: 'Calibri', size: 22 } } },
    paragraphStyles: [
      { id: 'Codigo', name: 'Código', basedOn: 'Normal', quickFormat: true,
        run: { font: 'Consolas', size: 20, color: '16161D' },
        paragraph: { spacing: { before: 0, after: 0 }, shading: { fill: 'F0EFEA', type: ShadingType.CLEAR, color: 'auto' } } },
      { id: 'Cita', name: 'Cita', basedOn: 'Normal', quickFormat: true,
        run: { italics: true, color: '5C5C6E' }, paragraph: { indent: { left: 720 } } }
    ]
  },
  numbering: {
    config: [
      { reference: 'vinetas', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } }
      ] },
      { reference: 'numeros', levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }
      ] }
    ]
  },
  sections: [{
    children: [
      H('Plantilla de ejemplo', HeadingLevel.TITLE),
      P('Este documento usa todos los elementos que el convertidor entiende. Conviértelo para ver el resultado, o úsalo como base para tus propios documentos: copia y pega sus partes y conservarás los estilos correctos.'),

      H('1. Títulos', HeadingLevel.HEADING_1),
      P('Los títulos se crean con los estilos ', B('Título 1'), ', ', B('Título 2'), ' y ', B('Título 3'), ' de ', I('Inicio › Estilos'), '. Cada nivel se convierte en un número distinto de almohadillas (#).'),
      H('Un subtítulo de nivel 2', HeadingLevel.HEADING_2),
      P('Texto bajo el nivel 2.'),
      H('Un subtítulo de nivel 3', HeadingLevel.HEADING_3),
      P('Texto bajo el nivel 3.'),

      H('2. Formato de texto', HeadingLevel.HEADING_1),
      P('Puedes usar ', B('negrita'), ', ', I('cursiva'), ', ', new TextRun({ text: 'tachado', strike: true }), ' y ',
        new ExternalHyperlink({ link: 'https://www.markdownguide.org/', children: [new TextRun({ text: 'enlaces', style: 'Hyperlink' })] }),
        '. Los colores, fuentes y tamaños no se conservan.'),

      H('3. Listas', HeadingLevel.HEADING_1),
      P('Listas con viñetas (botón de viñetas; Tab para subnivel):'),
      vineta('Primer elemento'),
      vineta('Segundo elemento'),
      vineta('Un subelemento', 1),
      vineta('Tercer elemento'),
      P('Listas numeradas (botón de numeración):'),
      numero('Abre el documento en Word.'),
      numero('Aplica los estilos correctos.'),
      numero('Conviértelo con word.md.'),

      H('4. Tablas', HeadingLevel.HEADING_1),
      P('La primera fila es el encabezado. No combines celdas.'),
      new Table({
        width: { size: 9026, type: WidthType.DXA }, columnWidths: anchos,
        rows: [
          fila(['Elemento en Word', 'Resultado', 'Notas'], true),
          fila(['Título 1', '# Título', 'Un solo # por nivel 1']),
          fila(['Negrita', '**texto**', 'Ctrl+N en Word en español']),
          fila(['Tabla', '| a | b |', 'Sin celdas combinadas'])
        ]
      }),

      H('5. Citas y código', HeadingLevel.HEADING_1),
      P('Para una cita usa el estilo ', B('Cita'), ':'),
      new Paragraph({ style: 'Cita', children: [new TextRun('La simplicidad es la máxima sofisticación.')] }),
      P('Para código usa el estilo ', B('Código'), ' (en este documento ya existe; en otros, créalo con fuente Consolas y nómbralo exactamente “Código”):'),
      codigo('function saludar(nombre) {'),
      codigo('  return "Hola, " + nombre;'),
      codigo('}'),

      H('6. Imágenes', HeadingLevel.HEADING_1),
      P('Inserta las imágenes “En línea con el texto”. Se guardan en la carpeta imagenes/ del .zip.'),
      new Paragraph({ children: [new ImageRun({ type: 'png', data: imagen, transformation: { width: 450, height: 180 }, altText: { title: 'Bloques de color', description: 'Bloques de color de ejemplo', name: 'ejemplo' } })] }),
      P('Fin de la plantilla.')
    ]
  }]
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync(process.argv[2], buf); console.log('ok', buf.length); });
