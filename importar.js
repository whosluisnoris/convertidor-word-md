/* word.md — leer Excel (.xlsx) y PowerPoint (.pptx) sin librerías extra.
   Los dos formatos son un .zip con archivos XML dentro: se abren con JSZip (ya está en vendor/)
   y se leen con DOMParser. Todo ocurre en el navegador, sin internet. */
(function () {
  'use strict';

  var W = window.wordmd;

  // ---------- Utilidades de XML dentro del .zip ----------
  function xml(texto) { return new DOMParser().parseFromString(texto, 'application/xml'); }
  // Se busca por nombre local ("a:t" → "t") para no depender de los prefijos.
  function todos(el, nombre) { return Array.prototype.slice.call(el.getElementsByTagNameNS('*', nombre)); }
  function hijos(el, nombre) {
    return Array.prototype.filter.call(el.childNodes, function (n) { return n.nodeType === 1 && (!nombre || n.localName === nombre); });
  }
  function hijo(el, nombre) { return el ? hijos(el, nombre)[0] || null : null; }
  function atributoR(el, nombre) { return el.getAttribute('r:' + nombre) || el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', nombre); }

  function carpeta(ruta) { return ruta.replace(/[^/]*$/, ''); }
  // "../media/imagen1.png" relativo a "ppt/slides/slide1.xml" → "ppt/media/imagen1.png"
  function resolver(base, destino) {
    if (/^\//.test(destino)) return destino.slice(1);
    var partes = (carpeta(base) + destino).split('/'), salida = [];
    partes.forEach(function (p) { if (p === '..') salida.pop(); else if (p !== '.' && p !== '') salida.push(p); });
    return salida.join('/');
  }
  function leerTexto(zip, ruta) { var f = zip.file(ruta); return f ? f.async('string') : Promise.resolve(null); }
  // Relaciones de una parte: Id → {destino, tipo, externo}
  function relaciones(zip, parte) {
    var ruta = carpeta(parte) + '_rels/' + parte.replace(/^.*\//, '') + '.rels';
    return leerTexto(zip, ruta).then(function (t) {
      var mapa = {};
      if (!t) return mapa;
      todos(xml(t), 'Relationship').forEach(function (r) {
        var externo = r.getAttribute('TargetMode') === 'External';
        mapa[r.getAttribute('Id')] = {
          destino: externo ? r.getAttribute('Target') : resolver(parte, r.getAttribute('Target')),
          tipo: (r.getAttribute('Type') || '').replace(/^.*\//, ''),
          externo: externo
        };
      });
      return mapa;
    });
  }

  // =====================================================================
  // Excel (.xlsx)
  // =====================================================================
  var FORMATOS_FECHA = { 14: 'fecha', 15: 'fecha', 16: 'fecha', 17: 'fecha', 22: 'fechaHora', 27: 'fecha', 30: 'fecha', 36: 'fecha', 50: 'fecha', 57: 'fecha', 18: 'hora', 19: 'hora', 20: 'hora', 21: 'hora', 45: 'hora', 46: 'hora', 47: 'hora' };
  function tipoDeFormato(codigo) {
    var c = String(codigo || '').replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
    var fecha = /[dy]/i.test(c), hora = /[hs]/i.test(c);
    if (fecha) return hora ? 'fechaHora' : 'fecha';
    if (hora) return 'hora';
    return null;
  }
  // Por cada estilo de celda (índice "s"), si es fecha, hora o nada.
  function estilosDeFecha(texto) {
    if (!texto) return [];
    var d = xml(texto), propios = {};
    todos(d, 'numFmt').forEach(function (f) { propios[f.getAttribute('numFmtId')] = f.getAttribute('formatCode'); });
    var xfs = todos(d, 'cellXfs')[0];
    return xfs ? hijos(xfs, 'xf').map(function (xf) {
      var id = +xf.getAttribute('numFmtId') || 0;
      return propios[id] !== undefined ? tipoDeFormato(propios[id]) : FORMATOS_FECHA[id] || null;
    }) : [];
  }
  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function serialAFecha(serial, tipo, base1904) {
    var ms = Math.round(serial * 86400000);
    var d = new Date((base1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30)) + ms);
    var fecha = d.getUTCFullYear() + '-' + dos(d.getUTCMonth() + 1) + '-' + dos(d.getUTCDate());
    var hora = dos(d.getUTCHours()) + ':' + dos(d.getUTCMinutes()) + (d.getUTCSeconds() ? ':' + dos(d.getUTCSeconds()) : '');
    if (tipo === 'hora') return hora;
    if (tipo === 'fechaHora' && ms % 86400000) return fecha + ' ' + hora;
    return fecha;
  }
  // Texto de un <si> o <is>, sin la guía fonética (<rPh>) que usa Excel en japonés.
  function textoRico(el) {
    return todos(el, 't').filter(function (t) { return t.parentNode.localName !== 'rPh'; }).map(function (t) { return t.textContent; }).join('');
  }
  function columnaDe(ref) {
    var letras = String(ref).replace(/[^A-Z]/gi, '').toUpperCase(), n = 0;
    for (var i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
    return n - 1;
  }
  function valorDeCelda(c, ctx) {
    var tipo = c.getAttribute('t');
    if (tipo === 'inlineStr') return textoRico(hijo(c, 'is') || c);
    var v = hijo(c, 'v');
    if (!v) return null;
    var t = v.textContent;
    if (tipo === 's') return ctx.compartidas[+t] !== undefined ? ctx.compartidas[+t] : '';
    if (tipo === 'b') return t === '1';
    if (tipo === 'str' || tipo === 'e') return t;
    if (tipo === 'd') return t.slice(0, 10);
    var n = Number(t);
    if (isNaN(n)) return t;
    var formato = ctx.fechas[+c.getAttribute('s') || 0];
    if (formato) return serialAFecha(n, formato, ctx.base1904);
    return Number(n.toPrecision(15)); // quita el ruido de coma flotante (0.30000000000000004)
  }
  function leerHoja(texto, ctx) {
    var d = xml(texto), filas = [];
    todos(d, 'row').forEach(function (row) {
      var r = parseInt(row.getAttribute('r'), 10);
      var indice = isNaN(r) ? filas.length : r - 1;
      var fila = [];
      hijos(row, 'c').forEach(function (c, i) {
        var ref = c.getAttribute('r');
        fila[ref ? columnaDe(ref) : i] = valorDeCelda(c, ctx);
      });
      filas[indice] = fila;
    });
    var ancho = 0;
    for (var i = 0; i < filas.length; i++) {
      filas[i] = filas[i] || [];
      ancho = Math.max(ancho, filas[i].length);
    }
    filas = filas.map(function (f) {
      var completa = [];
      for (var j = 0; j < ancho; j++) completa.push(f[j] === undefined ? null : f[j]);
      return completa;
    });
    return { filas: filas, combinadas: todos(d, 'mergeCell').length > 0 };
  }

  // Devuelve {hojas: [{nombre, filas: [[valor|null]]}], consejos}
  function leerExcel(buffer) {
    return JSZip.loadAsync(new Uint8Array(buffer)).then(function (zip) {
      return Promise.all([
        leerTexto(zip, 'xl/workbook.xml'), relaciones(zip, 'xl/workbook.xml'),
        leerTexto(zip, 'xl/sharedStrings.xml'), leerTexto(zip, 'xl/styles.xml')
      ]).then(function (r) {
        if (!r[0]) throw new Error('No es un libro de Excel');
        var libro = xml(r[0]);
        var pr = todos(libro, 'workbookPr')[0];
        var ctx = {
          compartidas: r[2] ? todos(xml(r[2]), 'si').map(textoRico) : [],
          fechas: estilosDeFecha(r[3]),
          base1904: !!pr && /^(1|true)$/.test(pr.getAttribute('date1904') || '')
        };
        var consejos = [];
        var hojas = todos(libro, 'sheet').map(function (s) {
          var rel = r[1][atributoR(s, 'id')];
          return { nombre: s.getAttribute('name') || 'Hoja', ruta: rel && rel.destino, oculta: /hidden/i.test(s.getAttribute('state') || '') };
        }).filter(function (h) { return h.ruta && zip.file(h.ruta); });
        if (hojas.some(function (h) { return h.oculta; })) consejos.push('El libro tiene hojas ocultas; también se incluyeron.');
        var cadena = Promise.resolve();
        hojas.forEach(function (h) {
          cadena = cadena.then(function () { return leerTexto(zip, h.ruta); }).then(function (t) {
            var res = leerHoja(t, ctx);
            h.filas = res.filas;
            if (res.combinadas) consejos.push('La hoja “' + h.nombre + '” tiene celdas combinadas: el valor quedó solo en la primera celda.');
          });
        });
        return cadena.then(function () {
          hojas = hojas.map(function (h) { return { nombre: h.nombre, filas: recortar(h.filas) }; }).filter(function (h) { return h.filas.length; });
          if (!hojas.length) consejos.push('El libro no tiene datos.');
          consejos.push('Las fórmulas se convirtieron en su resultado; los gráficos, colores y formatos no se incluyen.');
          return { hojas: hojas, consejos: consejos };
        });
      });
    });
  }
  // Quita filas y columnas vacías de los bordes.
  function recortar(filas) {
    var vacia = function (v) { return v === null || v === ''; };
    filas = filas.filter(function (f) { return f.some(function (v) { return !vacia(v); }); });
    if (!filas.length) return [];
    var ancho = 0;
    filas.forEach(function (f) { for (var j = f.length - 1; j >= 0; j--) if (!vacia(f[j])) { ancho = Math.max(ancho, j + 1); break; } });
    var inicio = ancho;
    filas.forEach(function (f) { for (var j = 0; j < f.length; j++) if (!vacia(f[j])) { inicio = Math.min(inicio, j); break; } });
    return filas.map(function (f) { return f.slice(inicio, ancho); });
  }

  // Un libro como documento: una tabla Markdown por hoja.
  function excelAMarkdown(nombre, libro) {
    var celda = function (v) {
      if (v === null || v === undefined) return '';
      if (typeof v === 'boolean') return v ? 'Sí' : 'No';
      return String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
    };
    var partes = ['# ' + nombre];
    libro.hojas.forEach(function (h) {
      if (libro.hojas.length > 1) partes.push('## ' + h.nombre);
      var cab = h.filas[0], ancho = cab.length;
      var linea = function (f) { return '| ' + f.map(celda).join(' | ') + ' |'; };
      var tabla = [linea(cab.map(function (v, j) { return v === null || v === '' ? 'Columna ' + (j + 1) : v; })),
        '|' + new Array(ancho + 1).join(' --- |')];
      h.filas.slice(1).forEach(function (f) { tabla.push(linea(f)); });
      partes.push(tabla.join('\n'));
    });
    return partes.join('\n\n') + '\n';
  }

  // =====================================================================
  // PowerPoint (.pptx)
  // =====================================================================
  var TIPOS_IMAGEN = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/x-emf', wmf: 'image/x-wmf' };
  var PH_IGNORADOS = { dt: 1, ftr: 1, sldNum: 1, hdr: 1, sldImg: 1 };

  function posicion(el) {
    var xfrm = todos(el, 'xfrm')[0], off = xfrm && hijo(xfrm, 'off');
    return off ? { x: +off.getAttribute('x') || 0, y: +off.getAttribute('y') || 0 } : null;
  }
  // Un párrafo de PowerPoint → {html, texto, nivel, lista: null|'ul'|'ol', tam (pt·100), negrita}
  function parrafo(p, porDefectoLista, rels) {
    var pPr = hijo(p, 'pPr');
    var nivel = pPr ? +pPr.getAttribute('lvl') || 0 : 0;
    var lista = porDefectoLista ? 'ul' : null;
    if (pPr) {
      if (hijo(pPr, 'buNone')) lista = null;
      else if (hijo(pPr, 'buAutoNum')) lista = 'ol';
      else if (hijo(pPr, 'buChar') || hijo(pPr, 'buBlip')) lista = 'ul';
    }
    var plano = '', tam = 0, negrita = true, conTexto = false;
    var html = hijos(p).map(function (n) {
      if (n.localName === 'br') { plano += ' '; return '<br>'; }
      if (n.localName !== 'r' && n.localName !== 'fld') return '';
      var t = hijo(n, 't');
      plano += t ? t.textContent : '';
      var texto = W.escapar(t ? t.textContent : '');
      if (!texto.trim()) return texto;
      var rPr = hijo(n, 'rPr');
      conTexto = true;
      tam = Math.max(tam, rPr ? +rPr.getAttribute('sz') || 0 : 0);
      if (!rPr || !/^(1|true)$/.test(rPr.getAttribute('b') || '')) negrita = false;
      if (rPr) {
        if (/^(1|true)$/.test(rPr.getAttribute('b') || '')) texto = '<strong>' + texto + '</strong>';
        if (/^(1|true)$/.test(rPr.getAttribute('i') || '')) texto = '<em>' + texto + '</em>';
        if (/strike/i.test(rPr.getAttribute('strike') || '') && rPr.getAttribute('strike') !== 'noStrike') texto = '<s>' + texto + '</s>';
        var enlace = hijo(rPr, 'hlinkClick'), rel = enlace && rels[atributoR(enlace, 'id')];
        if (rel && rel.externo && !/^\s*javascript:/i.test(rel.destino)) texto = '<a href="' + W.escapar(rel.destino).replace(/"/g, '&quot;') + '">' + texto + '</a>';
      }
      return texto;
    }).join('');
    return { html: html.replace(/(<br>)+$/, ''), texto: plano.trim(), nivel: nivel, lista: lista, tam: tam, negrita: conTexto && negrita };
  }
  // Párrafos con niveles → listas anidadas y párrafos sueltos.
  function parrafosAHtml(ps) {
    var salida = '', pila = [];
    var cerrarHasta = function (n) { while (pila.length > n) salida += '</li></' + pila.pop() + '>'; };
    ps.forEach(function (p) {
      if (!p.html.trim()) return;
      if (!p.lista) { cerrarHasta(0); salida += '<p>' + p.html + '</p>'; return; }
      var nivel = Math.min(p.nivel, pila.length);
      if (nivel + 1 > pila.length) { salida += '<' + p.lista + '><li>'; pila.push(p.lista); }
      else { cerrarHasta(nivel + 1); salida += '</li><li>'; }
      salida += p.html;
    });
    cerrarHasta(0);
    return salida;
  }
  function textoDeCuerpo(txBody, porDefectoLista, rels) {
    return txBody ? hijos(txBody, 'p').map(function (p) { return parrafo(p, porDefectoLista, rels); }) : [];
  }
  function tablaAHtml(tbl, rels) {
    var filas = hijos(tbl, 'tr');
    if (!filas.length) return '';
    var celdas = function (tr, etiqueta) {
      return hijos(tr, 'tc').filter(function (tc) { return !/^(1|true)$/.test(tc.getAttribute('hMerge') || '') && !/^(1|true)$/.test(tc.getAttribute('vMerge') || ''); })
        .map(function (tc) {
          var ps = textoDeCuerpo(hijo(tc, 'txBody'), false, rels).map(function (p) { return p.html; }).filter(Boolean);
          return '<' + etiqueta + '>' + ps.join('<br>') + '</' + etiqueta + '>';
        }).join('');
    };
    return '<table><thead><tr>' + celdas(filas[0], 'th') + '</tr></thead><tbody>' +
      filas.slice(1).map(function (tr) { return '<tr>' + celdas(tr, 'td') + '</tr>'; }).join('') + '</tbody></table>';
  }

  // Las formas de una diapositiva, en orden de lectura.
  function formasDe(contenedor, rels, avisos) {
    var formas = [];
    hijos(contenedor).forEach(function (el, orden) {
      var nombre = el.localName;
      if (nombre === 'grpSp') { formas = formas.concat(formasDe(el, rels, avisos)); return; }
      var pos = posicion(el);
      if (nombre === 'sp') {
        var ph = todos(el, 'ph')[0], tipoPh = ph ? ph.getAttribute('type') || 'body' : null;
        if (tipoPh && PH_IGNORADOS[tipoPh]) return;
        var clase = tipoPh === 'title' || tipoPh === 'ctrTitle' ? 'titulo' : tipoPh === 'subTitle' ? 'subtitulo' : tipoPh ? 'cuerpo' : 'caja';
        formas.push({ clase: clase, tipoPh: tipoPh, pos: pos, orden: orden, parrafos: textoDeCuerpo(hijo(el, 'txBody'), clase === 'cuerpo', rels) });
      } else if (nombre === 'pic') {
        var blip = todos(el, 'blip')[0], rel = blip && rels[atributoR(blip, 'embed')];
        var nv = todos(el, 'cNvPr')[0];
        if (rel) formas.push({ clase: 'imagen', pos: pos, orden: orden, ruta: rel.destino, alt: nv ? nv.getAttribute('descr') || '' : '' });
      } else if (nombre === 'graphicFrame') {
        var tbl = todos(el, 'tbl')[0];
        if (tbl) formas.push({ clase: 'tabla', pos: pos, orden: orden, tbl: tbl });
        else if (todos(el, 'chart').length) avisos.graficos = true;
        else if (todos(el, 'relIds').length) avisos.smartart = true;
      }
    });
    return formas;
  }
  function ordenarFormas(formas) {
    var titulo = formas.filter(function (f) { return f.clase === 'titulo'; });
    var resto = formas.filter(function (f) { return f.clase !== 'titulo'; });
    // Con posiciones se lee de arriba abajo y de izquierda a derecha (en filas de ~1 cm).
    if (resto.every(function (f) { return f.pos; })) {
      resto.sort(function (a, b) { return Math.round(a.pos.y / 360000) - Math.round(b.pos.y / 360000) || a.pos.x - b.pos.x || a.orden - b.orden; });
    }
    // Sin marcador de título, el primer cuadro de texto de una sola línea corta, grande o en negrita, hace de título.
    if (!titulo.length) {
      var primero = resto.filter(function (f) { return f.clase === 'caja' || f.clase === 'cuerpo'; })[0];
      var ps = primero ? primero.parrafos.filter(function (p) { return p.texto; }) : [];
      if (ps.length === 1 && !ps[0].lista && ps[0].texto.split(/\s+/).length <= 12 && (ps[0].tam >= 2400 || ps[0].negrita)) {
        primero.clase = 'titulo';
        primero.tipoPh = 'caja';
        return [primero].concat(resto.filter(function (f) { return f !== primero; }));
      }
    }
    return titulo.concat(resto);
  }

  // Devuelve {nombre, md, imagenes: [{ruta, base64, tipo}], consejos} (igual que el convertidor de Word).
  function leerPowerPoint(buffer, nombre) {
    var imagenes = [], consejos = [], avisos = {};
    var porRuta = {};
    return JSZip.loadAsync(new Uint8Array(buffer)).then(function (zip) {
      return Promise.all([leerTexto(zip, 'ppt/presentation.xml'), relaciones(zip, 'ppt/presentation.xml')]).then(function (r) {
        if (!r[0]) throw new Error('No es una presentación de PowerPoint');
        var rutas = todos(xml(r[0]), 'sldId').map(function (s) { var rel = r[1][atributoR(s, 'id')]; return rel && rel.destino; })
          .filter(function (ruta) { return ruta && zip.file(ruta); });
        var html = [], tituloDoc = null, cadena = Promise.resolve();

        function imagen(ruta, alt) {
          if (porRuta[ruta]) return Promise.resolve(porRuta[ruta]);
          var archivo = zip.file(ruta);
          if (!archivo) return Promise.resolve(null);
          var ext = (ruta.split('.').pop() || 'png').toLowerCase();
          if (ext === 'emf' || ext === 'wmf') avisos.emf = true;
          return archivo.async('base64').then(function (b64) {
            var salida = 'imagenes/imagen-' + (imagenes.length + 1) + '.' + (ext === 'jpeg' ? 'jpg' : ext);
            imagenes.push({ ruta: salida, base64: b64, tipo: TIPOS_IMAGEN[ext] || 'application/octet-stream' });
            porRuta[ruta] = salida;
            return salida;
          });
        }

        rutas.forEach(function (ruta, i) {
          cadena = cadena.then(function () {
            return Promise.all([leerTexto(zip, ruta), relaciones(zip, ruta)]);
          }).then(function (res) {
            var d = xml(res[0]), rels = res[1];
            var arbol = todos(d, 'spTree')[0];
            var formas = arbol ? ordenarFormas(formasDe(arbol, rels, avisos)) : [];
            var partes = [];
            var titulo = formas.filter(function (f) { return f.clase === 'titulo'; })[0];
            var textoTitulo = titulo ? W.escapar(titulo.parrafos.map(function (p) { return p.texto; }).filter(Boolean).join(' ')) : '';
            // El título de la portada es el título del documento.
            if (i === 0 && titulo && textoTitulo && titulo.tipoPh !== 'title') tituloDoc = textoTitulo;
            else partes.push('<h2>' + (textoTitulo || 'Diapositiva ' + (i + 1)) + '</h2>');
            var pasos = formas.filter(function (f) { return f !== titulo; }).map(function (f) {
              if (f.clase === 'imagen') return imagen(f.ruta).then(function (salida) {
                return salida ? '<p><img src="' + salida + '" alt="' + W.escapar(f.alt).replace(/"/g, '&quot;') + '"></p>' : '';
              });
              if (f.clase === 'tabla') return Promise.resolve(tablaAHtml(f.tbl, rels));
              if (f.clase === 'subtitulo') return Promise.resolve(f.parrafos.filter(function (p) { return p.html.trim(); }).map(function (p) { return '<p><em>' + p.html + '</em></p>'; }).join(''));
              return Promise.resolve(parrafosAHtml(f.parrafos));
            });
            var notas = Object.keys(rels).map(function (k) { return rels[k]; }).filter(function (x) { return x.tipo === 'notesSlide'; })[0];
            return Promise.all(pasos).then(function (trozos) {
              partes = partes.concat(trozos);
              if (!notas) return;
              return leerTexto(zip, notas.destino).then(function (t) {
                if (!t) return;
                var cuerpo = todos(xml(t), 'sp').filter(function (sp) { var ph = todos(sp, 'ph')[0]; return ph && ph.getAttribute('type') === 'body'; })[0];
                var texto = cuerpo ? textoDeCuerpo(hijo(cuerpo, 'txBody'), false, {}).map(function (p) { return p.html; }).filter(function (x) { return x.trim(); }) : [];
                if (texto.length) partes.push('<blockquote><p><strong>Notas:</strong> ' + texto.join('<br>') + '</p></blockquote>');
              });
            }).then(function () { html.push(partes.join('')); });
          });
        });

        return cadena.then(function () {
          if (!rutas.length) consejos.push('La presentación no tiene diapositivas.');
          if (avisos.graficos) consejos.push('Hay gráficos que no se pueden convertir. En PowerPoint, clic derecho › Guardar como imagen y vuelve a insertarlos.');
          if (avisos.smartart) consejos.push('Hay diagramas SmartArt que no se pueden convertir. Conviértelos en imagen o en texto.');
          if (avisos.emf) consejos.push('Algunas imágenes están en formato EMF/WMF y muchos visores no las muestran. Guárdalas como PNG en PowerPoint.');
          consejos.push('Se conserva el texto, las tablas, las imágenes y las notas. El diseño, las animaciones y la posición de los elementos se pierden.');
          var cuerpo = '<h1>' + (tituloDoc || W.escapar(nombre)) + '</h1>' + html.join('');
          var md = W.limpiarMarkdown(W.nuevoTurndown().turndown(cuerpo));
          return { nombre: nombre, md: md, imagenes: imagenes, consejos: consejos };
        });
      });
    });
  }

  W.importar = {
    leerExcel: leerExcel,
    excelAMarkdown: excelAMarkdown,
    leerPowerPoint: leerPowerPoint,
    _pruebas: { tipoDeFormato: tipoDeFormato, serialAFecha: serialAFecha, columnaDe: columnaDe, recortar: recortar, resolver: resolver }
  };
})();
