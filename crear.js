/* word.md — sección "Crear": escribir documentos Markdown (que pueden llevar secciones de datos
   JSON/XML) y armar archivos .json/.xml con un formulario, sin saber programar.
   Usa lo que comparte app.js en window.wordmd. Todo funciona sin internet y desde file://. */
(function () {
  'use strict';

  var W = window.wordmd;
  var $ = function (id) { return document.getElementById(id); };

  // =====================================================================
  // 1. Modelo de datos
  // ---------------------------------------------------------------------
  // Un "nodo" describe un dato tal como lo ve la persona:
  //   {tipo: 'texto'|'numero'|'sino'|'fecha', valor}
  //   {tipo: 'lista', tipoElem: 'texto'|'numero', valor: [...]}
  //   {tipo: 'tabla', fila: 'producto', columnas: [{etiqueta, clave, tipo}], filas: [[...], ...]}
  //   {tipo: 'grupo', campos: [{etiqueta, clave, nodo}]}
  //   {tipo: 'crudo', valor: <JSON>}   ← formas que el formulario no sabe mostrar
  // "etiqueta" es el nombre que ve la persona ("Fecha de apertura") y "clave" el
  // que se escribe en el archivo ("fecha_de_apertura").
  // =====================================================================

  var TIPOS = {
    texto: { nombre: 'Texto', ayuda: 'Un nombre, una dirección, una nota', chip: 'Aa', nuevo: 'Texto nuevo' },
    numero: { nombre: 'Número', ayuda: 'Un precio, una cantidad, una edad', chip: '123', nuevo: 'Número nuevo' },
    sino: { nombre: 'Sí / No', ayuda: 'Algo que se cumple o no: activo, pagado…', chip: 'S/N', nuevo: 'Activo' },
    fecha: { nombre: 'Fecha', ayuda: 'Un día del calendario', chip: '31', nuevo: 'Fecha' },
    lista: { nombre: 'Lista', ayuda: 'Varias palabras: etiquetas, colores, servicios', chip: '• • •', nuevo: 'Lista' },
    tabla: { nombre: 'Tabla', ayuda: 'Varias filas con las mismas columnas', chip: 'Tabla', nuevo: 'Tabla' },
    grupo: { nombre: 'Grupo', ayuda: 'Varios campos juntos, como una dirección', chip: '{ }', nuevo: 'Grupo' },
    crudo: { nombre: 'JSON', ayuda: '', chip: 'JSON', nuevo: 'Datos' }
  };
  var SIMPLES = ['texto', 'numero', 'sino', 'fecha'];
  var AGREGABLES = ['texto', 'numero', 'sino', 'fecha', 'lista', 'tabla', 'grupo'];
  var RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
  var RE_NUMERO = /^-?(0|[1-9]\d*)(\.\d+)?$/;

  function ErrorDatos(mensaje, linea) { this.message = mensaje; this.linea = linea || null; }

  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()); }
  function sinAcentos(t) { return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function esSimple(tipo) { return SIMPLES.indexOf(tipo) >= 0; }
  function esPrimitivo(v) { return v === null || typeof v !== 'object'; }
  function esObjeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function copia(v) { return JSON.parse(JSON.stringify(v)); }

  // "Fecha de apertura" → "fecha_de_apertura"
  function aClave(t) {
    var s = sinAcentos(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return s || 'campo';
  }
  // "fecha_de_apertura" → "Fecha de apertura" (si el camino de vuelta da la misma clave)
  function etiquetaDe(k) {
    if (/^[a-z][a-z0-9_]*$/.test(k)) {
      var h = k.replace(/_/g, ' ');
      h = h.charAt(0).toUpperCase() + h.slice(1);
      if (aClave(h) === k) return h;
    }
    return k;
  }
  // Dos campos con la misma clave se pisarían en el archivo: el segundo pasa a ser "clave_2".
  function clavesUnicas(lista) {
    var usadas = {};
    return lista.map(function (c) {
      var base = c.clave || aClave(c.etiqueta), k = base, n = 2;
      while (usadas[k]) k = base + '_' + (n++);
      usadas[k] = true;
      return k;
    });
  }

  function columna(etiqueta, tipo) { return { etiqueta: etiqueta, clave: aClave(etiqueta), tipo: tipo }; }
  function campo(etiqueta, nodo) { return { etiqueta: etiqueta, clave: aClave(etiqueta), nodo: nodo }; }
  function vacioDe(tipo) { return tipo === 'numero' ? null : tipo === 'sino' ? false : ''; }

  function nuevoNodo(tipo) {
    switch (tipo) {
      case 'numero': return { tipo: 'numero', valor: null };
      case 'sino': return { tipo: 'sino', valor: false };
      case 'fecha': return { tipo: 'fecha', valor: hoy() };
      case 'lista': return { tipo: 'lista', tipoElem: 'texto', valor: [''] };
      case 'tabla': return { tipo: 'tabla', fila: 'elemento', columnas: [columna('Nombre', 'texto'), columna('Cantidad', 'numero')], filas: [['', null]] };
      case 'grupo': return { tipo: 'grupo', campos: [] };
      default: return { tipo: 'texto', valor: '' };
    }
  }

  // ---------- Leer lo que escribe la persona ----------
  function numero(v) {
    if (v === '' || v === null || v === undefined) return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }
  // Acepta "1,234.50", "1234,5" y "$35" (lo normal al copiar de Excel).
  function leerNumero(t) {
    t = String(t == null ? '' : t).trim().replace(/\s/g, '').replace(/^\$/, '');
    if (!t) return null;
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
    else if (/^-?\d+,\d+$/.test(t)) t = t.replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  }
  var RE_SINO = /^(s[ií]|no|true|false|verdadero|falso|yes|x)$/i;
  function leerSiNo(t) { return /^(s[ií]|true|verdadero|yes|x|1)$/i.test(String(t).trim()); }
  function leerFecha(t) {
    t = String(t == null ? '' : t).trim();
    if (RE_FECHA.test(t)) return t;
    var m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    return m ? m[3] + '-' + dos(+m[2]) + '-' + dos(+m[1]) : null;
  }
  function textoDe(v, tipo) {
    if (tipo === 'sino') return v ? 'Sí' : 'No';
    return v === null || v === undefined ? '' : String(v);
  }
  function convertirValor(v, de, a) {
    if (de === a) return v;
    var t = textoDe(v, de);
    if (a === 'numero') return leerNumero(t);
    if (a === 'sino') return leerSiNo(t);
    if (a === 'fecha') return leerFecha(t) || '';
    return t;
  }
  function convertirNodo(n, tipo) {
    if (n.tipo === tipo) return n;
    if (esSimple(n.tipo) && esSimple(tipo)) return { tipo: tipo, valor: convertirValor(n.valor, n.tipo, tipo) };
    if (esSimple(n.tipo) && tipo === 'lista') {
      var elem = n.tipo === 'numero' ? 'numero' : 'texto';
      return { tipo: 'lista', tipoElem: elem, valor: [convertirValor(n.valor, n.tipo, elem)] };
    }
    if (n.tipo === 'lista' && esSimple(tipo)) {
      return { tipo: tipo, valor: convertirValor(n.valor.length ? n.valor[0] : vacioDe(n.tipoElem), n.tipoElem, tipo) };
    }
    return nuevoNodo(tipo);
  }
  function tieneContenido(n) {
    if (n.tipo === 'grupo') return n.campos.length > 0;
    if (n.tipo === 'tabla') return n.filas.some(function (f) { return f.some(function (v) { return v !== '' && v !== null && v !== false; }); });
    if (n.tipo === 'lista') return n.valor.some(function (v) { return v !== '' && v !== null; });
    return true;
  }

  // ---------- Nodo → valor JSON ----------
  function valorCelda(v, tipo) {
    if (tipo === 'numero') return numero(v);
    if (tipo === 'sino') return !!v;
    return v === null || v === undefined ? '' : String(v);
  }
  function aValor(n) {
    switch (n.tipo) {
      case 'grupo':
        var o = {}, ks = clavesUnicas(n.campos);
        n.campos.forEach(function (c, i) { o[ks[i]] = aValor(c.nodo); });
        return o;
      case 'tabla':
        var cs = clavesUnicas(n.columnas);
        return n.filas.map(function (f) {
          var fila = {};
          n.columnas.forEach(function (c, j) { fila[cs[j]] = valorCelda(f[j], c.tipo); });
          return fila;
        });
      case 'lista': return n.valor.map(function (v) { return valorCelda(v, n.tipoElem); });
      case 'crudo': return n.valor;
      default: return valorCelda(n.valor, n.tipo);
    }
  }

  // JSON con sangría, pero con cada fila de una tabla y cada lista en una sola línea: más fácil de leer.
  function jsonBonito(v, s, enLista) {
    s = s || '';
    if (esPrimitivo(v)) return JSON.stringify(v);
    var s2 = s + '  ';
    if (Array.isArray(v)) {
      if (!v.length) return '[]';
      if (v.every(esPrimitivo)) return '[' + v.map(function (x) { return JSON.stringify(x); }).join(', ') + ']';
      return '[\n' + v.map(function (x) { return s2 + jsonBonito(x, s2, true); }).join(',\n') + '\n' + s + ']';
    }
    var ks = Object.keys(v);
    if (!ks.length) return '{}';
    if (enLista && ks.every(function (k) { return esPrimitivo(v[k]); })) {
      return '{ ' + ks.map(function (k) { return JSON.stringify(k) + ': ' + JSON.stringify(v[k]); }).join(', ') + ' }';
    }
    return '{\n' + ks.map(function (k) { return s2 + JSON.stringify(k) + ': ' + jsonBonito(v[k], s2); }).join(',\n') + '\n' + s + '}';
  }
  function aJson(n) { return jsonBonito(aValor(n), '', false); }

  // ---------- Nodo → XML ----------
  function escaparXml(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  // Las etiquetas XML no admiten espacios ni pueden empezar por un número.
  function nombreXml(k) {
    var s = sinAcentos(k || '').replace(/[^A-Za-z0-9_.-]/g, '_');
    if (!/^[A-Za-z_]/.test(s) || /^xml/i.test(s)) s = '_' + s;
    return s === '_' ? 'campo' : s;
  }
  function hojaXml(nombre, texto) { var n = nombreXml(nombre); return '<' + n + '>' + escaparXml(texto) + '</' + n + '>'; }
  function textoXml(v, tipo) {
    if (tipo === 'sino') return v ? 'true' : 'false';
    return v === null || v === undefined ? '' : String(v);
  }
  function envolverXml(nombre, lineas, s) {
    var n = nombreXml(nombre);
    return lineas.length ? s + '<' + n + '>\n' + lineas.join('\n') + '\n' + s + '</' + n + '>' : s + '<' + n + '/>';
  }
  function valorAXml(v, nombre, s) {
    if (v === null || v === undefined) return s + '<' + nombreXml(nombre) + '/>';
    if (esPrimitivo(v)) return s + hojaXml(nombre, typeof v === 'boolean' ? String(v) : v);
    if (Array.isArray(v)) return envolverXml(nombre, v.map(function (x) { return valorAXml(x, 'elemento', s + '  '); }), s);
    return envolverXml(nombre, Object.keys(v).map(function (k) { return valorAXml(v[k], k, s + '  '); }), s);
  }
  function aXml(n, nombre, s) {
    s = s || '';
    var s2 = s + '  ';
    switch (n.tipo) {
      case 'grupo':
        var ks = clavesUnicas(n.campos);
        return envolverXml(nombre, n.campos.map(function (c, i) { return aXml(c.nodo, ks[i], s2); }), s);
      case 'tabla':
        var cs = clavesUnicas(n.columnas), fila = nombreXml(n.fila || 'elemento');
        return envolverXml(nombre, n.filas.map(function (f) {
          return s2 + '<' + fila + '>' + n.columnas.map(function (c, j) { return hojaXml(cs[j], textoXml(f[j], c.tipo)); }).join('') + '</' + fila + '>';
        }), s);
      case 'lista':
        return envolverXml(nombre, n.valor.map(function (v) { return s2 + hojaXml('elemento', textoXml(v, n.tipoElem)); }), s);
      case 'crudo': return valorAXml(n.valor, nombre, s);
      default: return s + hojaXml(nombre, textoXml(n.valor, n.tipo));
    }
  }
  function aXmlDocumento(n, raiz) { return '<?xml version="1.0" encoding="UTF-8"?>\n' + aXml(n, raiz || 'datos', ''); }

  // ---------- Valor JSON → nodo ----------
  function tipoDeValor(v) {
    if (typeof v === 'boolean') return 'sino';
    if (typeof v === 'number') return 'numero';
    if (typeof v === 'string') return RE_FECHA.test(v) ? 'fecha' : 'texto';
    return null;
  }
  // Tipo que comparten todos los valores de una columna (null si no hay uno común).
  function tipoComun(valores) {
    var tipos = {};
    valores.forEach(function (v) { tipos[tipoDeValor(v)] = true; });
    var lista = Object.keys(tipos);
    if (!lista.length) return 'texto';
    if (lista.length === 1) return lista[0] === 'null' ? null : lista[0];
    if (lista.length === 2 && tipos.texto && tipos.fecha) return 'texto';
    return null;
  }
  function desdeValor(v) {
    if (v === null || v === undefined) return { tipo: 'texto', valor: '' };
    var t = tipoDeValor(v);
    if (t) return { tipo: t, valor: v };
    if (Array.isArray(v)) {
      if (!v.length) return { tipo: 'lista', tipoElem: 'texto', valor: [] };
      if (v.every(function (x) { return typeof x === 'string'; })) return { tipo: 'lista', tipoElem: 'texto', valor: v.slice() };
      if (v.every(function (x) { return typeof x === 'number'; })) return { tipo: 'lista', tipoElem: 'numero', valor: v.slice() };
      var plana = v.every(function (x) { return esObjeto(x) && Object.keys(x).every(function (k) { return esPrimitivo(x[k]); }); });
      if (plana) {
        var claves = [];
        v.forEach(function (x) { Object.keys(x).forEach(function (k) { if (claves.indexOf(k) < 0) claves.push(k); }); });
        var columnas = [];
        for (var i = 0; i < claves.length; i++) {
          var k = claves[i];
          var tc = tipoComun(v.map(function (x) { return x[k]; }).filter(function (x) { return x !== null && x !== undefined; }));
          if (!tc) return { tipo: 'crudo', valor: v };
          columnas.push({ etiqueta: etiquetaDe(k), clave: k, tipo: tc });
        }
        return {
          tipo: 'tabla', fila: 'elemento', columnas: columnas,
          filas: v.map(function (x) {
            return claves.map(function (k, j) { var val = x[k]; return val === null || val === undefined ? vacioDe(columnas[j].tipo) : val; });
          })
        };
      }
      return { tipo: 'crudo', valor: v };
    }
    return {
      tipo: 'grupo',
      campos: Object.keys(v).map(function (k) { return { etiqueta: etiquetaDe(k), clave: k, nodo: desdeValor(v[k]) }; })
    };
  }

  // ---------- Texto → nodo (con errores legibles) ----------
  function lineaDePosicion(texto, pos) { return texto.slice(0, pos).split('\n').length; }
  function leerJson(texto) {
    try {
      return JSON.parse(texto);
    } catch (e) {
      var m = String(e.message), linea = null;
      var ml = m.match(/line (\d+)/), mp = m.match(/position (\d+)/);
      if (ml) linea = +ml[1];
      else if (mp) linea = lineaDePosicion(texto, +mp[1]);
      else if (/end of (JSON|data) input/i.test(m)) linea = texto.split('\n').length;
      throw new ErrorDatos(
        (texto.trim() ? 'El JSON tiene un error' + (linea ? ' en la línea ' + linea : '') + '. Revisa que no falten comas, comillas, llaves { } o corchetes [ ].' : 'No hay nada escrito.'),
        linea);
    }
  }

  function hijosDe(e) { return Array.prototype.filter.call(e.childNodes, function (n) { return n.nodeType === 1; }); }
  function esHoja(e) { return !hijosDe(e).length && !e.attributes.length; }
  function sinRepetidos(lista) {
    var vistos = {};
    return lista.every(function (e) { if (vistos[e.nodeName]) return false; vistos[e.nodeName] = true; return true; });
  }
  function primitivoDeTexto(t) {
    t = t.trim();
    if (t === 'true' || t === 'false') return { tipo: 'sino', valor: t === 'true' };
    if (RE_NUMERO.test(t)) return { tipo: 'numero', valor: Number(t) };
    if (RE_FECHA.test(t)) return { tipo: 'fecha', valor: t };
    return { tipo: 'texto', valor: t };
  }
  // En XML todo es texto: si los valores no comparten un tipo, se quedan como texto sin perder nada.
  function tipoDeTextos(textos) {
    var tipos = {};
    textos.forEach(function (t) { tipos[primitivoDeTexto(t).tipo] = true; });
    var lista = Object.keys(tipos);
    return lista.length === 1 ? lista[0] : 'texto';
  }
  function textoDeHijo(e, nombre) {
    var h = hijosDe(e).filter(function (x) { return x.nodeName === nombre; })[0];
    return h ? h.textContent.trim() : '';
  }
  function xmlAValor(e) {
    var hs = hijosDe(e);
    if (!hs.length) return primitivoDeTexto(e.textContent).valor;
    var o = {};
    hs.forEach(function (h) {
      var v = xmlAValor(h);
      if (!(h.nodeName in o)) o[h.nodeName] = v;
      else if (Array.isArray(o[h.nodeName])) o[h.nodeName].push(v);
      else o[h.nodeName] = [o[h.nodeName], v];
    });
    return o;
  }
  function elementoANodo(e) {
    var hs = hijosDe(e), attrs = Array.prototype.slice.call(e.attributes);
    if (!hs.length && !attrs.length) return primitivoDeTexto(e.textContent);
    var nombres = hs.map(function (h) { return h.nodeName; });
    var mismo = hs.length && !attrs.length && nombres.every(function (n) { return n === nombres[0]; });
    var padre = e.nodeName.toLowerCase(), hijo = hs.length ? nombres[0].toLowerCase() : '';
    // <productos><producto>…</producto></productos> es una lista aunque tenga un solo elemento.
    var repetido = mismo && (hs.length > 1 || /^(elemento|item|fila|row|entry)$/.test(hijo) ||
      (padre.length > hijo.length && padre.indexOf(hijo) === 0));
    if (repetido) {
      if (hs.every(esHoja)) {
        var textos = hs.map(function (h) { return h.textContent.trim(); });
        var numeros = textos.every(function (t) { return RE_NUMERO.test(t); });
        return { tipo: 'lista', tipoElem: numeros ? 'numero' : 'texto', valor: numeros ? textos.map(Number) : textos };
      }
      var planos = hs.every(function (h) { return !h.attributes.length && hijosDe(h).every(esHoja) && sinRepetidos(hijosDe(h)); });
      if (planos) {
        var claves = [];
        hs.forEach(function (h) { hijosDe(h).forEach(function (c) { if (claves.indexOf(c.nodeName) < 0) claves.push(c.nodeName); }); });
        var columnas = claves.map(function (k) {
          var ts = hs.map(function (h) { return textoDeHijo(h, k); }).filter(function (t) { return t !== ''; });
          return { etiqueta: etiquetaDe(k), clave: k, tipo: tipoDeTextos(ts) };
        });
        return {
          tipo: 'tabla', fila: nombres[0], columnas: columnas,
          filas: hs.map(function (h) {
            return claves.map(function (k, j) {
              var t = textoDeHijo(h, k), tipo = columnas[j].tipo;
              return tipo === 'texto' ? t : (t === '' ? vacioDe(tipo) : primitivoDeTexto(t).valor);
            });
          })
        };
      }
    }
    if (!sinRepetidos(hs)) return { tipo: 'crudo', valor: xmlAValor(e) };
    var campos = attrs.map(function (a) { return { etiqueta: etiquetaDe(a.name), clave: a.name, nodo: primitivoDeTexto(a.value) }; });
    hs.forEach(function (h) { campos.push({ etiqueta: etiquetaDe(h.nodeName), clave: h.nodeName, nodo: elementoANodo(h) }); });
    if (!hs.length && e.textContent.trim()) campos.push({ etiqueta: 'Valor', clave: 'valor', nodo: primitivoDeTexto(e.textContent) });
    return { tipo: 'grupo', campos: campos };
  }
  function leerXml(texto) {
    if (!texto.trim()) throw new ErrorDatos('No hay nada escrito.');
    var d;
    try {
      d = new DOMParser().parseFromString(texto, 'application/xml');
    } catch (e) {
      d = null;
    }
    var err = !d || !d.documentElement ? { textContent: '' } : d.getElementsByTagName('parsererror')[0];
    if (err) {
      var m = err.textContent.match(/(?:line|l[ií]nea)[^\d]{0,16}(\d+)/i);
      var linea = m ? +m[1] : null;
      throw new ErrorDatos('El XML tiene un error' + (linea ? ' en la línea ' + linea : '') + '. Revisa que cada <etiqueta> tenga su </etiqueta> de cierre.', linea);
    }
    return { nombre: d.documentElement.nodeName, nodo: elementoANodo(d.documentElement) };
  }
  function leerDatos(texto, formato) {
    return formato === 'xml' ? leerXml(texto) : { nombre: null, nodo: desdeValor(leerJson(texto)) };
  }

  // Al volver del código al formulario, conserva los nombres bonitos ("Teléfono")
  // de los campos cuya clave no cambió.
  function heredarEtiquetas(nuevo, viejo) {
    if (!nuevo || !viejo || nuevo.tipo !== viejo.tipo) return;
    var porClave = function (lista) { var m = {}; lista.forEach(function (x) { m[x.clave] = x; }); return m; };
    if (nuevo.tipo === 'grupo') {
      var mg = porClave(viejo.campos);
      nuevo.campos.forEach(function (c) {
        var v = mg[c.clave];
        if (v) { c.etiqueta = v.etiqueta; heredarEtiquetas(c.nodo, v.nodo); }
      });
    } else if (nuevo.tipo === 'tabla') {
      var mc = porClave(viejo.columnas);
      nuevo.columnas.forEach(function (c) {
        var v = mc[c.clave];
        if (v) { c.etiqueta = v.etiqueta; if (esSimple(v.tipo) && v.tipo !== c.tipo && v.tipo === 'texto') c.tipo = 'texto'; }
      });
      if (viejo.fila && nuevo.fila === 'elemento') nuevo.fila = viejo.fila;
    }
  }

  // ---------- Pegar desde Excel (texto separado por tabuladores) ----------
  function leerTsv(t) {
    t = t.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    var filas = [], fila = [], celda = '', comillas = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (comillas) {
        if (ch === '"' && t[i + 1] === '"') { celda += '"'; i++; }
        else if (ch === '"') comillas = false;
        else celda += ch;
      } else if (ch === '"' && celda === '') comillas = true;
      else if (ch === '\t') { fila.push(celda); celda = ''; }
      else if (ch === '\n') { fila.push(celda); filas.push(fila); fila = []; celda = ''; }
      else celda += ch;
    }
    fila.push(celda);
    filas.push(fila);
    return filas;
  }
  function tipoDeCeldas(textos) {
    var llenos = textos.map(function (t) { return t.trim(); }).filter(Boolean);
    if (!llenos.length) return 'texto';
    if (llenos.every(function (t) { return /^[-$\d\s.,]+$/.test(t) && leerNumero(t) !== null && !/^0\d/.test(t); })) return 'numero';
    if (llenos.every(function (t) { return RE_SINO.test(t); })) return 'sino';
    if (llenos.every(function (t) { return leerFecha(t); })) return 'fecha';
    return 'texto';
  }
  function tablaDesdeTsv(texto) {
    var filas = leerTsv(texto).filter(function (f) { return f.some(function (c) { return c.trim(); }); });
    if (!filas.length) return null;
    var ancho = Math.max.apply(null, filas.map(function (f) { return f.length; }));
    var titulos = filas[0], datos = filas.slice(1);
    var columnas = [];
    for (var j = 0; j < ancho; j++) {
      var tipo = tipoDeCeldas(datos.map(function (f) { return f[j] || ''; }));
      columnas.push(columna((titulos[j] || '').trim() || 'Columna ' + (j + 1), tipo));
    }
    return {
      tipo: 'tabla', fila: 'elemento', columnas: columnas,
      filas: datos.map(function (f) {
        return columnas.map(function (c, j) { var t = (f[j] || '').trim(); return t === '' ? vacioDe(c.tipo) : convertirValor(t, 'texto', c.tipo); });
      })
    };
  }

  // Filas de Excel que ya traen su tipo (número, sí/no, texto, fecha "aaaa-mm-dd") → tabla.
  function tablaDesdeCeldas(filas) {
    if (!filas || !filas.length) return null;
    var titulos = filas[0], datosF = filas.slice(1), columnas = [];
    for (var j = 0; j < titulos.length; j++) {
      var valores = datosF.map(function (f) { return f[j]; }).filter(function (v) { return v !== null && v !== undefined && v !== ''; });
      var t = titulos[j];
      columnas.push(columna(t === null || t === undefined || t === '' ? 'Columna ' + (j + 1) : String(t), tipoComun(valores) || 'texto'));
    }
    return {
      tipo: 'tabla', fila: 'elemento', columnas: columnas,
      filas: datosF.map(function (f) {
        return columnas.map(function (c, j) {
          var v = f[j];
          if (v === null || v === undefined || v === '') return vacioDe(c.tipo);
          if (c.tipo === 'texto') return typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v);
          return v;
        });
      })
    };
  }

  // Reglas del "fence" de Markdown: devuelve cada sección ```json / ```xml con su línea de inicio.
  function seccionesDeDatos(md) {
    var lineas = md.split('\n'), secciones = [], abierta = null;
    lineas.forEach(function (l, i) {
      var m = l.match(/^(\s*)(`{3,}|~{3,})\s*([\w-]*)\s*$/);
      if (!abierta && m) { abierta = { cerca: m[2], formato: m[3].toLowerCase(), inicio: i + 1, lineas: [] }; return; }
      if (abierta && m && m[2].charAt(0) === abierta.cerca.charAt(0) && m[2].length >= abierta.cerca.length && !m[3]) {
        if (abierta.formato === 'json' || abierta.formato === 'xml') secciones.push({ formato: abierta.formato, inicio: abierta.inicio, texto: abierta.lineas.join('\n') });
        abierta = null;
        return;
      }
      if (abierta) abierta.lineas.push(l);
    });
    return secciones;
  }
  function validarSecciones(md) {
    seccionesDeDatos(md).forEach(function (s) {
      try { leerDatos(s.texto, s.formato); }
      catch (e) {
        if (!(e instanceof ErrorDatos)) throw e;
        var linea = e.linea ? s.inicio + e.linea : s.inicio;
        throw new ErrorDatos('La sección ```' + s.formato + ' que empieza en la línea ' + s.inicio + ' tiene un error' +
          (e.linea ? ' (línea ' + linea + ')' : '') + '. ' + (s.formato === 'json' ? 'Revisa comas, comillas y llaves.' : 'Revisa que cada etiqueta tenga su cierre.'), linea);
      }
    });
  }

  // =====================================================================
  // 2. Piezas de interfaz comunes
  // =====================================================================
  var ICONO_QUITAR = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>';

  function el(etiqueta, props, hijos) {
    var n = document.createElement(etiqueta);
    Object.keys(props || {}).forEach(function (k) {
      var v = props[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'clase') n.className = v;
      else if (k === 'texto') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    (hijos || []).forEach(function (h) {
      if (h !== null && h !== undefined) n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
    });
    return n;
  }
  function plural(n, uno, varios) { return W.plural(n, uno, varios); }
  function aviso(t) { W.aviso(t); }
  function nombreArchivo(v, defecto) {
    var s = String(v || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\.(md|markdown|json|xml|txt)$/i, '').trim();
    return s || defecto;
  }
  function leerTexto(archivo) {
    if (archivo.text) return archivo.text();
    return new Promise(function (ok, mal) {
      var r = new FileReader();
      r.onload = function () { ok(r.result); };
      r.onerror = function () { mal(r.error); };
      r.readAsText(archivo);
    });
  }

  // ---------- Menús desplegables ----------
  var menuAbierto = null;
  function cerrarMenu(devolverFoco) {
    if (!menuAbierto) return;
    var m = menuAbierto;
    menuAbierto = null;
    m.caja.remove();
    m.boton.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', clicFueraMenu, true);
    if (devolverFoco) m.boton.focus();
  }
  function clicFueraMenu(e) {
    if (menuAbierto && !menuAbierto.caja.contains(e.target) && !menuAbierto.boton.contains(e.target)) cerrarMenu(false);
  }
  // opciones: [{id, nombre, ayuda, chip, chipClase, atajo, clase, activo} | {separador: true}]
  function abrirMenu(boton, titulo, opciones, alElegir) {
    var mismo = menuAbierto && menuAbierto.boton === boton;
    cerrarMenu(false);
    if (mismo) return;
    var caja = el('div', { clase: 'menu', role: 'menu', 'aria-label': titulo });
    if (titulo) caja.appendChild(el('div', { clase: 'menu-titulo', 'aria-hidden': 'true', texto: titulo }));
    opciones.forEach(function (o) {
      if (o.separador) { caja.appendChild(el('div', { clase: 'menu-separador', role: 'separator' })); return; }
      var item = el('button', { type: 'button', role: 'menuitem', tabindex: '-1', clase: 'menu-item' + (o.activo ? ' activo' : '') + (o.clase ? ' ' + o.clase : '') });
      if (o.chip) item.appendChild(el('span', { clase: 'chip-tipo ' + (o.chipClase || ''), 'aria-hidden': 'true', texto: o.chip }));
      var textos = el('span', { clase: 'menu-textos' }, [el('span', { clase: 'menu-nombre', texto: o.nombre })]);
      if (o.ayuda) textos.appendChild(el('span', { clase: 'menu-ayuda', texto: o.ayuda }));
      item.appendChild(textos);
      if (o.atajo) item.appendChild(el('kbd', { texto: o.atajo }));
      // mousedown sin foco: así no se pierde la selección del documento.
      item.addEventListener('mousedown', function (e) { e.preventDefault(); });
      item.addEventListener('click', function () { cerrarMenu(false); alElegir(o.id); });
      caja.appendChild(item);
    });
    caja.addEventListener('keydown', function (e) {
      var items = Array.prototype.slice.call(caja.querySelectorAll('.menu-item'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); cerrarMenu(true); }
      else if (e.key === 'Tab') cerrarMenu(false);
    });
    document.body.appendChild(caja);
    var r = boton.getBoundingClientRect();
    var ancho = caja.offsetWidth, alto = caja.offsetHeight;
    var izq = Math.max(12, Math.min(r.left, window.innerWidth - ancho - 12));
    var arriba = r.bottom + 8;
    if (arriba + alto > window.innerHeight - 12 && r.top - alto - 8 > 12) arriba = r.top - alto - 8;
    caja.style.left = izq + 'px';
    caja.style.top = Math.max(12, arriba) + 'px';
    boton.setAttribute('aria-expanded', 'true');
    menuAbierto = { caja: caja, boton: boton };
    document.addEventListener('mousedown', clicFueraMenu, true);
    var primero = caja.querySelector('.menu-item.activo') || caja.querySelector('.menu-item');
    if (primero) primero.focus({ preventScroll: true });
  }
  window.addEventListener('resize', function () { cerrarMenu(false); });
  document.addEventListener('scroll', function (e) {
    if (menuAbierto && !menuAbierto.caja.contains(e.target)) cerrarMenu(false);
  }, true);

  function menuTipos(boton, lista, titulo, alElegir, actual) {
    abrirMenu(boton, titulo, lista.map(function (t) {
      return { id: t, nombre: TIPOS[t].nombre, ayuda: TIPOS[t].ayuda, chip: TIPOS[t].chip, chipClase: 't-' + t, activo: t === actual };
    }), alElegir);
  }

  // ---------- Diálogo (enlace, pegar desde Excel) ----------
  function pedir(o) {
    var d = $('dialogo');
    var entrada = $('dialogo-entrada'), area = $('dialogo-area');
    var campo = o.largo ? area : entrada;
    $('dialogo-titulo').textContent = o.titulo;
    $('dialogo-texto').textContent = o.texto || '';
    $('dialogo-ok').textContent = o.ok || 'Aceptar';
    entrada.hidden = !!o.largo;
    area.hidden = !o.largo;
    campo.value = o.valor || '';
    campo.placeholder = o.pista || '';
    if (!d.showModal) {
      var r = window.prompt(o.titulo + (o.texto ? '\n' + o.texto : ''), o.valor || '');
      return Promise.resolve(r);
    }
    return new Promise(function (ok) {
      var alCerrar = function () {
        d.removeEventListener('close', alCerrar);
        ok(d.returnValue === 'ok' ? campo.value : null);
      };
      d.returnValue = '';
      d.addEventListener('close', alCerrar);
      d.showModal();
      campo.focus();
      if (campo.select) campo.select();
    });
  }
  // Enter en la línea de texto acepta (el primer botón del formulario es "Cancelar").
  $('dialogo-entrada').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $('dialogo').close('ok'); }
  });

  // ---------- Editor de código con colores ----------
  // Un <textarea> transparente encima de un <pre> resaltado: se escribe en el textarea
  // y se ven los colores del pre. Los dos comparten celda de una rejilla, así que miden lo mismo.
  function resaltarJson(t) {
    return t.split('\n').map(function (l) {
      return W.escapar(l).replace(/("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g,
        function (m, cadena, dosPuntos, literal, num) {
          if (cadena) return '<span class="' + (dosPuntos ? 'k' : 's') + '">' + cadena + '</span>' + (dosPuntos || '');
          return '<span class="n">' + (literal || num) + '</span>';
        });
    });
  }
  function resaltarXml(t) {
    return t.split('\n').map(function (l) {
      return W.escapar(l)
        .replace(/&lt;\?[^?]*\?&gt;|&lt;!--.*?--&gt;/g, '<span class="c">$&</span>')
        .replace(/(&lt;\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=&]+="[^"]*")*)(\s*\/?&gt;)/g, function (m, abre, nombre, attrs, cierra) {
          return '<span class="e">' + abre + nombre + '</span>' +
            attrs.replace(/([^\s=]+)=("[^"]*")/g, '<span class="a">$1</span>=<span class="s">$2</span>') +
            '<span class="e">' + cierra + '</span>';
        });
    });
  }
  function resaltarMd(t) { return W.resaltar(t).split('\n'); }

  function editorCodigo(caja, resaltador) {
    var pre = caja.querySelector('pre'), area = caja.querySelector('textarea');
    var mala = null;
    function pintar() {
      var lineas = resaltador(area.value);
      if (mala && lineas[mala - 1] !== undefined) lineas[mala - 1] = '<span class="linea-mala">' + (lineas[mala - 1] || ' ') + '</span>';
      pre.innerHTML = lineas.join('\n') + '\n';
    }
    area.addEventListener('input', function () { mala = null; pintar(); });
    return {
      area: area,
      poner: function (t) { area.value = t; mala = null; pintar(); caja.parentNode.scrollTop = 0; },
      valor: function () { return area.value; },
      cambiarResaltador: function (r) { resaltador = r; pintar(); },
      marcar: function (linea) {
        mala = linea;
        pintar();
        if (linea) {
          var alto = parseFloat(getComputedStyle(pre).lineHeight) || 24;
          caja.parentNode.scrollTop = Math.max(0, (linea - 4) * alto);
        }
      }
    };
  }

  function mostrarError(id, texto) { var e = $(id); e.textContent = texto || ''; e.hidden = !texto; }

  // ---------- Guardado: lo hace pestanas.js; aquí solo se avisa del cambio y se pinta el estado ----------
  function avisarCambio() { if (W.cambio) W.cambio(); }
  function indicador(estadoGuardado) {
    ['doc-guardado', 'datos-guardado'].forEach(function (id) {
      var caja = $(id);
      caja.dataset.estado = estadoGuardado;
      caja.querySelector('.texto').textContent = {
        guardando: 'Guardando…',
        ok: 'Guardado en este equipo',
        parcial: 'Guardado sin las imágenes (no caben)',
        error: 'No se pudo guardar: el espacio del navegador está lleno'
      }[estadoGuardado];
    });
  }
  W.indicarGuardado = indicador;

  // =====================================================================
  // 3. Formulario de datos (se usa en "Datos" y dentro de los documentos)
  // ---------------------------------------------------------------------
  // ctx = { formato(): 'json'|'xml', cambio(tipo) }
  //   tipo 'valor'      → se escribió algo (no se repinta, para no perder el foco)
  //   tipo 'fijo'       → cambio terminado (se guarda en el historial)
  //   tipo 'estructura' → se agregó/quitó algo (historial + repintar)
  // =====================================================================

  function chipTipo(tipo, titulo, alPulsar) {
    var b = el('button', {
      type: 'button', clase: 'chip-tipo t-' + tipo, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
      title: titulo, 'aria-label': TIPOS[tipo].nombre + '. ' + titulo, texto: TIPOS[tipo].chip
    });
    b.addEventListener('click', function () { alPulsar(b); });
    return b;
  }
  function botonQuitar(etiqueta, alPulsar) {
    return el('button', { type: 'button', clase: 'btn-quitar', 'aria-label': etiqueta, title: etiqueta, html: ICONO_QUITAR, onclick: alPulsar });
  }
  function marcarFoco(entrada, objeto) {
    if (objeto && objeto._enfocar) { entrada.setAttribute('data-enfocar', ''); delete objeto._enfocar; }
  }
  function enfocarPendiente(raiz) {
    var e = raiz.querySelector('[data-enfocar]');
    if (!e) return;
    e.removeAttribute('data-enfocar');
    e.focus();
    if (e.select) e.select();
    if (e.scrollIntoView) e.scrollIntoView({ block: 'nearest' });
  }

  function entrada(tipo, valor, etiqueta, ctx, alCambiar, clase) {
    var i = el('input', {
      type: tipo === 'numero' ? 'number' : tipo === 'fecha' ? 'date' : 'text',
      step: tipo === 'numero' ? 'any' : null, clase: clase || 'entrada', 'aria-label': etiqueta, autocomplete: 'off'
    });
    i.value = valor === null || valor === undefined ? '' : String(valor);
    i.addEventListener('input', function () { alCambiar(tipo === 'numero' ? numero(i.value) : i.value); ctx.cambio('valor'); });
    i.addEventListener('change', function () { ctx.cambio('fijo'); });
    return i;
  }

  function interruptorSiNo(valor, etiqueta, ctx, alCambiar) {
    var b = el('button', { type: 'button', role: 'switch', clase: 'sino', 'aria-label': etiqueta }, [
      el('span', { clase: 'sino-pista', 'aria-hidden': 'true' }, [el('span')]),
      el('span', { clase: 'sino-texto' })
    ]);
    function pintar() { b.setAttribute('aria-checked', valor ? 'true' : 'false'); b.lastChild.textContent = valor ? 'Sí' : 'No'; }
    b.addEventListener('click', function () { valor = !valor; pintar(); alCambiar(valor); ctx.cambio('fijo'); });
    pintar();
    return b;
  }

  function agregarCampo(grupo, tipo, ctx) {
    var base = TIPOS[tipo].nuevo, etiqueta = base, n = 2;
    var usadas = grupo.campos.map(function (c) { return c.etiqueta; });
    while (usadas.indexOf(etiqueta) >= 0) etiqueta = base + ' ' + (n++);
    var c = campo(etiqueta, nuevoNodo(tipo));
    c._enfocar = true;
    grupo.campos.push(c);
    ctx.cambio('estructura');
  }

  function pintarRaiz(n, ctx) {
    if (n.tipo === 'grupo') return pintarCampos(n, ctx, true);
    return el('div', { clase: 'raiz-valor' }, [pintarValor(n, ctx, 'Datos')]);
  }

  function pintarCampos(grupo, ctx, raiz) {
    var caja = el('div', { clase: 'campos' + (raiz ? ' campos-raiz' : '') });
    var claves = clavesUnicas(grupo.campos);
    grupo.campos.forEach(function (c, i) { caja.appendChild(pintarCampo(grupo, c, claves[i], ctx)); });
    if (!grupo.campos.length && raiz) {
      caja.appendChild(el('p', { clase: 'campos-vacio', texto: 'Todavía no hay campos. Agrega el primero: un texto, un número, una tabla…' }));
    }
    var agregar = el('button', { type: 'button', clase: 'btn-punteado campo-ancho', 'aria-haspopup': 'menu', 'aria-expanded': 'false', texto: raiz ? '+ Agregar campo' : '+ Campo' });
    agregar.addEventListener('click', function () {
      menuTipos(agregar, AGREGABLES, '¿Qué quieres guardar?', function (tipo) { agregarCampo(grupo, tipo, ctx); });
    });
    caja.appendChild(agregar);
    return caja;
  }

  function pintarCampo(grupo, c, claveReal, ctx) {
    var ancho = !esSimple(c.nodo.tipo);
    var caja = el('div', { clase: 'campo' + (ancho ? ' campo-ancho' : '') + (c._enfocar ? ' campo-nuevo' : '') });
    var clave = el('span', { clase: 'clave', title: 'Así se llama en el archivo', texto: claveReal });
    var nombre = el('input', { type: 'text', clase: 'campo-nombre', 'aria-label': 'Nombre del campo', autocomplete: 'off', spellcheck: 'false' });
    nombre.value = c.etiqueta;
    marcarFoco(nombre, c);
    nombre.addEventListener('input', function () {
      c.etiqueta = nombre.value;
      c.clave = aClave(nombre.value);
      clave.textContent = c.clave;
      ctx.cambio('valor');
    });
    nombre.addEventListener('change', function () { ctx.cambio('fijo'); });
    var chip = chipTipo(c.nodo.tipo, 'Cambiar el tipo', function (boton) {
      menuTipos(boton, AGREGABLES, 'Cambiar a…', function (tipo) {
        if (tipo === c.nodo.tipo) return;
        if (!esSimple(c.nodo.tipo) && c.nodo.tipo !== 'lista' && tieneContenido(c.nodo) &&
          !window.confirm('Al cambiar el tipo se borra lo que tiene “' + c.etiqueta + '”. ¿Continuar?')) return;
        c.nodo = convertirNodo(c.nodo, tipo);
        ctx.cambio('estructura');
      }, c.nodo.tipo);
    });
    caja.appendChild(el('div', { clase: 'campo-cabeza' }, [chip, nombre, clave]));
    caja.appendChild(pintarValor(c.nodo, ctx, c.etiqueta));
    // Va al final para que Tab pase del nombre al valor; se dibuja arriba a la derecha.
    var quitar = botonQuitar('Quitar el campo ' + c.etiqueta, function () {
      grupo.campos.splice(grupo.campos.indexOf(c), 1);
      ctx.cambio('estructura');
    });
    quitar.classList.add('campo-quitar');
    caja.appendChild(quitar);
    return caja;
  }

  function pintarValor(n, ctx, etiqueta) {
    switch (n.tipo) {
      case 'sino': return interruptorSiNo(n.valor, etiqueta, ctx, function (v) { n.valor = v; });
      case 'lista': return pintarLista(n, ctx, etiqueta);
      case 'tabla': return pintarTabla(n, ctx, etiqueta);
      case 'grupo': return el('div', { clase: 'grupo' }, [pintarCampos(n, ctx, false)]);
      case 'crudo': return pintarCrudo(n, ctx, etiqueta);
      default: return entrada(n.tipo, n.valor, etiqueta, ctx, function (v) { n.valor = v; });
    }
  }

  function pintarLista(n, ctx, etiqueta) {
    var caja = el('div', { clase: 'lista-datos' });
    n.valor.forEach(function (v, i) {
      var e = entrada(n.tipoElem, v, etiqueta + ', elemento ' + (i + 1), ctx, function (nv) { n.valor[i] = nv; ajustar(); }, 'entrada-chip');
      function ajustar() { e.style.width = (Math.max(4, e.value.length) + 3) + 'ch'; }
      ajustar();
      if (i === n.valor.length - 1) marcarFoco(e, n);
      caja.appendChild(el('span', { clase: 'chip-dato' }, [e, botonQuitar('Quitar ' + (textoDe(v, n.tipoElem) || 'el elemento ' + (i + 1)), function () {
        n.valor.splice(i, 1);
        ctx.cambio('estructura');
      })]));
    });
    delete n._enfocar;
    caja.appendChild(el('button', {
      type: 'button', clase: 'btn-punteado', texto: '+ Agregar',
      onclick: function () { n.valor.push(vacioDe(n.tipoElem)); n._enfocar = true; ctx.cambio('estructura'); }
    }));
    return caja;
  }

  function pintarTabla(n, ctx, etiqueta) {
    var tabla = el('table', { clase: 'tabla-datos' });
    var cab = el('tr');
    n.columnas.forEach(function (c, j) {
      var nombre = el('input', { type: 'text', clase: 'col-nombre', 'aria-label': 'Nombre de la columna ' + (j + 1), autocomplete: 'off', spellcheck: 'false' });
      nombre.value = c.etiqueta;
      nombre.addEventListener('input', function () { c.etiqueta = nombre.value; c.clave = aClave(nombre.value); ctx.cambio('valor'); });
      nombre.addEventListener('change', function () { ctx.cambio('fijo'); });
      var chip = chipTipo(c.tipo, 'Cambiar el tipo de la columna', function (boton) {
        menuTipos(boton, SIMPLES, 'La columna guarda…', function (tipo) {
          var antes = c.tipo;
          c.tipo = tipo;
          n.filas.forEach(function (f) { f[j] = convertirValor(f[j], antes, tipo); });
          ctx.cambio('estructura');
        }, c.tipo);
      });
      cab.appendChild(el('th', { scope: 'col', clase: 'col-' + c.tipo }, [el('div', { clase: 'col-cabeza' }, [chip, nombre, botonQuitar('Quitar la columna ' + c.etiqueta, function () {
        n.columnas.splice(j, 1);
        n.filas.forEach(function (f) { f.splice(j, 1); });
        ctx.cambio('estructura');
      })])]));
    });
    cab.appendChild(el('th', { clase: 'col-acciones' }, [el('span', { clase: 'oculto', texto: 'Quitar fila' })]));
    tabla.appendChild(el('thead', {}, [cab]));

    var cuerpo = el('tbody');
    n.filas.forEach(function (fila, r) {
      var tr = el('tr');
      n.columnas.forEach(function (c, j) {
        var etq = (c.etiqueta || 'Columna ' + (j + 1)) + ', fila ' + (r + 1);
        var celda;
        if (c.tipo === 'sino') {
          celda = interruptorSiNo(fila[j], etq, ctx, function (v) { fila[j] = v; });
        } else {
          celda = entrada(c.tipo, fila[j], etq, ctx, function (v) { fila[j] = v; }, 'entrada-celda');
          celda.addEventListener('paste', function (e) { pegarEnTabla(e, n, r, j, ctx); });
          if (j === 0 && r === n.filas.length - 1) marcarFoco(celda, n);
        }
        tr.appendChild(el('td', { clase: 'col-' + c.tipo }, [celda]));
      });
      tr.appendChild(el('td', { clase: 'col-acciones' }, [botonQuitar('Quitar la fila ' + (r + 1), function () {
        n.filas.splice(r, 1);
        ctx.cambio('estructura');
      })]));
      cuerpo.appendChild(tr);
    });
    tabla.appendChild(cuerpo);
    delete n._enfocar;

    var masColumna = el('button', { type: 'button', clase: 'btn-texto', 'aria-haspopup': 'menu', 'aria-expanded': 'false', texto: '+ Columna' });
    masColumna.addEventListener('click', function () {
      menuTipos(masColumna, SIMPLES, 'La columna nueva guarda…', function (tipo) {
        n.columnas.push(columna('Columna ' + (n.columnas.length + 1), tipo));
        n.filas.forEach(function (f) { f.push(vacioDe(tipo)); });
        ctx.cambio('estructura');
      });
    });
    var pie = el('div', { clase: 'tabla-pie' }, [
      el('button', {
        type: 'button', clase: 'btn-texto', texto: '+ Agregar fila',
        onclick: function () { n.filas.push(n.columnas.map(function (c) { return vacioDe(c.tipo); })); n._enfocar = true; ctx.cambio('estructura'); }
      }),
      masColumna,
      el('span', { clase: 'tabla-pista', texto: 'Puedes pegar celdas copiadas de Excel.' })
    ]);
    if (ctx.formato() === 'xml') {
      var fila = el('input', { type: 'text', clase: 'entrada-fila', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'En XML, cada fila se llama' });
      fila.value = n.fila || 'elemento';
      fila.addEventListener('input', function () { n.fila = fila.value.trim() || 'elemento'; ctx.cambio('valor'); });
      fila.addEventListener('change', function () { ctx.cambio('fijo'); });
      pie.appendChild(el('label', { clase: 'fila-xml' }, ['En XML cada fila se llama ', fila]));
    }
    return el('div', { clase: 'tabla-caja', role: 'group', 'aria-label': etiqueta }, [el('div', { clase: 'tabla-scroll' }, [tabla]), pie]);
  }

  // Pegar varias celdas (de Excel, Sheets…) en una celda: se reparten y se agregan filas/columnas.
  function pegarEnTabla(e, n, r, j, ctx) {
    var texto = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(texto.replace(/\r?\n$/, ''))) return;
    e.preventDefault();
    var filas = leerTsv(texto);
    filas.forEach(function (valores, dr) {
      var fr = r + dr;
      while (n.filas.length <= fr) n.filas.push(n.columnas.map(function (c) { return vacioDe(c.tipo); }));
      valores.forEach(function (v, dc) {
        var k = j + dc;
        while (n.columnas.length <= k) {
          n.columnas.push(columna('Columna ' + (n.columnas.length + 1), 'texto'));
          n.filas.forEach(function (f) { f.push(''); });
        }
        n.filas[fr][k] = convertirValor(v.trim(), 'texto', n.columnas[k].tipo);
      });
    });
    ctx.cambio('estructura');
    aviso('Se pegaron ' + plural(filas.length, 'fila', 'filas'));
  }

  function pintarCrudo(n, ctx, etiqueta) {
    var area = el('textarea', { clase: 'crudo', spellcheck: 'false', 'aria-label': etiqueta, rows: '6' });
    area.value = JSON.stringify(n.valor, null, 2);
    area.addEventListener('input', function () {
      try { n.valor = JSON.parse(area.value); area.classList.remove('mal'); ctx.cambio('valor'); }
      catch (e) { area.classList.add('mal'); }
    });
    area.addEventListener('change', function () { if (!area.classList.contains('mal')) ctx.cambio('fijo'); });
    return el('div', { clase: 'crudo-caja' }, [
      el('p', { texto: 'El formulario no sabe mostrar este dato. Puedes editarlo aquí como JSON.' }), area
    ]);
  }

  function contarFilas(n) {
    if (n.tipo === 'tabla') return n.filas.length;
    if (n.tipo === 'grupo') return n.campos.reduce(function (s, c) { return s + contarFilas(c.nodo); }, 0);
    return 0;
  }

  // =====================================================================
  // 4. Editor de datos (.json / .xml)
  // =====================================================================
  var datos = { nodo: nuevoNodo('grupo'), formato: 'json', raiz: 'datos', vista: 'formulario', historial: [], codigo: null };
  var historiales = {}; // el historial de deshacer de cada pestaña, mientras la app está abierta
  var formDatos = $('datos-form');
  var codigoDatos = editorCodigo($('datos-codigo').querySelector('.editor-codigo'), resaltarJson);
  var ctxDatos = { formato: function () { return datos.formato; }, cambio: cambioDatos };

  function textoDatos() { return datos.formato === 'xml' ? aXmlDocumento(datos.nodo, datos.raiz) : aJson(datos.nodo); }

  function pintarDatos() {
    formDatos.innerHTML = '';
    formDatos.appendChild(pintarRaiz(datos.nodo, ctxDatos));
    enfocarPendiente(formDatos);
    pintarPanelDatos();
  }

  function pintarPanelDatos() {
    var ext = '.' + datos.formato, nombre = datos.formato.toUpperCase();
    $('datos-ext').textContent = ext;
    $('datos-vista-codigo').textContent = nombre;
    $('datos-descargar').querySelector('span').textContent = 'Descargar ' + ext;
    $('datos-copiar').textContent = 'Copiar ' + nombre;
    document.querySelectorAll('#datos-formatos button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.formato === datos.formato ? 'true' : 'false');
    });
    $('datos-raiz-caja').hidden = datos.formato !== 'xml';
    $('datos-raiz').value = datos.raiz;
    $('datos-agregar').disabled = datos.nodo.tipo !== 'grupo' || datos.vista !== 'formulario';
    var chips = [];
    if (datos.nodo.tipo === 'grupo') chips.push(plural(datos.nodo.campos.length, 'campo', 'campos'));
    var filas = contarFilas(datos.nodo);
    if (filas || datos.nodo.tipo === 'tabla') chips.push(plural(filas, 'fila', 'filas'));
    var caja = $('datos-chips');
    caja.innerHTML = '';
    chips.forEach(function (c) { caja.appendChild(el('span', { texto: c })); });
    var consejo = datos.vista === 'formulario'
      ? ['No necesitas saber JSON ni XML.', 'Llena el formulario y el archivo se escribe solo. Ponle a cada campo el nombre que quieras.']
      : datos.formato === 'json'
        ? ['Así queda tu .json.', 'Puedes corregirlo aquí. Si algo está mal escrito, te marcamos la línea antes de volver al formulario.']
        : ['Así queda tu .xml.', 'Puedes corregirlo aquí. Si una etiqueta queda sin cerrar, te marcamos la línea antes de volver al formulario.'];
    $('datos-consejo').innerHTML = '';
    $('datos-consejo').appendChild(el('b', { texto: consejo[0] }));
    $('datos-consejo').appendChild(document.createTextNode(' ' + consejo[1]));
  }

  function instantanea() {
    var foto = JSON.stringify({ nodo: datos.nodo, raiz: datos.raiz });
    if (datos.historial[datos.historial.length - 1] !== foto) datos.historial.push(foto);
    if (datos.historial.length > 80) datos.historial.shift();
  }

  function cambioDatos(tipo) {
    if (tipo !== 'valor') instantanea();
    if (tipo === 'estructura') pintarDatos();
    else pintarPanelDatos();
    avisarCambio();
  }

  // Lo que pestanas.js guarda de la pestaña de datos.
  function estadoDatos() {
    var codigo = datos.vista === 'codigo' ? codigoDatos.valor() : null;
    return {
      nombre: $('datos-nombre').value, formato: datos.formato, raiz: datos.raiz, nodo: datos.nodo,
      // Si se estaba corrigiendo el código, se guarda tal cual (aunque todavía tenga errores).
      codigo: codigo !== null && codigo !== datos.codigo ? codigo : null
    };
  }

  // Aplica lo escrito en la vista de código. Devuelve false si tiene errores (y los marca).
  function aplicarCodigoDatos() {
    var t = codigoDatos.valor();
    if (t === datos.codigo) return true;
    try {
      var r = leerDatos(t, datos.formato);
      heredarEtiquetas(r.nodo, datos.nodo);
      datos.nodo = r.nodo;
      if (r.nombre) datos.raiz = r.nombre;
      datos.codigo = t;
      instantanea();
      avisarCambio();
      mostrarError('datos-error', '');
      return true;
    } catch (e) {
      if (!(e instanceof ErrorDatos)) throw e;
      mostrarError('datos-error', e.message);
      codigoDatos.marcar(e.linea);
      return false;
    }
  }

  function verVistaDatos(vista) {
    if (vista === datos.vista) return;
    if (vista === 'codigo') {
      datos.codigo = textoDatos();
      codigoDatos.cambiarResaltador(datos.formato === 'xml' ? resaltarXml : resaltarJson);
      codigoDatos.poner(datos.codigo);
    } else {
      if (!aplicarCodigoDatos()) return;
    }
    datos.vista = vista;
    $('datos-hoja').hidden = vista !== 'formulario';
    $('datos-codigo').hidden = vista !== 'codigo';
    document.querySelectorAll('#datos-vistas button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.vista === vista ? 'true' : 'false');
    });
    mostrarError('datos-error', '');
    if (vista === 'formulario') pintarDatos(); else pintarPanelDatos();
  }

  function cambiarFormatoDatos(f) {
    if (f === datos.formato) return;
    if (datos.vista === 'codigo' && !aplicarCodigoDatos()) return;
    datos.formato = f;
    if (datos.vista === 'codigo') {
      datos.codigo = textoDatos();
      codigoDatos.cambiarResaltador(f === 'xml' ? resaltarXml : resaltarJson);
      codigoDatos.poner(datos.codigo);
      pintarPanelDatos();
    } else {
      pintarDatos();
    }
    avisarCambio();
  }

  function cargarDatos(nodo, opciones) {
    opciones = opciones || {};
    datos.nodo = nodo;
    datos.formato = opciones.formato || 'json';
    datos.raiz = opciones.raiz || 'datos';
    datos.historial = (opciones.id && historiales[opciones.id]) || [];
    if (opciones.id) historiales[opciones.id] = datos.historial;
    $('datos-nombre').value = opciones.nombre || 'datos';
    instantanea();
    datos.vista = 'codigo'; // fuerza el cambio de vista
    codigoDatos.poner('');
    datos.codigo = '';
    verVistaDatos('formulario');
  }

  // Abre un .json/.xml. Si tiene errores, se abre en la vista de código con la línea marcada.
  function cargarDatosTexto(texto, formato, nombre, id) {
    try {
      var r = leerDatos(texto, formato);
      cargarDatos(r.nodo, { formato: formato, raiz: r.nombre || 'datos', nombre: nombre, id: id });
    } catch (e) {
      if (!(e instanceof ErrorDatos)) throw e;
      cargarDatos(nuevoNodo('grupo'), { formato: formato, nombre: nombre, id: id });
      verVistaDatos('codigo');
      codigoDatos.poner(texto);
      datos.codigo = null;
      mostrarError('datos-error', e.message + ' Corrígelo aquí para poder usar el formulario.');
      codigoDatos.marcar(e.linea);
    }
  }

  // Pone en el editor los datos de una pestaña (registro guardado por pestanas.js).
  function cargarRegistroDatos(reg) {
    if (reg.codigo) cargarDatosTexto(reg.codigo, reg.formato || 'json', reg.nombre, reg.id);
    else cargarDatos(reg.nodo || nuevoNodo('grupo'), reg);
  }

  document.querySelectorAll('#datos-vistas button').forEach(function (b) {
    b.addEventListener('click', function () { verVistaDatos(b.dataset.vista); });
  });
  document.querySelectorAll('#datos-formatos button').forEach(function (b) {
    b.addEventListener('click', function () { cambiarFormatoDatos(b.dataset.formato); });
  });
  $('datos-agregar').addEventListener('click', function () {
    menuTipos($('datos-agregar'), AGREGABLES, '¿Qué quieres guardar?', function (tipo) { agregarCampo(datos.nodo, tipo, ctxDatos); });
  });
  codigoDatos.area.addEventListener('input', function () { mostrarError('datos-error', ''); avisarCambio(); });
  $('datos-nombre').addEventListener('input', avisarCambio);
  $('datos-raiz').addEventListener('input', function () {
    datos.raiz = nombreXml($('datos-raiz').value.trim() || 'datos');
    avisarCambio();
  });
  $('datos-raiz').addEventListener('change', function () { $('datos-raiz').value = datos.raiz; });
  $('datos-deshacer').addEventListener('click', function () {
    if (datos.vista === 'codigo') { codigoDatos.area.focus(); document.execCommand('undo'); return; }
    if (datos.historial.length < 2) { aviso('No hay nada que deshacer'); return; }
    datos.historial.pop();
    var foto = JSON.parse(datos.historial[datos.historial.length - 1]);
    datos.nodo = foto.nodo;
    datos.raiz = foto.raiz;
    pintarDatos();
    avisarCambio();
  });
  $('datos-excel').addEventListener('click', function () {
    pedir({
      titulo: 'Pegar desde Excel', largo: true, ok: 'Agregar tabla',
      texto: 'En Excel, selecciona las celdas (con los títulos de las columnas en la primera fila), cópialas con Ctrl+C y pégalas aquí con Ctrl+V.'
    }).then(function (texto) {
      if (!texto || !texto.trim()) return;
      var tabla = tablaDesdeTsv(texto);
      if (!tabla) return;
      if (datos.vista === 'codigo' && !aplicarCodigoDatos()) return;
      if (datos.nodo.tipo === 'grupo') {
        var c = campo('Tabla de Excel', tabla);
        var n = 2;
        while (datos.nodo.campos.some(function (x) { return x.etiqueta === c.etiqueta; })) c = campo('Tabla de Excel ' + (n++), tabla);
        c._enfocar = true;
        datos.nodo.campos.push(c);
      } else {
        datos.nodo = { tipo: 'grupo', campos: [campo('Datos', datos.nodo), campo('Tabla de Excel', tabla)] };
      }
      if (datos.vista === 'codigo') verVistaDatos('formulario');
      cambioDatos('estructura');
      aviso('Tabla agregada: ' + plural(tabla.filas.length, 'fila', 'filas') + ', ' + plural(tabla.columnas.length, 'columna', 'columnas'));
    });
  });
  $('datos-abrir').addEventListener('change', function () {
    W.abrirArchivos(this.files);
    this.value = '';
  });
  $('datos-descargar').addEventListener('click', function () {
    if (datos.vista === 'codigo' && !aplicarCodigoDatos()) return;
    var nombre = nombreArchivo($('datos-nombre').value, 'datos') + '.' + datos.formato;
    var tipo = datos.formato === 'xml' ? 'application/xml' : 'application/json';
    W.descargarBlob(new Blob([textoDatos() + '\n'], { type: tipo + ';charset=utf-8' }), nombre);
    aviso('Descargado ' + nombre);
  });
  $('datos-copiar').addEventListener('click', function () {
    if (datos.vista === 'codigo' && !aplicarCodigoDatos()) return;
    W.copiarTexto(textoDatos(), datos.formato.toUpperCase() + ' copiado');
  });

  // =====================================================================
  // 5. Editor de documentos (.md con secciones de datos)
  // =====================================================================
  var doc = { vista: 'formateado', bloques: {}, siguiente: 1, imagenes: {}, rango: null, codigo: null, consejos: [] };
  var editor = $('doc-editor');
  var codigoDoc = editorCodigo($('doc-codigo').querySelector('.editor-codigo'), resaltarMd);
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) { /* navegador antiguo */ }

  // Turndown propio: las secciones de datos y las imágenes del documento tienen reglas especiales.
  var tdDoc = W.nuevoTurndown();
  tdDoc.addRule('bloqueDatos', {
    filter: function (n) { return n.nodeType === 1 && n.hasAttribute('data-bloque'); },
    replacement: function (c, n) {
      var b = doc.bloques[n.getAttribute('data-bloque')];
      return b ? '\n\n```' + b.formato + '\n' + textoBloque(b) + '\n```\n\n' : '';
    }
  });
  tdDoc.addRule('imagenDoc', {
    filter: function (n) { return n.nodeName === 'IMG' && n.hasAttribute('data-ruta'); },
    replacement: function (c, n) { return '![' + (n.getAttribute('alt') || '').replace(/[\[\]]/g, '') + '](' + n.getAttribute('data-ruta') + ')'; }
  });

  function textoBloque(b) { return b.formato === 'xml' ? aXml(b.nodo, b.nombre || 'datos', '') : aJson(b.nodo); }

  function nuevoBloque(nodo, formato, nombre) {
    var id = String(doc.siguiente++);
    doc.bloques[id] = { nodo: nodo, formato: formato, nombre: nombre || 'datos' };
    return id;
  }

  // Tabla lista para llenar; la usan "Insertar › Datos" y la plantilla del acta.
  function tablaInicial() {
    return { tipo: 'tabla', fila: 'elemento', columnas: [columna('Nombre', 'texto'), columna('Cantidad', 'numero')], filas: [['', null]] };
  }

  function pintarBloque(id) {
    var b = doc.bloques[id];
    var caja = el('div', { clase: 'bloque-datos', contenteditable: 'false', 'data-bloque': id, role: 'group', 'aria-label': 'Sección de datos ' + b.formato.toUpperCase() });
    var ctx = {
      formato: function () { return b.formato; },
      cambio: function (tipo) { if (tipo === 'estructura') repintarBloque(id); cambioDoc(); }
    };
    var formatos = el('div', { clase: 'interruptor mini', role: 'group', 'aria-label': 'Formato de la sección' },
      ['json', 'xml'].map(function (f) {
        return el('button', {
          type: 'button', 'aria-pressed': b.formato === f ? 'true' : 'false', texto: f.toUpperCase(),
          onclick: function () { b.formato = f; repintarBloque(id); cambioDoc(); }
        });
      }));
    var nombre = null;
    if (b.formato === 'xml') {
      nombre = el('input', { type: 'text', clase: 'bloque-nombre', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Etiqueta principal del XML', title: 'Etiqueta principal del XML' });
      nombre.value = b.nombre;
      nombre.addEventListener('input', function () { b.nombre = nombreXml(nombre.value.trim() || 'datos'); cambioDoc(); });
    }
    var cabeza = el('div', { clase: 'bloque-cabeza' }, [
      el('span', { clase: 'bloque-chip', 'aria-hidden': 'true', texto: b.formato === 'xml' ? '</>' : '{ }' }),
      el('span', { clase: 'bloque-titulo', texto: 'Datos' }),
      nombre,
      formatos,
      botonQuitar('Quitar la sección de datos', function () {
        caja.remove();
        delete doc.bloques[id];
        cambioDoc();
      })
    ]);
    caja.appendChild(cabeza);
    caja.appendChild(el('div', { clase: 'bloque-cuerpo' }, [pintarRaiz(b.nodo, ctx)]));
    // Lo que se escribe dentro del bloque no es texto del documento.
    ['keydown', 'paste', 'beforeinput', 'input', 'drop'].forEach(function (ev) {
      caja.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
    return caja;
  }
  function repintarBloque(id) {
    var viejo = editor.querySelector('[data-bloque="' + id + '"]');
    if (!viejo) return;
    var nuevo = pintarBloque(id);
    viejo.replaceWith(nuevo);
    enfocarPendiente(nuevo);
  }

  // Markdown → HTML del editor. Las secciones ```json/```xml válidas se vuelven formularios.
  function htmlDesdeMarkdown(md, avisos) {
    var html = marked.parse(md || '', { gfm: true, breaks: false });
    var d = new DOMParser().parseFromString('<div id="r">' + html + '</div>', 'text/html');
    var r = d.getElementById('r');
    W.limpiarHtml(r);
    r.querySelectorAll('pre > code').forEach(function (code) {
      var m = (code.className || '').match(/language-(json|xml)\b/);
      if (!m) return;
      try {
        var res = leerDatos(code.textContent, m[1]);
        var marca = d.createElement('div');
        marca.setAttribute('data-bloque', nuevoBloque(res.nodo, m[1], res.nombre));
        code.parentNode.replaceWith(marca);
      } catch (e) {
        if (!(e instanceof ErrorDatos)) throw e;
        if (avisos) avisos.push('Una sección ```' + m[1] + ' tiene un error y quedó como código: ' + e.message);
      }
    });
    r.querySelectorAll('img').forEach(function (img) {
      var ruta = img.getAttribute('src'), dato = doc.imagenes[ruta];
      if (dato) { img.setAttribute('data-ruta', ruta); img.setAttribute('src', 'data:' + dato.tipo + ';base64,' + dato.base64); }
    });
    r.querySelectorAll('a[href]').forEach(function (a) { a.removeAttribute('target'); });
    var frag = document.createDocumentFragment();
    Array.prototype.slice.call(r.childNodes).forEach(function (n) { frag.appendChild(document.importNode(n, true)); });
    frag.querySelectorAll('[data-bloque]').forEach(function (m) { m.replaceWith(pintarBloque(m.getAttribute('data-bloque'))); });
    return frag;
  }

  // Un documento vacío empieza con un título y un párrafo con textos de ayuda.
  function marcarVacios() {
    if (!editor.firstElementChild) editor.innerHTML = '<h1><br></h1><p><br></p>';
    var hijos = editor.children;
    Array.prototype.forEach.call(hijos, function (h, i) {
      var vacio = !h.textContent.trim() && /^(H[1-6]|P)$/.test(h.nodeName) && !h.querySelector('img');
      var pista = null;
      if (vacio && i === 0 && /^H/.test(h.nodeName)) pista = 'Título del documento';
      else if (vacio && i === 1 && hijos.length === 2 && h.nodeName === 'P') pista = 'Empieza a escribir aquí…';
      if (pista) h.setAttribute('data-pista', pista); else h.removeAttribute('data-pista');
    });
  }
  // Siempre debe haber un párrafo después de una tabla o sección de datos para seguir escribiendo.
  function asegurarParrafoFinal() {
    var ultimo = editor.lastElementChild;
    if (!ultimo || !/^(P|H[1-6])$/.test(ultimo.nodeName)) editor.appendChild(el('p', {}, [el('br')]));
  }

  function markdownDelEditor() {
    var copiaEd = editor.cloneNode(true);
    copiaEd.querySelectorAll('[data-pista]').forEach(function (n) { n.removeAttribute('data-pista'); });
    copiaEd.querySelectorAll('pre').forEach(function (pre) {
      pre.querySelectorAll('br').forEach(function (br) { br.replaceWith('\n'); });
      pre.querySelectorAll('div,p').forEach(function (d) { d.replaceWith('\n' + d.textContent); });
    });
    W.prepararCodigo(copiaEd);
    if (!copiaEd.textContent.trim() && !copiaEd.querySelector('[data-bloque],img,hr,table')) return '';
    return W.limpiarMarkdown(tdDoc.turndown(copiaEd));
  }
  function markdownActual() { return doc.vista === 'codigo' ? codigoDoc.valor() : markdownDelEditor(); }

  function cargarEnEditor(md, avisos) {
    doc.bloques = {};
    editor.innerHTML = '';
    if (md.trim()) editor.appendChild(htmlDesdeMarkdown(md, avisos));
    else editor.innerHTML = '<h1><br></h1><p><br></p>';
    asegurarParrafoFinal();
    marcarVacios();
  }

  function cargarDocumento(md, opciones) {
    opciones = opciones || {};
    doc.imagenes = opciones.imagenes || {};
    doc.consejos = opciones.consejos || [];
    $('doc-nombre').value = opciones.nombre || 'documento';
    var avisos = [];
    doc.vista = 'formateado';
    cargarEnEditor(md, avisos);
    // Las etiquetas con acentos de las secciones de datos se guardan aparte (el .md solo tiene claves).
    (opciones.etiquetas || []).forEach(function (viejo, i) {
      var n = editor.querySelectorAll('[data-bloque]')[i];
      var b = n && doc.bloques[n.getAttribute('data-bloque')];
      if (b && viejo && b.formato === viejo.formato) { heredarEtiquetas(b.nodo, viejo.nodo); repintarBloque(n.getAttribute('data-bloque')); }
    });
    ['doc-tipo', 'doc-insertar'].forEach(function (id) { $(id).disabled = false; });
    document.querySelectorAll('#doc-formato button').forEach(function (b) { b.disabled = false; });
    $('doc-hoja').hidden = false;
    $('doc-codigo').hidden = true;
    document.querySelectorAll('#doc-vistas button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.vista === 'formateado' ? 'true' : 'false');
    });
    mostrarError('doc-error', avisos.join(' '));
    pintarConsejosOrigen();
    pintarPanelDoc();
  }

  // Consejos de la conversión (Word, Excel, PowerPoint), hasta que la persona los cierre.
  function pintarConsejosOrigen() {
    var caja = $('doc-origen');
    caja.hidden = !doc.consejos.length;
    var lista = caja.querySelector('ul');
    lista.innerHTML = '';
    doc.consejos.forEach(function (c) { lista.appendChild(el('li', { texto: c })); });
  }
  $('doc-origen-cerrar').addEventListener('click', function () {
    doc.consejos = [];
    pintarConsejosOrigen();
    avisarCambio();
  });

  function verVistaDoc(vista) {
    if (vista === doc.vista) return;
    if (vista === 'codigo') {
      doc.codigo = markdownDelEditor();
      codigoDoc.poner(doc.codigo);
    } else {
      var t = codigoDoc.valor();
      if (t !== doc.codigo) {
        try { validarSecciones(t); }
        catch (e) {
          if (!(e instanceof ErrorDatos)) throw e;
          mostrarError('doc-error', e.message);
          codigoDoc.marcar(e.linea);
          return;
        }
        // Conserva los nombres bonitos de las secciones de datos, en orden.
        var viejos = Array.prototype.map.call(editor.querySelectorAll('[data-bloque]'), function (n) { return doc.bloques[n.getAttribute('data-bloque')]; });
        cargarEnEditor(t);
        Array.prototype.forEach.call(editor.querySelectorAll('[data-bloque]'), function (n, i) {
          var b = doc.bloques[n.getAttribute('data-bloque')];
          if (viejos[i] && b && viejos[i].formato === b.formato) { heredarEtiquetas(b.nodo, viejos[i].nodo); repintarBloque(n.getAttribute('data-bloque')); }
        });
      }
    }
    doc.vista = vista;
    $('doc-hoja').hidden = vista !== 'formateado';
    $('doc-codigo').hidden = vista !== 'codigo';
    document.querySelectorAll('#doc-vistas button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.vista === vista ? 'true' : 'false');
    });
    ['doc-tipo', 'doc-insertar'].forEach(function (id) { $(id).disabled = vista !== 'formateado'; });
    document.querySelectorAll('#doc-formato button').forEach(function (b) { b.disabled = vista !== 'formateado'; });
    mostrarError('doc-error', '');
    pintarPanelDoc();
  }

  function rutasUsadas(md) {
    return Object.keys(doc.imagenes).filter(function (ruta) { return md.indexOf('(' + ruta + ')') >= 0; });
  }

  var relojPanel;
  function cambioDoc() {
    clearTimeout(relojPanel);
    relojPanel = setTimeout(pintarPanelDoc, 250);
    avisarCambio();
  }

  function pintarPanelDoc() {
    var md = markdownActual();
    var e = W.contar(md, 0);
    var secciones = seccionesDeDatos(md);
    var chips = [plural(e.titulos, 'título', 'títulos')];
    if (secciones.length) chips.push(plural(secciones.length, 'sección de datos', 'secciones de datos'));
    chips.push(plural(e.palabras, 'palabra', 'palabras'));
    var caja = $('doc-chips');
    caja.innerHTML = '';
    chips.forEach(function (c) { caja.appendChild(el('span', { texto: c })); });
    var conImagenes = rutasUsadas(md).length > 0;
    $('doc-descargar').querySelector('span').textContent = conImagenes ? 'Descargar .zip' : 'Descargar .md';
    var bDatos = $('doc-datos');
    bDatos.hidden = !secciones.length;
    bDatos.textContent = secciones.length === 1 ? 'Descargar solo los datos (.' + secciones[0].formato + ')' : 'Descargar solo los datos (.zip)';
    var consejo = doc.vista === 'formateado'
      ? (secciones.length
        ? ['Las secciones negras son de datos.', 'Llénalas como un formulario. En el .md se guardan como ```json o ```xml para que otros programas las lean.']
        : ['Escribe como en Word.', 'Elige el tipo de texto en el botón amarillo, o escribe # y un espacio para un título. Con «+ Insertar» agregas tablas, imágenes y secciones de datos.'])
      : ['Así queda tu .md.', 'Puedes corregirlo aquí. Si una sección ```json o ```xml tiene un error, te marcamos la línea antes de volver a Formateado.'];
    $('doc-consejo').innerHTML = '';
    $('doc-consejo').appendChild(el('b', { texto: consejo[0] }));
    $('doc-consejo').appendChild(document.createTextNode(' ' + consejo[1]));
  }

  // Lo que pestanas.js guarda de la pestaña de documento.
  function estadoDocumento() {
    var md = markdownActual();
    var imagenes = {};
    rutasUsadas(md).forEach(function (r) { imagenes[r] = doc.imagenes[r]; });
    var etiquetas = Array.prototype.map.call(editor.querySelectorAll('[data-bloque]'), function (n) { return doc.bloques[n.getAttribute('data-bloque')]; });
    return { nombre: $('doc-nombre').value, md: md, imagenes: imagenes, etiquetas: etiquetas, consejos: doc.consejos };
  }

  // ---------- Selección y tipo de texto ----------
  function dentroDelEditor(n) { return n && (n === editor || editor.contains(n)); }
  function guardarSeleccion() {
    var sel = window.getSelection();
    if (sel.rangeCount && dentroDelEditor(sel.anchorNode)) doc.rango = sel.getRangeAt(0).cloneRange();
  }
  function restaurarSeleccion() {
    editor.focus();
    if (!doc.rango || !dentroDelEditor(doc.rango.startContainer)) return;
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(doc.rango);
  }
  function elementoDe(n) { return n && n.nodeType === 3 ? n.parentNode : n; }
  function bloqueActual() {
    var sel = window.getSelection();
    if (!sel.rangeCount || !dentroDelEditor(sel.anchorNode)) return null;
    var b = elementoDe(sel.anchorNode).closest('h1,h2,h3,h4,h5,h6,p,blockquote,pre,li,td,th,div');
    return b && dentroDelEditor(b) && b !== editor ? b : null;
  }
  // El hijo directo del editor donde está el cursor (un párrafo, una tabla, una lista…).
  function bloqueSuperior() {
    var n = doc.rango ? doc.rango.startContainer : null;
    if (!n || !dentroDelEditor(n)) return null;
    if (n === editor) return editor.children[Math.max(0, doc.rango.startOffset - 1)] || null;
    while (n.parentNode !== editor) n = n.parentNode;
    return n;
  }

  var TIPOS_TEXTO = [
    { id: 'p', nombre: 'Párrafo', atajo: 'Ctrl+Mayús+0', clase: 'm-p' },
    { id: 'h1', nombre: 'Título 1', atajo: 'Ctrl+Mayús+1', clase: 'm-h1' },
    { id: 'h2', nombre: 'Título 2', atajo: 'Ctrl+Mayús+2', clase: 'm-h2' },
    { id: 'h3', nombre: 'Título 3', atajo: 'Ctrl+Mayús+3', clase: 'm-h3' },
    { separador: true },
    { id: 'blockquote', nombre: 'Cita', clase: 'm-cita' },
    { id: 'pre', nombre: 'Código', clase: 'm-codigo' }
  ];
  function tipoActual() {
    var b = bloqueActual();
    if (!b) return 'p';
    if (b.closest('blockquote')) return 'blockquote';
    if (b.closest('pre')) return 'pre';
    if (b.closest('li')) return 'li';
    return /^H[1-6]$/.test(b.nodeName) ? b.nodeName.toLowerCase() : 'p';
  }
  function actualizarTipo() {
    var t = tipoActual();
    var nombres = { p: 'Párrafo', h1: 'Título 1', h2: 'Título 2', h3: 'Título 3', h4: 'Título 4', h5: 'Título 5', h6: 'Título 6', blockquote: 'Cita', pre: 'Código', li: 'Lista' };
    $('doc-tipo').querySelector('span').textContent = nombres[t] || 'Párrafo';
  }
  function aplicarTipo(tag) {
    restaurarSeleccion();
    var actual = tipoActual();
    if (actual === 'li') document.execCommand(bloqueActual().closest('ol') ? 'insertOrderedList' : 'insertUnorderedList');
    if (actual === 'blockquote' && tag !== 'blockquote') document.execCommand('outdent');
    if (!(actual === 'blockquote' && tag === 'p')) document.execCommand('formatBlock', false, '<' + tag + '>');
    guardarSeleccion();
    marcarVacios();
    actualizarTipo();
    cambioDoc();
  }

  // ---------- Insertar ----------
  var INSERTAR = [
    { id: 'tabla', nombre: 'Tabla', ayuda: 'Filas y columnas que se leen en el documento', chip: '| |', chipClase: 't-lista' },
    { id: 'imagen', nombre: 'Imagen', ayuda: 'Una foto o un dibujo de tu computadora', chip: 'img', chipClase: 't-lista' },
    { id: 'pre', nombre: 'Bloque de código', ayuda: 'Texto que se copia tal cual', chip: '```', chipClase: 't-lista' },
    { id: 'hr', nombre: 'Separador', ayuda: 'Una línea para dividir secciones', chip: '—', chipClase: 't-lista' },
    { separador: true },
    { id: 'json', nombre: 'Datos en JSON', ayuda: 'Se llena como formulario; se guarda como ```json', chip: '{ }', chipClase: 't-bloque' },
    { id: 'xml', nombre: 'Datos en XML', ayuda: 'Se llena como formulario; se guarda como ```xml', chip: '</>', chipClase: 't-bloque' }
  ];
  function insertarBloqueDatos(formato) {
    var id = nuevoBloque(tablaInicial(), formato, 'datos');
    var caja = pintarBloque(id);
    var ancla = bloqueSuperior();
    if (ancla && ancla.nodeName === 'P' && !ancla.textContent.trim() && !ancla.querySelector('img')) ancla.replaceWith(caja);
    else if (ancla) ancla.after(caja);
    else editor.appendChild(caja);
    if (!caja.nextElementSibling || caja.nextElementSibling.hasAttribute('data-bloque')) caja.after(el('p', {}, [el('br')]));
    marcarVacios();
    var primera = caja.querySelector('.entrada-celda');
    if (primera) primera.focus();
    cambioDoc();
  }
  function insertar(id) {
    if (id === 'json' || id === 'xml') { insertarBloqueDatos(id); return; }
    if (id === 'imagen') { $('doc-imagen').click(); return; }
    if (id === 'pre') { aplicarTipo('pre'); return; }
    restaurarSeleccion();
    if (id === 'tabla') {
      document.execCommand('insertHTML', false, '<table><thead><tr><th>Columna 1</th><th>Columna 2</th><th>Columna 3</th></tr></thead>' +
        '<tbody><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>');
    } else if (id === 'hr') {
      document.execCommand('insertHTML', false, '<hr><p><br></p>');
    }
    marcarVacios();
    cambioDoc();
  }

  $('doc-imagen').addEventListener('change', function () {
    var archivo = this.files[0];
    this.value = '';
    if (archivo) insertarImagen(archivo);
  });
  // La imagen se ve en el editor con un data: URI, pero en el .md queda como imagenes/imagen-N.ext.
  function insertarImagen(archivo) {
    var lector = new FileReader();
    lector.onload = function () {
      var partes = String(lector.result).match(/^data:([^;]+);base64,(.*)$/);
      if (!partes) return;
      var ext = (partes[1].split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '');
      var n = 1;
      while (doc.imagenes['imagenes/imagen-' + n + '.' + ext]) n++;
      var ruta = 'imagenes/imagen-' + n + '.' + ext;
      doc.imagenes[ruta] = { tipo: partes[1], base64: partes[2] };
      var alt = archivo.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/"/g, '');
      restaurarSeleccion();
      document.execCommand('insertHTML', false, '<img src="' + lector.result + '" alt="' + W.escapar(alt) + '" data-ruta="' + ruta + '">');
      cambioDoc();
    };
    lector.readAsDataURL(archivo);
  }
  function imagenesDe(lista) {
    return Array.prototype.filter.call(lista || [], function (f) { return /^image\//.test(f.type); });
  }
  // Soltar o pegar una imagen dentro del documento la inserta ahí mismo.
  editor.addEventListener('drop', function (e) {
    var imgs = imagenesDe(e.dataTransfer && e.dataTransfer.files);
    if (!imgs.length) return;
    e.preventDefault();
    e.stopPropagation();
    if (document.caretRangeFromPoint) {
      var r = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (r && dentroDelEditor(r.startContainer)) doc.rango = r;
    }
    imgs.forEach(insertarImagen);
  });

  function pedirEnlace() {
    restaurarSeleccion();
    var rango = doc.rango ? doc.rango.cloneRange() : null;
    var texto = rango ? rango.toString() : '';
    pedir({ titulo: 'Agregar un enlace', texto: 'Pega la dirección de la página.', pista: 'https://…', ok: 'Agregar' }).then(function (url) {
      if (!url || !url.trim()) return;
      url = url.trim();
      if (/^\s*javascript:/i.test(url)) return;
      if (!/^([a-z]+:|#|\/|\.)/i.test(url)) url = 'https://' + url;
      doc.rango = rango;
      restaurarSeleccion();
      if (texto) document.execCommand('createLink', false, url);
      else document.execCommand('insertHTML', false, '<a href="' + W.escapar(url).replace(/"/g, '&quot;') + '">' + W.escapar(url) + '</a>');
      cambioDoc();
    });
  }

  // ---------- Eventos del editor ----------
  document.addEventListener('selectionchange', function () {
    if (document.activeElement !== editor) return;
    guardarSeleccion();
    actualizarTipo();
  });
  editor.addEventListener('input', function (e) {
    atajosMarkdown(e);
    marcarVacios();
    cambioDoc();
  });
  editor.addEventListener('keydown', function (e) {
    var ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.shiftKey && !e.altKey && /^Digit[0-3]$/.test(e.code)) {
      e.preventDefault();
      aplicarTipo(e.code === 'Digit0' ? 'p' : 'h' + e.code.slice(-1));
    } else if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      guardarSeleccion();
      pedirEnlace();
    }
  });
  // "# " al inicio de un párrafo lo vuelve título (y "- ", "1. ", "> " hacen listas y citas).
  function atajosMarkdown(e) {
    if (e.inputType !== 'insertText' || e.data !== ' ') return;
    var b = bloqueActual();
    if (!b || b.nodeName !== 'P' || b.closest('blockquote,li,td,th')) return;
    var sel = window.getSelection();
    var hasta = document.createRange();
    hasta.setStart(b, 0);
    hasta.setEnd(sel.anchorNode, sel.anchorOffset);
    var antes = hasta.toString().replace(/\u00a0/g, ' ');
    var m = antes.match(/^(#{1,3}|[-*]|1\.|>) $/);
    if (!m) return;
    sel.removeAllRanges();
    sel.addRange(hasta);
    document.execCommand('delete');
    var marca = m[1];
    if (marca.charAt(0) === '#') document.execCommand('formatBlock', false, '<h' + marca.length + '>');
    else if (marca === '>') document.execCommand('formatBlock', false, '<blockquote>');
    else document.execCommand(marca === '1.' ? 'insertOrderedList' : 'insertUnorderedList');
    guardarSeleccion();
    actualizarTipo();
  }
  // Lo pegado se limpia pasándolo por Markdown: queda con la misma estructura que lo escrito aquí.
  editor.addEventListener('paste', function (e) {
    var cd = e.clipboardData;
    if (!cd) return;
    var imgs = imagenesDe(cd.files);
    if (imgs.length) { e.preventDefault(); guardarSeleccion(); imgs.forEach(insertarImagen); return; }
    var html = cd.getData('text/html'), texto = cd.getData('text/plain');
    if (!html && !texto) return;
    e.preventDefault();
    var md = html ? tdDoc.turndown(html) : texto;
    if (!html && !/[\n#*_>`|\[]/.test(texto)) { document.execCommand('insertText', false, texto); return; }
    var cont = document.createElement('div');
    var avisos = [];
    cont.appendChild(htmlDesdeMarkdown(md, avisos));
    // Las secciones de datos se insertan después como formularios (insertHTML no conserva sus eventos).
    var pendientes = [];
    cont.querySelectorAll('[data-bloque]').forEach(function (b) {
      pendientes.push(b.getAttribute('data-bloque'));
      b.replaceWith(el('p', { 'data-pendiente': b.getAttribute('data-bloque') }, ['·']));
    });
    document.execCommand('insertHTML', false, cont.innerHTML);
    pendientes.forEach(function (id) {
      var marca = editor.querySelector('[data-pendiente="' + id + '"]');
      if (marca) marca.replaceWith(pintarBloque(id));
    });
    asegurarParrafoFinal();
    marcarVacios();
    if (avisos.length) aviso(avisos[0]);
    cambioDoc();
  });

  // Botones de la barra: mousedown sin foco para no perder la selección del texto.
  document.querySelectorAll('#vista-documento .barra-editor button').forEach(function (b) {
    b.addEventListener('mousedown', function (e) { if (doc.vista === 'formateado') { guardarSeleccion(); e.preventDefault(); } });
  });
  document.querySelectorAll('#doc-vistas button').forEach(function (b) {
    b.addEventListener('click', function () { verVistaDoc(b.dataset.vista); });
  });
  $('doc-tipo').addEventListener('click', function () {
    var actual = tipoActual();
    abrirMenu($('doc-tipo'), 'Tipo de texto', TIPOS_TEXTO.map(function (t) {
      return t.separador ? t : Object.assign({ activo: t.id === actual }, t);
    }), aplicarTipo);
  });
  $('doc-insertar').addEventListener('click', function () {
    abrirMenu($('doc-insertar'), 'Insertar en el documento', INSERTAR, insertar);
  });
  document.querySelectorAll('#doc-formato button').forEach(function (b) {
    b.addEventListener('click', function () {
      if (b.dataset.cmd === 'enlace') { pedirEnlace(); return; }
      restaurarSeleccion();
      document.execCommand(b.dataset.cmd);
      guardarSeleccion();
      actualizarTipo();
      cambioDoc();
    });
  });
  $('doc-deshacer').addEventListener('click', function () {
    if (doc.vista === 'codigo') codigoDoc.area.focus(); else restaurarSeleccion();
    document.execCommand('undo');
    if (doc.vista === 'formateado') marcarVacios();
    cambioDoc();
  });
  codigoDoc.area.addEventListener('input', function () { mostrarError('doc-error', ''); cambioDoc(); });
  $('doc-nombre').addEventListener('input', avisarCambio);

  $('doc-descargar').addEventListener('click', function () {
    var md = markdownActual();
    var nombre = nombreArchivo($('doc-nombre').value, 'documento');
    var rutas = rutasUsadas(md);
    if (!rutas.length) {
      W.descargarBlob(new Blob([md], { type: 'text/markdown;charset=utf-8' }), nombre + '.md');
      aviso('Descargado ' + nombre + '.md');
      return;
    }
    var zip = new JSZip();
    zip.file(nombre + '.md', md);
    rutas.forEach(function (r) { zip.file(r, doc.imagenes[r].base64, { base64: true }); });
    zip.generateAsync({ type: 'blob' }).then(function (blob) {
      W.descargarBlob(blob, nombre + '.zip');
      aviso('Descargado ' + nombre + '.zip');
    });
  });
  $('doc-copiar').addEventListener('click', function () { W.copiarTexto(markdownActual(), 'Markdown copiado'); });
  $('doc-datos').addEventListener('click', function () {
    var secciones = seccionesDeDatos(markdownActual());
    var nombre = nombreArchivo($('doc-nombre').value, 'documento') + '-datos';
    var contenido = function (s) { return (s.formato === 'xml' ? '<?xml version="1.0" encoding="UTF-8"?>\n' : '') + s.texto + '\n'; };
    if (secciones.length === 1) {
      var s = secciones[0];
      W.descargarBlob(new Blob([contenido(s)], { type: (s.formato === 'xml' ? 'application/xml' : 'application/json') + ';charset=utf-8' }), nombre + '.' + s.formato);
      aviso('Descargado ' + nombre + '.' + s.formato);
      return;
    }
    var zip = new JSZip();
    secciones.forEach(function (s, i) { zip.file(nombre + '-' + (i + 1) + '.' + s.formato, contenido(s)); });
    zip.generateAsync({ type: 'blob' }).then(function (blob) {
      W.descargarBlob(blob, nombre + '.zip');
      aviso('Descargadas ' + plural(secciones.length, 'sección', 'secciones') + ' de datos');
    });
  });

  // Ctrl+M cambia entre la vista con formato y la de código.
  document.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'm') return;
    if (!$('vista-documento').hidden) { e.preventDefault(); verVistaDoc(doc.vista === 'formateado' ? 'codigo' : 'formateado'); }
    else if (!$('vista-datos').hidden) { e.preventDefault(); verVistaDatos(datos.vista === 'formulario' ? 'codigo' : 'formulario'); }
  });

  // =====================================================================
  // 6. Lo que usan los demás archivos
  // =====================================================================
  W.editorDoc = {
    cargar: function (reg) { cargarDocumento(reg.md || '', reg); },
    estado: estadoDocumento,
    enfocar: function () { if (doc.vista === 'formateado') editor.focus(); else codigoDoc.area.focus(); }
  };
  W.editorDatos = {
    cargar: cargarRegistroDatos,
    estado: estadoDatos
  };
  W.datos = {
    campo: campo, columna: columna, nuevoNodo: nuevoNodo, tieneContenido: tieneContenido,
    aJson: aJson, aXml: aXml, aXmlDocumento: aXmlDocumento, aValor: aValor,
    leerDatos: leerDatos, tablaDesdeTsv: tablaDesdeTsv, tablaDesdeCeldas: tablaDesdeCeldas,
    seccionesDeDatos: seccionesDeDatos, ErrorDatos: ErrorDatos, hoy: hoy, nombreArchivo: nombreArchivo, leerTexto: leerTexto,
    menuTipos: menuTipos, abrirMenu: abrirMenu, pedir: pedir, el: el
  };

  // Para las pruebas (herramientas/probar-crear.js).
  W.crear = {
    aJson: aJson, aXml: aXml, aXmlDocumento: aXmlDocumento, aValor: aValor,
    desdeValor: desdeValor, leerDatos: leerDatos, tablaDesdeTsv: tablaDesdeTsv, tablaDesdeCeldas: tablaDesdeCeldas, leerTsv: leerTsv,
    heredarEtiquetas: heredarEtiquetas, seccionesDeDatos: seccionesDeDatos, validarSecciones: validarSecciones,
    ErrorDatos: ErrorDatos, aClave: aClave, etiquetaDe: etiquetaDe, nombreXml: nombreXml,
    cargarDocumento: cargarDocumento, markdownDelEditor: markdownDelEditor, verVistaDoc: verVistaDoc,
    cargarDatos: cargarDatos, cargarDatosTexto: cargarDatosTexto, verVistaDatos: verVistaDatos, cambiarFormatoDatos: cambiarFormatoDatos,
    textoDatos: textoDatos, estado: { doc: doc, datos: datos }
  };
})();
