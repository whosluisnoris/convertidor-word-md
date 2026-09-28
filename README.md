# word.md — Convertidor de Word a Markdown

Convierte archivos `.docx` a Markdown **en tu computadora**: sin internet, sin instalar nada y sin subir tus documentos a ningún sitio.

## Uso rápido

1. Descarga esta carpeta: *Code › Download ZIP* en GitHub, o `git clone`.
2. Abre `index.html` con doble clic.
3. Arrastra tus `.docx` y descarga el `.md`. Si el documento tiene imágenes, se descarga un `.zip` con el `.md` y una carpeta `imagenes/`.

Para que el resultado quede bien, tu Word debe usar estilos (Título 1, Título 2, listas con botones…). Todo está explicado en **[GUIA.md](GUIA.md)**, que también está dentro de la app, en la pestaña **Guía**. Para practicar, usa `ejemplo/plantilla.docx`.

## Qué convierte

Títulos, negrita, cursiva, tachado, enlaces, listas (con subniveles), tablas, citas, bloques de código e imágenes.

## Estructura

```
index.html        la app (ábrela con doble clic)
app.js            lógica de conversión
styles.css        diseño
vendor/           librerías locales: mammoth, turndown, marked, jszip
ejemplo/          plantilla.docx de ejemplo
herramientas/     scripts de desarrollo (Node); la app no los necesita
GUIA.md           guía de uso y de cómo preparar el Word
AGENTS.md         documentación técnica para seguir desarrollando
```

## Desarrollo

Consulta [AGENTS.md](AGENTS.md): arquitectura, secciones del código, restricciones y cómo probar.
