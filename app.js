/* word.md — convierte .docx a Markdown dentro del navegador, sin internet.
   Flujo: .docx → (mammoth) HTML → limpieza → (turndown + gfm) Markdown → vista previa (marked). */
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

  // ---------- Estado ----------
  var estado = { archivos: [], actual: 0 };

  // ---------- Elementos ----------
  var $ = function (id) { return document.getElementById(id); };
  var vistas = {
    inicio: $('vista-inicio'), cargando: $('vista-cargando'),
    resultado: $('vista-resultado'), guia: $('vista-guia'),
    crear: $('vista-crear'), documento: $('vista-documento'), datos: $('vista-datos')
  };
  // Cada vista pertenece a una sección del menú; al volver a una sección se abre su última vista.
  var SECCION = {
    inicio: 'convertir', cargando: 'convertir', resultado: 'convertir',
    crear: 'crear', documento: 'crear', datos: 'crear', guia: 'guia'
  };
  var ultimaVista = { convertir: 'inicio', crear: 'crear', guia: 'guia' };
  var seccionActual = 'convertir';

  function mostrar(nombre) {
    Object.keys(vistas).forEach(function (k) { vistas[k].hidden = k !== nombre; });
    seccionActual = SECCION[nombre];
    ultimaVista[seccionActual] = nombre;
    document.querySelectorAll('.nav a').forEach(function (a) {
      if (a.dataset.ir === seccionActual) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('wordmd:vista', { detail: nombre }));
  }

  function irA(destino) {
    mostrar(ultimaVista[destino] || 'inicio');
  }

  document.querySelectorAll('[data-ir]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      try { history.replaceState(null, '', '#' + a.dataset.ir); } catch (err) { /* algunos navegadores lo bloquean en file:// */ }
      irA(a.dataset.ir);
    });
  });

  var avisoTimer;
  function aviso(texto) {
    var t = $('toast');
    t.textContent = texto;
    t.hidden = false;
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function errorInicio(texto) {
    var e = $('error-inicio');
    e.textContent = texto;
    e.hidden = !texto;
  }

  // ---------- Entrada de archivos ----------
  function prepararZona(zona, input) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('activo'); });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) {
        if (!zona.contains(e.relatedTarget)) zona.classList.remove('activo');
      });
    });
    zona.addEventListener('drop', function (e) {
      e.preventDefault();
      zona.classList.remove('activo');
      recibir(e.dataTransfer.files);
    });
    input.addEventListener('change', function () {
      recibir(input.files);
      input.value = '';
    });
  }
  prepararZona($('soltar'), $('entrada'));
  prepararZona(document.querySelector('.otro'), $('entrada-otro'));
  // Evita que el navegador abra el archivo si se suelta fuera de la zona.
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    var hayArchivos = e.dataTransfer && e.dataTransfer.files.length;
    // Arrastrar texto dentro de un editor debe seguir funcionando.
    if (!hayArchivos && e.target.closest && e.target.closest('[contenteditable="true"], textarea, input')) return;
    e.preventDefault();
    if (!hayArchivos) return;
    if (seccionActual === 'convertir') recibir(e.dataTransfer.files);
    else if (seccionActual === 'crear' && window.wordmd.alSoltar) window.wordmd.alSoltar(e.dataTransfer.files);
  });

  function recibir(lista) {
    var todos = Array.prototype.slice.call(lista || []);
    if (!todos.length) return;
    var docx = todos.filter(function (f) { return /\.docx$/i.test(f.name); });
    var rechazados = todos.filter(function (f) { return !/\.docx$/i.test(f.name); });

    if (!docx.length) {
      var doc = rechazados.some(function (f) { return /\.doc$/i.test(f.name); });
      mostrar('inicio');
      errorInicio(doc
        ? 'Los archivos .doc antiguos no se pueden leer. Ábrelo en Word y usa Archivo › Guardar como › Documento de Word (.docx).'
        : 'Solo se pueden convertir archivos .docx de Word. Revisa que el archivo termine en .docx.');
      return;
    }
    errorInicio('');
    convertirTodos(docx, rechazados);
  }

  // ---------- Conversión ----------
  function convertirTodos(archivos, rechazados) {
    mostrar('cargando');
    var resultados = [];
    var cadena = Promise.resolve();
    archivos.forEach(function (archivo, i) {
      cadena = cadena.then(function () {
        $('texto-cargando').textContent = archivos.length > 1
          ? 'Convirtiendo ' + (i + 1) + ' de ' + archivos.length + '…'
          : 'Convirtiendo ' + archivo.name + '…';
        return convertir(archivo).then(function (r) { resultados.push(r); }, function (err) {
          console.error(err);
          resultados.push({ nombre: archivo.name, error: true });
        });
      });
    });
    cadena.then(function () {
      var buenos = resultados.filter(function (r) { return !r.error; });
      var malos = resultados.filter(function (r) { return r.error; });
      if (!buenos.length) {
        mostrar('inicio');
        errorInicio('No se pudo leer ' + (malos.length > 1 ? 'ningún archivo' : '“' + malos[0].nombre + '”') +
          '. Puede estar dañado o protegido con contraseña. Ábrelo en Word, guárdalo de nuevo como .docx e inténtalo otra vez.');
        return;
      }
      if (malos.length || rechazados.length) {
        var nombres = malos.map(function (m) { return m.nombre; })
          .concat(rechazados.map(function (f) { return f.name; }));
        buenos[0].consejos.unshift('No se pudo convertir: ' + nombres.join(', ') + '. Solo se aceptan .docx sin contraseña.');
      }
      estado.archivos = buenos;
      estado.actual = 0;
      pintarResultado();
      mostrar('resultado');
    });
  }

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

  // ---------- Pintar resultado ----------
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }

  function pintarResultado() {
    var lista = estado.archivos;
    var a = lista[estado.actual];

    $('res-nombre').textContent = a.nombre + '.md';
    var e = a.estadisticas;
    var chips = [
      plural(e.titulos, 'título', 'títulos'),
      plural(e.tablas, 'tabla', 'tablas'),
      plural(e.imagenes, 'imagen', 'imágenes'),
      plural(e.palabras, 'palabra', 'palabras')
    ];
    $('res-chips').innerHTML = '';
    chips.forEach(function (c) {
      var s = document.createElement('span');
      s.textContent = c;
      $('res-chips').appendChild(s);
    });

    // Lista de archivos (solo si hay varios)
    var hayVarios = lista.length > 1;
    $('res-archivos').hidden = !hayVarios;
    $('btn-todos').hidden = !hayVarios;
    if (hayVarios) {
      $('res-archivos-titulo').textContent = lista.length + ' archivos convertidos';
      var cont = $('res-archivos-lista');
      cont.innerHTML = '';
      lista.forEach(function (arch, i) {
        var b = document.createElement('button');
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', i === estado.actual ? 'true' : 'false');
        b.innerHTML = '<span class="punto' + (arch.consejos.length ? ' aviso' : '') + '"></span><span class="texto"></span>';
        b.querySelector('.texto').textContent = arch.nombre;
        b.title = arch.consejos.length ? 'Tiene consejos' : 'Listo';
        b.addEventListener('click', function () { estado.actual = i; pintarResultado(); });
        cont.appendChild(b);
      });
    }

    $('btn-descargar').textContent = a.imagenes.length ? 'Descargar .zip' : 'Descargar .md';

    // Consejos
    var caja = $('res-consejos');
    caja.hidden = !a.consejos.length;
    caja.innerHTML = '';
    if (a.consejos.length) {
      var titulo = document.createElement('b');
      titulo.textContent = a.consejos.length === 1 ? 'Consejo' : 'Consejos';
      var ul = document.createElement('ul');
      a.consejos.forEach(function (c) {
        var li = document.createElement('li');
        li.textContent = c;
        ul.appendChild(li);
      });
      caja.appendChild(titulo);
      caja.appendChild(ul);
    }

    $('res-md').innerHTML = resaltar(a.md);
    $('res-previa').innerHTML = vistaPrevia(a);
    $('res-md').scrollTop = 0;
    $('res-previa').scrollTop = 0;
  }

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

  // Vista previa: las rutas "imagenes/…" se sustituyen por la imagen real en memoria.
  function vistaPrevia(a) {
    var html = marked.parse(a.md, { gfm: true, breaks: false });
    var dom = new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html');
    var r = dom.getElementById('r');
    limpiarHtml(r);
    var porRuta = {};
    a.imagenes.forEach(function (img) { porRuta[img.ruta] = img; });
    r.querySelectorAll('img').forEach(function (img) {
      var dato = porRuta[img.getAttribute('src')];
      if (dato) img.setAttribute('src', 'data:' + dato.tipo + ';base64,' + dato.base64);
    });
    r.querySelectorAll('a[href]').forEach(function (l) {
      if (!/^#/.test(l.getAttribute('href'))) { l.target = '_blank'; l.rel = 'noopener'; }
    });
    return r.innerHTML;
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

  function blobMd(texto) { return new Blob([texto], { type: 'text/markdown;charset=utf-8' }); }

  function agregarAZip(zip, a, carpeta) {
    var destino = carpeta ? zip.folder(carpeta) : zip;
    destino.file(a.nombre + '.md', a.md);
    a.imagenes.forEach(function (img) { destino.file(img.ruta, img.base64, { base64: true }); });
  }

  $('btn-descargar').addEventListener('click', function () {
    var a = estado.archivos[estado.actual];
    if (!a.imagenes.length) {
      descargarBlob(blobMd(a.md), a.nombre + '.md');
      aviso('Descargado ' + a.nombre + '.md');
      return;
    }
    var zip = new JSZip();
    agregarAZip(zip, a, '');
    zip.generateAsync({ type: 'blob' }).then(function (blob) {
      descargarBlob(blob, a.nombre + '.zip');
      aviso('Descargado ' + a.nombre + '.zip');
    });
  });

  $('btn-todos').addEventListener('click', function () {
    var zip = new JSZip();
    var usados = {};
    estado.archivos.forEach(function (a) {
      var carpeta = a.nombre, n = 2;
      while (usados[carpeta]) carpeta = a.nombre + ' (' + (n++) + ')';
      usados[carpeta] = true;
      // Sin imágenes, el .md va suelto; con imágenes, en su carpeta para que las rutas funcionen.
      agregarAZip(zip, a, a.imagenes.length || carpeta !== a.nombre ? carpeta : '');
    });
    zip.generateAsync({ type: 'blob' }).then(function (blob) {
      descargarBlob(blob, 'markdown.zip');
      aviso('Descargados ' + estado.archivos.length + ' archivos');
    });
  });

  $('btn-copiar').addEventListener('click', function () {
    copiarTexto(estado.archivos[estado.actual].md, 'Markdown copiado');
  });

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

  // ---------- Pestañas en móvil ----------
  var botonesPestana = document.querySelectorAll('.pestanas-movil button');
  function elegirPestana(panel) {
    botonesPestana.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.panel === panel ? 'true' : 'false'); });
    document.querySelectorAll('.panel-der .columna').forEach(function (c) {
      if (c.dataset.col === panel) c.removeAttribute('data-oculta');
      else c.setAttribute('data-oculta', '');
    });
  }
  botonesPestana.forEach(function (b) { b.addEventListener('click', function () { elegirPestana(b.dataset.panel); }); });
  elegirPestana('md');

  // ---------- Lo que comparte con crear.js ----------
  window.wordmd = {
    mostrar: mostrar,
    aviso: aviso,
    recibir: recibir,
    descargarBlob: descargarBlob,
    copiarTexto: copiarTexto,
    nuevoTurndown: nuevoTurndown,
    prepararCodigo: prepararCodigo,
    limpiarMarkdown: limpiarMarkdown,
    limpiarHtml: limpiarHtml,
    resaltar: resaltar,
    escapar: escapar,
    contar: contar,
    plural: plural,
    alSoltar: null // lo define crear.js
  };

  // Abrir directamente la guía o la sección Crear si la dirección lo pide.
  document.addEventListener('DOMContentLoaded', function () {
    if (location.hash === '#guia') irA('guia');
    else if (location.hash === '#crear') irA('crear');
  });
})();
