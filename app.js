/* word.md — núcleo compartido: conversión de Word (.docx → Markdown) y utilidades.
   Flujo: .docx → (mammoth) HTML → limpieza → (turndown + gfm) Markdown.
   La interfaz (pestañas, inicio, editores) está en pestanas.js y crear.js; lo común se comparte en window.wordmd. */
(function () {
  'use strict';

  // ---------- Mapa de estilos de Word (español e inglés) ----------
  var MAPA_ESTILOS = [
    "p[style-name='Title'] => h1:fresh",
    "p[style-name='Título'] => h1:fresh",
    "p[style-name='Subtitle'] => p:fresh",
    "p[style-name='Subtítulo'] => p:fresh",
    "p[style-name='Título 1'] => h1:fresh",
    "p[style-name='Título 2'] => h2:fresh",
    "p[style-name='Título 3'] => h3:fresh",
    "p[style-name='Título 4'] => h4:fresh",
    "p[style-name='Título 5'] => h5:fresh",
    "p[style-name='Título 6'] => h6:fresh",
    "p[style-name='Quote'] => blockquote > p:fresh",
    "p[style-name='Cita'] => blockquote > p:fresh",
    "p[style-name='Intense Quote'] => blockquote > p:fresh",
    "p[style-name='Cita destacada'] => blockquote > p:fresh",
    "p[style-name='Code'] => pre:separator('\\n')",
    "p[style-name='Código'] => pre:separator('\\n')",
    "p[style-name='HTML Preformatted'] => pre:separator('\\n')",
    "p[style-name='HTML con formato previo'] => pre:separator('\\n')",
    "r[style-name='Code'] => code",
    "r[style-name='Código'] => code",
    "r[style-name='HTML Code'] => code",
    "r[style-name='Código HTML'] => code",
    // Ojo: no mapear "List Paragraph"/"Párrafo de lista": el mapeo explícito
    // anula la detección de listas de mammoth y las viñetas salen como párrafos.
    "p[style-name='Caption'] => p:fresh",
    "p[style-name='Descripción'] => p:fresh",
    "p[style-name='Normal (Web)'] => p:fresh",
    "p[style-name='No Spacing'] => p:fresh",
    "p[style-name='Sin espaciado'] => p:fresh",
    "p[style-name='Body Text'] => p:fresh",
    "p[style-name='Texto independiente'] => p:fresh",
    "p[style-name^='toc'] => p:fresh",
    "p[style-name^='TDC'] => p:fresh",
    "p[style-name^='TOC'] => p:fresh",
    "p[style-name='Footnote Text'] => p:fresh",
    "p[style-name='Texto nota pie'] => p:fresh",
    "r[style-name='Hyperlink'] => ",
    "r[style-name='Hipervínculo'] => ",
    "r[style-name='Strong'] => strong",
    "r[style-name='Texto en negrita'] => strong",
    "r[style-name='Emphasis'] => em",
    "r[style-name='Énfasis'] => em"
  ];

  var EXTENSIONES = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif',
    'image/bmp': 'bmp', 'image/tiff': 'tif', 'image/svg+xml': 'svg', 'image/webp': 'webp',
    'image/x-emf': 'emf', 'image/x-wmf': 'wmf'
  };

  // ---------- Turndown (HTML → Markdown) ----------
  // Es una función porque la sección "Crear" necesita su propia instancia con reglas extra.
  function nuevoTurndown() {
    var turndown = new TurndownService({
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      strongDelimiter: '**',
      hr: '---'
    });
    turndown.use(turndownPluginGfm.gfm);

    // Celdas de tabla: todo en una línea y "|" escapado para no romper la tabla.
    turndown.addRule('celdaSegura', {
      filter: ['th', 'td'],
      replacement: function (content, node) {
        var limpio = content.replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim();
        var indice = Array.prototype.indexOf.call(node.parentNode.children, node);
        return (indice === 0 ? '| ' : ' ') + limpio + ' |';
      }
    });
    // Saltos de línea dentro de una celda → <br> (lo entiende GitHub y la mayoría de visores).
    turndown.addRule('saltoEnCelda', {
      filter: function (node) { return node.nodeName === 'BR' && !!node.closest && !!node.closest('td,th'); },
      replacement: function () { return '<br>'; }
    });
    // Viñetas "- texto" (turndown pone "-   texto"); la sangría de subniveles
    // se ajusta al ancho del marcador para que las listas anidadas sigan siendo válidas.
    turndown.addRule('elementoLista', {
      filter: 'li',
      replacement: function (content, node, options) {
        var padre = node.parentNode;
        var marcador = options.bulletListMarker + ' ';
        if (padre.nodeName === 'OL') {
          var inicio = parseInt(padre.getAttribute('start'), 10) || 1;
          marcador = (inicio + Array.prototype.indexOf.call(padre.children, node)) + '. ';
        }
        var sangria = new Array(marcador.length + 1).join(' ');
        content = content.replace(/^\n+/, '').replace(/\n+$/, '\n').replace(/\n/gm, '\n' + sangria);
        return marcador + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
      }
    });
    // Tachado con doble tilde (~~), que es lo que entiende GitHub/GFM.
    turndown.addRule('tachado', {
      filter: ['del', 's', 'strike'],
      replacement: function (content) { return content.trim() ? '~~' + content + '~~' : ''; }
    });
    // Las anclas vacías que Word usa como marcadores no aportan nada.
    turndown.addRule('anclaVacia', {
      filter: function (node) { return node.nodeName === 'A' && !node.getAttribute('href') && !node.textContent.trim(); },
      replacement: function () { return ''; }
    });
    return turndown;
  }
  var turndown = nuevoTurndown();

  var $ = function (id) { return document.getElementById(id); };

  var avisoTimer;
  function aviso(texto) {
    var t = $('toast');
    t.textContent = texto;
    t.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // ---------- Conversión de Word ----------
  function leerArchivo(archivo) {
    if (archivo.arrayBuffer) return archivo.arrayBuffer();
    return new Promise(function (ok, mal) {
      var lector = new FileReader();
      lector.onload = function () { ok(lector.result); };
      lector.onerror = function () { mal(lector.error); };
      lector.readAsArrayBuffer(archivo);
    });
  }

  function convertir(archivo) {
    var base = archivo.name.replace(/\.docx$/i, '');
    var imagenes = [];
    var formatosRaros = {};

    var opciones = {
      styleMap: MAPA_ESTILOS,
      includeDefaultStyleMap: true,
      convertImage: mammoth.images.imgElement(function (imagen) {
        return imagen.read('base64').then(function (b64) {
          var tipo = (imagen.contentType || 'image/png').toLowerCase();
          var ext = EXTENSIONES[tipo] || (tipo.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '');
          if (ext === 'emf' || ext === 'wmf' || ext === 'tif') formatosRaros[ext] = true;
          var ruta = 'imagenes/imagen-' + (imagenes.length + 1) + '.' + ext;
          imagenes.push({ ruta: ruta, base64: b64, tipo: tipo });
          return { src: ruta, alt: (imagen.altText || '').trim() };
        });
      })
    };

    return leerArchivo(archivo).then(function (buffer) {
      return mammoth.convertToHtml({ arrayBuffer: buffer }, opciones);
    }).then(function (resultado) {
      var consejos = traducirMensajes(resultado.messages);
      var dom = new DOMParser().parseFromString('<div id="raiz">' + resultado.value + '</div>', 'text/html');
      var raiz = dom.getElementById('raiz');

      var combinadas = limpiarTablas(raiz);
      prepararCodigo(raiz);
      if (combinadas) consejos.push('Hay tablas con celdas combinadas. Markdown no las admite: revisa que los datos queden en la columna correcta.');
      if (formatosRaros.emf || formatosRaros.wmf) consejos.push('Algunas imágenes están en formato EMF/WMF (dibujos de Office). Se incluyen en el .zip, pero muchos visores no las muestran: en Word, clic derecho › Guardar como imagen › PNG y vuelve a insertarlas.');
      if (formatosRaros.tif) consejos.push('Hay imágenes TIFF que el navegador no puede mostrar. Conviértelas a PNG o JPG en Word.');
      if (!raiz.querySelector('h1,h2,h3,h4,h5,h6') && raiz.textContent.trim().length > 400) {
        consejos.push('No se detectó ningún título. Si tu documento tiene secciones, aplícales los estilos Título 1, Título 2… en Word (Inicio › Estilos).');
      }
      raiz.querySelectorAll('img').forEach(function (img) {
        if (!img.getAttribute('alt')) img.setAttribute('alt', '');
      });

      var md = limpiarMarkdown(turndown.turndown(raiz.innerHTML));
      return {
        nombre: base,
        md: md,
        imagenes: imagenes,
        consejos: consejos,
        estadisticas: contar(md, imagenes.length)
      };
    });
  }

  // mammoth genera <pre>texto</pre>; turndown solo hace bloque ``` si hay <pre><code>.
  function prepararCodigo(raiz) {
    raiz.querySelectorAll('pre').forEach(function (pre) {
      if (pre.firstElementChild && pre.firstElementChild.nodeName === 'CODE') return;
      var code = raiz.ownerDocument.createElement('code');
      code.textContent = pre.textContent;
      pre.textContent = '';
      pre.appendChild(code);
    });
  }

  // Word guarda cada celda como uno o varios párrafos: los juntamos con <br>.
  // Además la tabla se reconstruye como <thead> (primera fila) + <tbody> (resto):
  // Markdown exige exactamente una fila de encabezado, y Word a veces marca
  // todas las filas como encabezado (o ninguna).
  function limpiarTablas(raiz) {
    var combinadas = false;
    var doc = raiz.ownerDocument;
    raiz.querySelectorAll('table').forEach(function (tabla) {
      var filas = Array.prototype.filter.call(tabla.querySelectorAll('tr'), function (tr) {
        return tr.closest('table') === tabla; // ignora filas de tablas anidadas
      });
      if (filas.length) {
        var thead = doc.createElement('thead');
        var tbody = doc.createElement('tbody');
        filas.forEach(function (tr, i) {
          Array.prototype.slice.call(tr.children).forEach(function (celda) {
            var nueva = doc.createElement(i === 0 ? 'th' : 'td');
            ['colspan', 'rowspan'].forEach(function (at) {
              if (celda.hasAttribute(at)) nueva.setAttribute(at, celda.getAttribute(at));
            });
            nueva.innerHTML = celda.innerHTML;
            // El encabezado ya se ve en negrita; quitamos ** redundantes.
            if (i === 0) nueva.querySelectorAll('strong,b').forEach(function (s) { s.replaceWith.apply(s, Array.prototype.slice.call(s.childNodes)); });
            celda.replaceWith(nueva);
          });
          (i === 0 ? thead : tbody).appendChild(tr);
        });
        // Celdas combinadas → celda + celdas vacías, y todas las filas con el mismo
        // número de columnas (si no, la tabla Markdown se desalinea).
        var maxCols = 0;
        filas.forEach(function (tr) {
          Array.prototype.slice.call(tr.children).forEach(function (celda) {
            var extra = (parseInt(celda.getAttribute('colspan'), 10) || 1) - 1;
            if (extra > 0 || celda.getAttribute('rowspan') > 1) combinadas = true;
            celda.removeAttribute('colspan');
            celda.removeAttribute('rowspan');
            for (var k = 0; k < extra; k++) celda.after(doc.createElement(celda.nodeName.toLowerCase()));
          });
          maxCols = Math.max(maxCols, tr.children.length);
        });
        filas.forEach(function (tr, i) {
          while (tr.children.length < maxCols) tr.appendChild(doc.createElement(i === 0 ? 'th' : 'td'));
        });
        tabla.innerHTML = '';
        tabla.appendChild(thead);
        if (tbody.children.length) tabla.appendChild(tbody);
      }
      tabla.querySelectorAll('td,th').forEach(function (celda) {
        if (celda.getAttribute('colspan') > 1 || celda.getAttribute('rowspan') > 1) combinadas = true;
        var parrafos = Array.prototype.filter.call(celda.children, function (h) { return h.nodeName === 'P'; });
        if (parrafos.length && parrafos.length === celda.children.length) {
          celda.innerHTML = parrafos.map(function (p) { return p.innerHTML; }).join('<br>');
        }
        // Listas dentro de celdas: una línea por elemento.
        celda.querySelectorAll('ul,ol').forEach(function (lista) {
          var items = Array.prototype.map.call(lista.children, function (li, i) {
            return (lista.nodeName === 'OL' ? (i + 1) + '. ' : '• ') + li.innerHTML;
          });
          var span = raiz.ownerDocument.createElement('span');
          span.innerHTML = items.join('<br>');
          lista.replaceWith(span);
        });
      });
    });
    return combinadas;
  }

  function limpiarMarkdown(md) {
    return md
      .replace(/ /g, ' ')
      .replace(/[ \t]+$/gm, '')
      // "# 1\. Título" → "# 1. Título": en un título el punto no crea una lista.
      .replace(/^(#{1,6} \d+)\\\./gm, '$1.')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n';
  }

  function traducirMensajes(mensajes) {
    var vistos = {};
    var salida = [];
    (mensajes || []).forEach(function (m) {
      var texto = m.message || '';
      var estilo = texto.match(/Unrecognised (paragraph|run) style: '([^']*)'/);
      var clave, legible;
      if (estilo && /^(List Paragraph|Párrafo de lista)$/i.test(estilo[2])) {
        return; // párrafo con sangría de lista pero sin viñeta: el texto sale bien
      } else if (estilo) {
        clave = estilo[1] + ':' + estilo[2];
        legible = estilo[1] === 'paragraph'
          ? 'El estilo de párrafo “' + estilo[2] + '” no tiene equivalente en Markdown; quedó como texto normal. Si era un título, usa Título 1, 2, 3…'
          : 'El estilo de texto “' + estilo[2] + '” no tiene equivalente en Markdown; se ignoró.';
      } else if (/w:pict|v:imagedata|image/i.test(texto)) {
        clave = 'imagen'; legible = 'Una imagen o forma no se pudo leer. Usa imágenes “En línea con el texto”.';
      } else if (/comment/i.test(texto)) {
        clave = 'comentario'; legible = 'Los comentarios del documento no se incluyen.';
      } else {
        return; // mensajes técnicos sin utilidad para la persona
      }
      if (!vistos[clave]) { vistos[clave] = true; salida.push(legible); }
    });
    return salida;
  }

  function contar(md, numImagenes) {
    var sinCodigo = md.replace(/```[\s\S]*?```/g, '');
    var titulos = (sinCodigo.match(/^#{1,6} /gm) || []).length;
    var tablas = (sinCodigo.match(/^\|(?: *:?-+:? *\|)+ *$/gm) || []).length;
    var palabras = (sinCodigo.replace(/[#*_>`|\-\[\]()!]/g, ' ').match(/[\wÀ-ÿ]+/g) || []).length;
    return { titulos: titulos, tablas: tablas, imagenes: numImagenes, palabras: palabras };
  }

  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  function escapar(t) {
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Resaltado de Markdown sencillo, línea por línea.
  function resaltar(md) {
    var enCodigo = false;
    return md.split('\n').map(function (linea) {
      var t = escapar(linea);
      if (/^```/.test(linea)) { enCodigo = !enCodigo; return '<span class="c">' + t + '</span>'; }
      if (enCodigo) return '<span class="c">' + t + '</span>';
      if (/^#{1,6} /.test(linea)) return '<span class="h">' + t + '</span>';
      if (/^\|/.test(linea)) {
        if (/^\|(?: *:?-+:? *\|)+ *$/.test(linea)) return '<span class="t">' + t + '</span>';
        return enLinea(t).replace(/(^|[^\\])\|/g, '$1<span class="t">|</span>');
      }
      if (/^&gt;/.test(t)) return '<span class="q">' + enLinea(t) + '</span>';
      t = t.replace(/^(\s*)([-*+]|\d+\.)(\s)/, '$1<span class="l">$2</span>$3');
      return enLinea(t);
    }).join('\n');
  }

  function enLinea(t) {
    return t
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '<span class="i">$&</span>')
      .replace(/(^|[^!])(\[[^\]]+\]\([^)]+\))/g, '$1<span class="k">$2</span>')
      .replace(/\*\*[^*]+\*\*/g, '<span class="b">$&</span>')
      .replace(/`[^`]+`/g, '<span class="c">$&</span>');
  }

  // Quita lo que podría ejecutar código (scripts, iframes, atributos on*, enlaces javascript:).
  function limpiarHtml(r) {
    r.querySelectorAll('script,iframe,object,embed,style,link,meta').forEach(function (n) { n.remove(); });
    r.querySelectorAll('*').forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (at) {
        if (/^on/i.test(at.name) || (/^(href|src)$/i.test(at.name) && /^\s*javascript:/i.test(at.value))) n.removeAttribute(at.name);
      });
    });
  }


  // ---------- Descargas ----------
  function descargarBlob(blob, nombre) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }


  function copiarTexto(texto, mensaje) {
    var copiado = function () { aviso(mensaje); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texto).then(copiado, function () { copiarViejo(texto); copiado(); });
    } else {
      copiarViejo(texto);
      copiado();
    }
  }

  function copiarViejo(texto) {
    var t = document.createElement('textarea');
    t.value = texto;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }

  // Un .zip con varios documentos: los que tienen imágenes van en su carpeta para que las rutas funcionen.
  function agregarAZip(zip, nombre, md, imagenes, carpeta) {
    var destino = carpeta ? zip.folder(carpeta) : zip;
    destino.file(nombre + '.md', md);
    (imagenes || []).forEach(function (img) { destino.file(img.ruta, img.base64, { base64: true }); });
  }

  // ---------- Lo que comparten los demás archivos ----------
  window.wordmd = {
    convertirWord: convertir,
    aviso: aviso,
    descargarBlob: descargarBlob,
    agregarAZip: agregarAZip,
    copiarTexto: copiarTexto,
    nuevoTurndown: nuevoTurndown,
    prepararCodigo: prepararCodigo,
    limpiarMarkdown: limpiarMarkdown,
    limpiarHtml: limpiarHtml,
    resaltar: resaltar,
    escapar: escapar,
    contar: contar,
    plural: plural
    // pestanas.js añade: mostrar, abrirArchivos, cambio… · crear.js añade: editorDoc, editorDatos, datos
  };
})();
