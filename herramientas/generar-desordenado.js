// Uso: npm run desordenado
// Word "mal hecho" para probar los consejos: estilo propio, sin títulos, celdas combinadas, | en celdas.
const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType } = require('docx');
const largo = 'Este es un párrafo largo que simula un documento sin estructura. '.repeat(8);
const doc = new Document({
  styles: { paragraphStyles: [{ id: 'Destacado', name: 'Destacado', basedOn: 'Normal', run: { color: 'FF0000', bold: true } }] },
  sections: [{ children: [
    new Paragraph({ children: [new TextRun({ text: 'Esto parece un título pero es negrita', bold: true, size: 40 })] }),
    new Paragraph({ children: [new TextRun(largo)] }),
    new Paragraph({ style: 'Destacado', children: [new TextRun('Texto destacado')] }),
    new Table({ width: { size: 6000, type: WidthType.DXA }, columnWidths: [3000, 3000], rows: [
      new TableRow({ children: [new TableCell({ columnSpan: 2, width: { size: 6000, type: WidthType.DXA }, children: [new Paragraph('Combinada')] })] }),
      new TableRow({ children: [
        new TableCell({ width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph('a | b'), new Paragraph('segunda línea')] }),
        new TableCell({ width: { size: 3000, type: WidthType.DXA }, children: [new Paragraph('c')] })] })
    ] })
  ] }]
});
Packer.toBuffer(doc).then(b => fs.writeFileSync(process.argv[2], b));
