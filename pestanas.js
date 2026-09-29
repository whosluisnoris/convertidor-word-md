/* word.md — pestañas, Inicio, "Mis documentos" y entrada de archivos.
   Cada documento abierto es una pestaña. Los documentos se guardan en localStorage y siguen en
   "Mis documentos" aunque se cierre su pestaña. Se carga al final: arranca la app. */
(function () {
  'use strict';

  var W = window.wordmd, D = W.datos;
  var $ = function (id) { return document.getElementById(id); };
  var el = D.el;

  // =====================================================================
  // 1. Almacén de documentos
  // ---------------------------------------------------------------------
  // wordmd.documentos  → índice [{id, tipo: 'md'|'datos', nombre, formato, actualizado}]
  // wordmd.doc.<id>    → contenido: md {md, imagenes, etiquetas, consejos} · datos {nodo, formato, raiz, codigo}
  // wordmd.pestanas    → {abiertas: [id], activa: id|'inicio'|'guia', guia: bool}
  // =====================================================================
  var CLAVE_INDICE = 'wordmd.documentos', CLAVE_PESTANAS = 'wordmd.pestanas', PREFIJO = 'wordmd.doc.';
  function leer(k) { try { var t = localStorage.getItem(k); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  function escribir(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function borrar(k) { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } }

  var indice = leer(CLAVE_INDICE) || [];
  var estado = leer(CLAVE_PESTANAS) || { abiertas: [], activa: 'inicio', guia: false };
  var memoria = {}; // contenido de cada documento mientras la app está abierta (por si no cabe en localStorage)

  function entrada(id) { return indice.filter(function (d) { return d.id === id; })[0] || null; }
  function extension(d) { return d.tipo === 'md' ? '.md' : '.' + (d.formato || 'json'); }
  function contenido(id) {
    var d = entrada(id);
    var c = memoria[id] || leer(PREFIJO + id);
    if (c) return c;
    return d && d.tipo === 'datos' ? { nodo: D.nuevoNodo('grupo'), formato: d.formato || 'json' } : { md: '' };
  }
  function guardarIndice() { escribir(CLAVE_INDICE, indice); }
  function guardarPestanas() { escribir(CLAVE_PESTANAS, estado); }
  // Devuelve 'ok', 'parcial' (sin imágenes) o 'error' (no cabe).
  function guardarContenido(id, c) {
    memoria[id] = c;
    if (escribir(PREFIJO + id, c)) return 'ok';
    if (c.imagenes && Object.keys(c.imagenes).length) {
      var sin = Object.assign({}, c, { imagenes: {} });
      if (escribir(PREFIJO + id, sin)) return 'parcial';
    }
    return 'error';
  }
  function nuevoId() { return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  // Crea un documento nuevo (y lo guarda). tipo: 'md' | 'datos'
  function crearDocumento(tipo, c, nombre) {
    var id = nuevoId();
    var d = { id: id, tipo: tipo, nombre: D.nombreArchivo(nombre, tipo === 'md' ? 'documento' : 'datos'), formato: tipo === 'datos' ? c.formato || 'json' : 'md', actualizado: Date.now() };
    indice.push(d);
    guardarContenido(id, c);
    guardarIndice();
    return id;
  }

  // =====================================================================
  // 2. Vistas y pestañas
  // =====================================================================
  var VISTAS = ['inicio', 'cargando', 'documento', 'datos', 'guia'];
  function mostrar(nombre) {
    VISTAS.forEach(function (v) { $('vista-' + v).hidden = v !== nombre; });
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent('wordmd:vista', { detail: nombre }));
  }

  var relojGuardado = null;
  // crear.js avisa de cada cambio; se guarda medio segundo después.
  function cambio() {
    W.indicarGuardado('guardando');
    clearTimeout(relojGuardado);
    relojGuardado = setTimeout(guardarActiva, 500);
  }
  function guardarActiva() {
    clearTimeout(relojGuardado);
    relojGuardado = null;
    var d = entrada(estado.activa);
    if (!d) return;
    var c = d.tipo === 'md' ? W.editorDoc.estado() : W.editorDatos.estado();
    d.nombre = D.nombreArchivo(c.nombre, d.tipo === 'md' ? 'documento' : 'datos');
    if (d.tipo === 'datos') d.formato = c.formato;
    d.actualizado = Date.now();
    delete c.nombre;
    var r = guardarContenido(d.id, c);
    guardarIndice();
    W.indicarGuardado(r);
    pintarPestanas();
  }
  // Antes de cambiar de pestaña se guarda lo pendiente.
  function guardarPendiente() { if (relojGuardado) guardarActiva(); }

  function vistaDe(id) {
    if (id === 'inicio' || id === 'guia') return id;
    return entrada(id).tipo === 'md' ? 'documento' : 'datos';
  }
  function activar(id) {
    guardarPendiente();
    if (id !== 'inicio' && id !== 'guia' && !entrada(id)) id = 'inicio';
    // Pulsar la pestaña que ya se ve no recarga nada (se perdería el cursor y el deshacer).
    if (id === estado.activa && !$('vista-' + vistaDe(id)).hidden) { pintarPestanas(); return; }
    if (id === 'guia') estado.guia = true;
    if (estado.activa !== id) estado.anterior = estado.activa;
    estado.activa = id;
    guardarPestanas();
    if (id === 'inicio') { pintarInicio(); mostrar('inicio'); }
    else if (id === 'guia') mostrar('guia');
    else {
      var d = entrada(id), c = Object.assign({ id: id, nombre: d.nombre }, contenido(id));
      if (d.tipo === 'md') { W.editorDoc.cargar(c); mostrar('documento'); }
      else { W.editorDatos.cargar(c); mostrar('datos'); }
      W.indicarGuardado('ok');
      setTimeout(function () { if (d.tipo === 'md') W.editorDoc.enfocar(); }, 0);
    }
    pintarPestanas();
  }
  function abrir(id) {
    if (estado.abiertas.indexOf(id) < 0) estado.abiertas.push(id);
    activar(id);
  }
  function cerrar(id) {
    if (id === 'guia') {
      estado.guia = false;
      if (estado.activa === 'guia') activar(estado.anterior && estado.anterior !== 'guia' ? estado.anterior : 'inicio');
      else { guardarPestanas(); pintarPestanas(); }
      return;
    }
    if (estado.activa === id) guardarPendiente();
    var i = estado.abiertas.indexOf(id);
    if (i < 0) return;
    estado.abiertas.splice(i, 1);
    if (estado.activa === id) activar(estado.abiertas[i] || estado.abiertas[i - 1] || 'inicio');
    else { guardarPestanas(); pintarPestanas(); }
  }
  function borrarDocumento(id) {
    var d = entrada(id);
    if (!d || !window.confirm('¿Borrar “' + d.nombre + extension(d) + '”? No se puede deshacer.')) return;
    if (estado.abiertas.indexOf(id) >= 0) cerrar(id);
    indice = indice.filter(function (x) { return x.id !== id; });
    delete memoria[id];
    borrar(PREFIJO + id);
    guardarIndice();
    pintarInicio();
    W.aviso('Borrado ' + d.nombre + extension(d));
  }

  var CASA = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9.5L10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1z"/></svg>';
  var LIBRO = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4.5h5a2 2 0 0 1 2 2V16a2 2 0 0 0-2-2H3zM17 4.5h-5a2 2 0 0 0-2 2V16a2 2 0 0 1 2-2h5z"/></svg>';
  var CRUZ = '<svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>';
  var MAS = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12"/></svg>';
  var PAPELERA = '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"/></svg>';

  function chipDoc(d) {
    var texto = d.tipo === 'md' ? '#' : d.formato === 'xml' ? '</>' : '{ }';
    return el('span', { clase: 'chip-doc ' + (d.tipo === 'md' ? 'chip-md' : 'chip-datos'), 'aria-hidden': 'true', texto: texto });
  }

  function pintarPestanas() {
    var nav = $('pestanas'), desplazado = nav.scrollLeft;
    nav.innerHTML = '';
    var inicio = el('button', { type: 'button', clase: 'pestana-inicio', 'aria-current': estado.activa === 'inicio' ? 'page' : null, html: CASA + '<span>Inicio</span>' });
    inicio.addEventListener('click', function () { activar('inicio'); });
    nav.appendChild(inicio);
    var pestanas = estado.abiertas.map(entrada).filter(Boolean).map(function (d) {
      return { id: d.id, etiqueta: d.nombre + extension(d), icono: chipDoc(d) };
    });
    if (estado.guia) pestanas.push({ id: 'guia', etiqueta: 'Guía', icono: el('span', { clase: 'icono-guia', html: LIBRO }) });
    pestanas.forEach(function (p) {
      var activa = estado.activa === p.id;
      var abrirB = el('button', { type: 'button', clase: 'pestana-abrir', 'aria-current': activa ? 'page' : null, title: p.etiqueta }, [p.icono, el('span', { clase: 'pestana-nombre', texto: p.etiqueta })]);
      abrirB.addEventListener('click', function () { activar(p.id); });
      var cerrarB = el('button', { type: 'button', clase: 'pestana-cerrar', 'aria-label': 'Cerrar ' + p.etiqueta, title: 'Cerrar', html: CRUZ });
      cerrarB.addEventListener('click', function () { cerrar(p.id); });
      var caja = el('div', { clase: 'pestana' + (activa ? ' activa' : ''), 'data-id': p.id }, [abrirB, cerrarB]);
      // Clic con la rueda del ratón cierra la pestaña, como en el navegador.
      caja.addEventListener('auxclick', function (e) { if (e.button === 1) { e.preventDefault(); cerrar(p.id); } });
      nav.appendChild(caja);
    });
    var mas = el('button', { type: 'button', clase: 'pestana-mas', 'aria-label': 'Nueva pestaña', title: 'Nueva pestaña', 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: MAS });
    mas.addEventListener('click', function () { menuNueva(mas); });
    nav.appendChild(mas);
    $('abrir-guia').hidden = estado.guia;
    // Se mueve solo la fila de pestañas, nunca la página: esto corre en cada guardado
    // automático, y scrollIntoView() subía la página hasta la barra mientras se escribía.
    nav.scrollLeft = desplazado;
    var activa = nav.querySelector('.pestana.activa');
    if (activa) {
      var caja = nav.getBoundingClientRect(), p = activa.getBoundingClientRect();
      if (p.left < caja.left) nav.scrollLeft += p.left - caja.left;
      else if (p.right > caja.right) nav.scrollLeft += p.right - caja.right;
    }
  }

  function menuNueva(boton) {
    var opciones = [
      { id: 'documento', nombre: 'Documento nuevo', ayuda: 'Se guarda como .md', chip: '#', chipClase: 't-titulo' },
      { id: 'datos', nombre: 'Datos nuevos', ayuda: 'Se guardan como .json o .xml', chip: '{ }', chipClase: 't-bloque' },
      { id: 'convertir', nombre: 'Convertir un archivo', ayuda: 'Word, Excel o PowerPoint', chip: 'W', chipClase: 't-texto' },
      { id: 'abrir', nombre: 'Abrir un archivo', ayuda: '.md, .json o .xml de tu computadora', chip: '↑', chipClase: 't-crudo' }
    ];
    if (estado.abiertas.length > 1) {
      opciones.push({ separador: true });
      opciones.push({ id: 'zip', nombre: 'Descargar todas las pestañas', ayuda: 'Un .zip con los ' + estado.abiertas.length + ' documentos abiertos', chip: 'zip', chipClase: 't-crudo' });
    }
    D.abrirMenu(boton, 'Abrir en una pestaña nueva', opciones, function (id) {
      if (id === 'documento') nuevoDocumento();
      else if (id === 'datos') nuevosDatos();
      else if (id === 'convertir') $('entrada').click();
      else if (id === 'abrir') $('crear-abrir').click();
      else if (id === 'zip') descargarTodas();
    });
  }
  function nuevoDocumento() { abrir(crearDocumento('md', { md: '' }, 'documento')); }
  function nuevosDatos() { abrir(crearDocumento('datos', { nodo: D.nuevoNodo('grupo'), formato: 'json', raiz: 'datos' }, 'datos')); }

  // Texto del documento de una pestaña (para descargar todas y para analizar).
  function textoDe(id) {
    if (id === estado.activa) guardarPendiente();
    var d = entrada(id), c = contenido(id);
    if (d.tipo === 'md') return c.md || '';
    if (c.codigo) return c.codigo;
    return d.formato === 'xml' ? D.aXmlDocumento(c.nodo, c.raiz) : D.aJson(c.nodo);
  }
  function descargarTodas() {
    guardarPendiente();
    var zip = new JSZip(), usados = {};
    var unico = function (base) { var n = base, i = 2; while (usados[n.toLowerCase()]) n = base + ' (' + (i++) + ')'; usados[n.toLowerCase()] = true; return n; };
    estado.abiertas.map(entrada).filter(Boolean).forEach(function (d) {
      var c = contenido(d.id), nombre = unico(d.nombre);
      if (d.tipo === 'md') {
        var imagenes = Object.keys(c.imagenes || {}).map(function (r) { return { ruta: r, base64: c.imagenes[r].base64 }; });
        W.agregarAZip(zip, nombre, c.md || '', imagenes, imagenes.length ? nombre : '');
      } else {
        zip.file(nombre + '.' + d.formato, textoDe(d.id) + '\n');
      }
    });
    zip.generateAsync({ type: 'blob' }).then(function (blob) {
      W.descargarBlob(blob, 'documentos.zip');
      W.aviso('Descargadas ' + W.plural(estado.abiertas.length, 'pestaña', 'pestañas'));
    });
  }

  // =====================================================================
  // 3. Inicio: "Mis documentos" y plantillas
  // =====================================================================
  function fechaCorta(ms) {
    var d = new Date(ms), hoy = new Date();
    var mismoDia = function (a, b) { return a.toDateString() === b.toDateString(); };
    var hora = d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    if (mismoDia(d, hoy)) return 'Hoy, ' + hora;
    var ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
    if (mismoDia(d, ayer)) return 'Ayer, ' + hora;
    try { return d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: d.getFullYear() === hoy.getFullYear() ? undefined : 'numeric' }); }
    catch (e) { return d.toDateString(); }
  }
  function pintarInicio() {
    var lista = $('lista-documentos');
    lista.innerHTML = '';
    var docs = indice.slice().sort(function (a, b) { return (b.actualizado || 0) - (a.actualizado || 0); });
    $('mis-documentos-vacio').hidden = docs.length > 0;
    docs.forEach(function (d) {
      var abierta = estado.abiertas.indexOf(d.id) >= 0;
      var nombre = d.nombre + extension(d);
      var abrirB = el('button', { type: 'button', clase: 'doc-abrir', title: 'Abrir ' + nombre }, [chipDoc(d), el('span', { clase: 'doc-nombre', texto: nombre })]);
      abrirB.addEventListener('click', function () { abrir(d.id); });
      var borrarB = el('button', { type: 'button', clase: 'btn-quitar', 'aria-label': 'Borrar ' + nombre, title: 'Borrar', html: PAPELERA });
      borrarB.addEventListener('click', function () { borrarDocumento(d.id); });
      lista.appendChild(el('li', { clase: 'doc-fila' }, [
        abrirB,
        abierta ? el('span', { clase: 'doc-abierto', texto: 'Abierto' }) : el('span', { clase: 'doc-fecha', texto: fechaCorta(d.actualizado) }),
        borrarB
      ]));
    });
  }

  var PLANTILLAS = {
    productos: function () {
      return crearDocumento('datos', {
        formato: 'json', raiz: 'tienda', nodo: {
          tipo: 'grupo', campos: [
            D.campo('Nombre', { tipo: 'texto', valor: 'Café La Esquina' }),
            D.campo('Teléfono', { tipo: 'texto', valor: '55 1234 5678' }),
            D.campo('Abierto hoy', { tipo: 'sino', valor: true }),
            D.campo('Servicios', { tipo: 'lista', tipoElem: 'texto', valor: ['Wifi', 'Terraza', 'Para llevar'] }),
            D.campo('Productos', {
              tipo: 'tabla', fila: 'producto',
              columnas: [D.columna('Nombre', 'texto'), D.columna('Precio', 'numero'), D.columna('Disponible', 'sino')],
              filas: [['Café americano', 35, true], ['Capuchino', 48, true], ['Pan de elote', 30, false]]
            })
          ]
        }
      }, 'productos');
    },
    contactos: function () {
      return crearDocumento('datos', {
        formato: 'json', raiz: 'agenda', nodo: {
          tipo: 'grupo', campos: [D.campo('Contactos', {
            tipo: 'tabla', fila: 'contacto',
            columnas: [D.columna('Nombre', 'texto'), D.columna('Correo', 'texto'), D.columna('Teléfono', 'texto'), D.columna('Es cliente', 'sino')],
            filas: [['Ana López', 'ana@ejemplo.com', '55 1111 2222', true], ['Luis Pérez', 'luis@ejemplo.com', '55 3333 4444', false]]
          })]
        }
      }, 'contactos');
    },
    configuracion: function () {
      return crearDocumento('datos', {
        formato: 'xml', raiz: 'configuracion', nodo: {
          tipo: 'grupo', campos: [
            D.campo('Nombre de la app', { tipo: 'texto', valor: 'Mi tienda' }),
            D.campo('Idioma', { tipo: 'texto', valor: 'es' }),
            D.campo('Modo oscuro', { tipo: 'sino', valor: false }),
            D.campo('Máximo de usuarios', { tipo: 'numero', valor: 25 }),
            D.campo('Avisos', { tipo: 'grupo', campos: [D.campo('Por correo', { tipo: 'sino', valor: true }), D.campo('Por SMS', { tipo: 'sino', valor: false })] })
          ]
        }
      }, 'configuracion');
    },
    acta: function () {
      return crearDocumento('md', {
        md: '# Acta de reunión\n\n**Fecha:** ' + D.hoy() + ' · **Equipo:** Ventas\n\n## Asistentes\n\n- Ana\n- Luis\n\n' +
          '## Acuerdos\n\n1. Enviar la propuesta el viernes\n2. Revisar precios con Finanzas\n\n## Pendientes\n\n' +
          '```json\n[\n  { "tarea": "Propuesta", "responsable": "Ana", "hecho": false },\n  { "tarea": "Precios", "responsable": "Luis", "hecho": true }\n]\n```\n'
      }, 'acta-de-reunion');
    }
  };

  // =====================================================================
  // 4. Recibir archivos: convertir Word/Excel/PowerPoint y abrir .md/.json/.xml
  // =====================================================================
  var RECHAZOS = {
    doc: 'Los archivos .doc antiguos no se pueden leer. Ábrelo en Word y usa Archivo › Guardar como › Documento de Word (.docx).',
    xls: 'Los archivos .xls antiguos no se pueden leer. Ábrelo en Excel y usa Archivo › Guardar como › Libro de Excel (.xlsx).',
    ppt: 'Los archivos .ppt antiguos no se pueden leer. Ábrelo en PowerPoint y usa Archivo › Guardar como › Presentación de PowerPoint (.pptx).'
  };
  function tipoDeArchivo(nombre) {
    var ext = (nombre.match(/\.([^.]+)$/) || [])[1];
    ext = (ext || '').toLowerCase();
    if (ext === 'docx') return 'word';
    if (ext === 'xlsx' || ext === 'xlsm') return 'excel';
    if (ext === 'pptx') return 'powerpoint';
    if (ext === 'md' || ext === 'markdown' || ext === 'txt') return 'md';
    if (ext === 'json' || ext === 'xml') return ext;
    if (RECHAZOS[ext]) return 'viejo-' + ext;
    return null;
  }
  function leerBuffer(archivo) {
    if (archivo.arrayBuffer) return archivo.arrayBuffer();
    return new Promise(function (ok, mal) {
      var r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = function () { mal(r.error); };
      r.readAsArrayBuffer(archivo);
    });
  }
  function base(nombre) { return nombre.replace(/\.[^.]+$/, ''); }
  function mapaImagenes(lista) {
    var m = {};
    (lista || []).forEach(function (i) { m[i.ruta] = { tipo: i.tipo, base64: i.base64 }; });
    return m;
  }

  // Un diálogo con opciones grandes; devuelve el id elegido o null.
  function elegir(o) {
    var d = $('dialogo-opciones');
    $('opciones-titulo').textContent = o.titulo;
    $('opciones-texto').textContent = o.texto || '';
    var lista = $('opciones-lista');
    lista.innerHTML = '';
    o.opciones.forEach(function (op) {
      lista.appendChild(el('button', { clase: 'opcion-dialogo', value: op.id }, [
        el('span', { clase: 'chip-tipo ' + (op.chipClase || ''), 'aria-hidden': 'true', texto: op.chip }),
        el('span', { clase: 'menu-textos' }, [el('span', { clase: 'menu-nombre', texto: op.nombre }), el('span', { clase: 'menu-ayuda', texto: op.ayuda })])
      ]));
    });
    if (!d.showModal) return Promise.resolve(window.confirm(o.titulo + '\n\n' + o.opciones[0].nombre + '?') ? o.opciones[0].id : o.opciones[1].id);
    return new Promise(function (ok) {
      var alCerrar = function () { d.removeEventListener('close', alCerrar); ok(d.returnValue && d.returnValue !== 'cancelar' ? d.returnValue : null); };
      d.returnValue = '';
      d.addEventListener('close', alCerrar);
      d.showModal();
    });
  }

  // Cada archivo → {tipo, contenido, nombre} (o lanza un error con un mensaje para la persona).
  function importar(archivo, tipo) {
    var nombre = base(archivo.name);
    if (tipo === 'word') {
      return W.convertirWord(archivo).then(function (r) {
        return { tipo: 'md', nombre: r.nombre, contenido: { md: r.md, imagenes: mapaImagenes(r.imagenes), consejos: r.consejos } };
      });
    }
    if (tipo === 'powerpoint') {
      return leerBuffer(archivo).then(function (b) { return W.importar.leerPowerPoint(b, nombre); }).then(function (r) {
        return { tipo: 'md', nombre: nombre, contenido: { md: r.md, imagenes: mapaImagenes(r.imagenes), consejos: r.consejos } };
      });
    }
    if (tipo === 'excel') {
      return leerBuffer(archivo).then(W.importar.leerExcel).then(function (libro) {
        if (!libro.hojas.length) throw new Error('El libro “' + archivo.name + '” está vacío.');
        return elegir({
          titulo: '¿Cómo quieres usar “' + archivo.name + '”?',
          texto: libro.hojas.length > 1 ? 'Tiene ' + libro.hojas.length + ' hojas; cada una será una tabla.' : '',
          opciones: [
            { id: 'datos', nombre: 'Como datos', ayuda: 'Un archivo .json o .xml que otros programas pueden leer', chip: '{ }', chipClase: 't-bloque' },
            { id: 'md', nombre: 'Como tabla en un documento', ayuda: 'Un documento .md con una tabla por hoja', chip: '#', chipClase: 't-titulo' }
          ]
        }).then(function (eleccion) {
          if (!eleccion) return null;
          if (eleccion === 'md') return { tipo: 'md', nombre: nombre, contenido: { md: W.importar.excelAMarkdown(nombre, libro), consejos: libro.consejos } };
          var nodo = { tipo: 'grupo', campos: libro.hojas.map(function (h) { return D.campo(h.nombre, D.tablaDesdeCeldas(h.filas)); }) };
          return { tipo: 'datos', nombre: nombre, contenido: { nodo: nodo, formato: 'json', raiz: 'datos' } };
        });
      });
    }
    return D.leerTexto(archivo).then(function (texto) {
      texto = texto.replace(/^\uFEFF/, '');
      if (tipo === 'md') return { tipo: 'md', nombre: nombre, contenido: { md: texto } };
      try {
        var r = D.leerDatos(texto, tipo);
        return { tipo: 'datos', nombre: nombre, contenido: { nodo: r.nodo, formato: tipo, raiz: r.nombre || 'datos' } };
      } catch (e) {
        if (!(e instanceof D.ErrorDatos)) throw e;
        // Con errores se abre igual, en la vista de código y con la línea marcada.
        return { tipo: 'datos', nombre: nombre, contenido: { nodo: D.nuevoNodo('grupo'), formato: tipo, raiz: 'datos', codigo: texto } };
      }
    });
  }

  function mostrarError(texto) {
    var e = $('error-inicio');
    e.textContent = texto || '';
    e.hidden = !texto;
  }

  function recibirArchivos(lista) {
    var archivos = Array.prototype.slice.call(lista || []);
    if (!archivos.length) return Promise.resolve([]);
    var validos = [], problemas = [];
    archivos.forEach(function (a) {
      var t = tipoDeArchivo(a.name);
      if (!t) problemas.push('“' + a.name + '” no es un archivo que se pueda abrir. Se aceptan Word (.docx), Excel (.xlsx), PowerPoint (.pptx), .md, .json y .xml.');
      else if (/^viejo-/.test(t)) problemas.push(RECHAZOS[t.slice(6)]);
      else validos.push({ archivo: a, tipo: t });
    });
    mostrarError('');
    if (!validos.length) {
      if (estado.activa !== 'inicio') activar('inicio');
      mostrarError(problemas.join(' '));
      return Promise.resolve([]);
    }
    var hayConversion = validos.some(function (v) { return /word|excel|powerpoint/.test(v.tipo); });
    var volverA = estado.activa;
    if (hayConversion) mostrar('cargando');
    var nuevos = [], cadena = Promise.resolve();
    validos.forEach(function (v, i) {
      cadena = cadena.then(function () {
        $('texto-cargando').textContent = validos.length > 1 ? 'Abriendo ' + (i + 1) + ' de ' + validos.length + '…' : 'Abriendo ' + v.archivo.name + '…';
        return importar(v.archivo, v.tipo).then(function (r) {
          if (r) nuevos.push(crearDocumento(r.tipo, r.contenido, r.nombre));
        }, function (err) {
          console.error(err);
          problemas.push('No se pudo leer “' + v.archivo.name + '”. Puede estar dañado o protegido con contraseña.' + (err && err.message && /vacío/.test(err.message) ? ' ' + err.message : ''));
        });
      });
    });
    return cadena.then(function () {
      if (!nuevos.length) {
        activar(problemas.length ? 'inicio' : volverA);
        if (problemas.length) mostrarError(problemas.join(' '));
        return nuevos;
      }
      nuevos.forEach(function (id) { if (estado.abiertas.indexOf(id) < 0) estado.abiertas.push(id); });
      // Lo que no se pudo abrir se avisa también en los consejos del primer documento (un aviso flotante se pierde fácil).
      var primero = entrada(nuevos[0]);
      if (problemas.length && primero.tipo === 'md') {
        var c = contenido(primero.id);
        c.consejos = problemas.concat(c.consejos || []);
        guardarContenido(primero.id, c);
      }
      activar(nuevos[0]);
      if (problemas.length) W.aviso(problemas[0]);
      else if (nuevos.length > 1) W.aviso('Se abrieron ' + nuevos.length + ' documentos, uno en cada pestaña');
      return nuevos;
    });
  }

  // =====================================================================
  // 5. Eventos
  // =====================================================================
  function prepararZona(zona) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) { e.preventDefault(); zona.classList.add('activo'); });
    });
    ['dragleave', 'dragend', 'drop'].forEach(function (ev) {
      zona.addEventListener(ev, function (e) { if (ev === 'drop' || !zona.contains(e.relatedTarget)) zona.classList.remove('activo'); });
    });
  }
  prepararZona($('soltar'));
  ['entrada', 'crear-abrir'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      var archivos = this.files;
      recibirArchivos(archivos);
      this.value = '';
    });
  });
  // Soltar archivos en cualquier parte los abre (salvo dentro de un editor de texto, que tiene su propio manejo).
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    var hay = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length;
    if (!hay && e.target.closest && e.target.closest('[contenteditable="true"], textarea, input')) return;
    e.preventDefault();
    if (hay) recibirArchivos(e.dataTransfer.files);
  });

  $('crear-documento').addEventListener('click', nuevoDocumento);
  $('crear-datos').addEventListener('click', nuevosDatos);
  document.querySelectorAll('[data-plantilla]').forEach(function (b) {
    b.addEventListener('click', function () { abrir(PLANTILLAS[b.dataset.plantilla]()); });
  });
  $('logo').addEventListener('click', function (e) { e.preventDefault(); activar('inicio'); });
  $('abrir-guia').addEventListener('click', function () { activar('guia'); });
  document.querySelectorAll('[data-ir]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); activar(a.dataset.ir === 'guia' ? 'guia' : 'inicio'); });
  });
  // Guardar antes de cerrar o recargar la página.
  window.addEventListener('beforeunload', guardarPendiente);
  document.addEventListener('visibilitychange', function () { if (document.hidden) guardarPendiente(); });

  // =====================================================================
  // 6. Arranque
  // =====================================================================
  // Versiones anteriores guardaban un solo documento y un solo archivo de datos.
  (function migrar() {
    var viejoDoc = leer('wordmd.crear.documento'), viejosDatos = leer('wordmd.crear.datos');
    if (viejoDoc && (viejoDoc.md || '').trim()) crearDocumento('md', { md: viejoDoc.md, imagenes: viejoDoc.imagenes || {} }, viejoDoc.nombre);
    if (viejosDatos && (viejosDatos.nodo || viejosDatos.codigo)) {
      crearDocumento('datos', { nodo: viejosDatos.nodo || D.nuevoNodo('grupo'), formato: viejosDatos.formato || 'json', raiz: viejosDatos.raiz || 'datos', codigo: viejosDatos.codigo || null }, viejosDatos.nombre);
    }
    borrar('wordmd.crear.documento');
    borrar('wordmd.crear.datos');
  })();

  estado.abiertas = (estado.abiertas || []).filter(function (id) { return !!entrada(id); });
  W.mostrar = mostrar;
  W.cambio = cambio;
  W.abrirArchivos = recibirArchivos;
  W.pestanas = {
    activar: activar, abrir: abrir, cerrar: cerrar, crear: crearDocumento, recibir: recibirArchivos,
    estado: function () { return estado; }, indice: function () { return indice; }, guardar: guardarPendiente,
    // Lo que se analiza: el documento de la pestaña activa, como texto.
    documentoActivo: function () {
      var d = entrada(estado.activa);
      return d ? { id: d.id, tipo: d.tipo, nombre: d.nombre + extension(d), formato: d.tipo === 'md' ? 'md' : d.formato, texto: textoDe(d.id) } : null;
    }
  };

  var inicial = location.hash === '#guia' ? 'guia' : estado.activa || 'inicio';
  activar(inicial);
})();
