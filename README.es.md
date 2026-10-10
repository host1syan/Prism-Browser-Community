# Prism Browser Community

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Português (Brasil)](README.pt-BR.md)

[Français](README.fr.md) | [Українська](README.uk.md) | **[Español](README.es.md)** | [Türkçe](README.tr.md) | [日本語](README.ja.md) | [हिन्दी](README.hi.md)

Autor: [DFarm](https://x.com/DFarm_club) · Sitio oficial: [prismbrowser.app](https://prismbrowser.app/)

Prism Browser es un gestor local de perfiles de navegador con huellas digitales, basado en Chromium personalizado. Cada perfil dispone de cookies, caché, datos de extensiones, ajustes de proxy y configuración de huella independientes para mantener varias identidades de navegación aisladas.

Los perfiles, las cookies, las credenciales de proxy y el historial permanecen en el dispositivo del usuario de forma predeterminada. La edición Community es gratuita y no limita el número de perfiles locales.

## Mantenimiento del código fuente

Este repositorio seguirá siendo público para estudiar, revisar y compilar el proyecto. Desde `v0.3.17`, las funciones, correcciones y cambios del código del producto ya no se sincronizan regularmente aquí. La creciente complejidad de la aplicación, los motores, los paquetes multiplataforma y las funciones Pro ha elevado el coste de mantener y probar varias ramas.

Como excepción, esta actualización incorpora la localización general de 0.3.19 y traduce la interfaz pública existente. No incluye entornos de ejecución privados de Pro, servicios de licencias, nuevas funciones Pro ni configuración privada de publicación. No supone reanudar la sincronización continua del código del producto.

Se conservan el código existente, los commits y las versiones anteriores. Consulta el [sitio oficial](https://prismbrowser.app/) y [Releases](../../releases) para obtener novedades, correcciones e instaladores.

## Idiomas

La interfaz y el README están disponibles en **13 idiomas**: chino simplificado y tradicional, inglés, ruso, vietnamita, tailandés, portugués de Brasil, francés, ucraniano, español, turco, japonés e hindi. Usa los enlaces superiores para cambiar el idioma del README.

- Al iniciar, se utiliza el idioma de visualización principal del sistema; si no está disponible o no se admite, se usa inglés.
- El selector de la esquina superior derecha permite cambiar al instante. La elección manual se guarda localmente y tiene prioridad en futuros inicios.
- El idioma de la interfaz es independiente del idioma y la zona horaria de la huella del perfil. Se conservan nombres, notas, etiquetas y cambios sin guardar.
- Las traducciones están incluidas en la aplicación, sin servicios de traducción en línea. Para contribuir, consulta la [guía de localización en chino e inglés](docs/localization.md).

## Descargar y empezar

Descarga desde [Releases](../../releases) el paquete para tu sistema: DMG o ZIP para macOS; instalador o versión Portable sin instalación para Windows. Los paquetes publicados incluyen un motor Chromium 144 con huellas digitales listo para usar; no necesitas compilar Chromium.

Si el sistema bloquea una versión sin firmar, confirma su apertura en **Ajustes del Sistema → Privacidad y seguridad** en macOS, o en **Más información → Ejecutar de todas formas** de SmartScreen en Windows. Descarga solo desde Releases de este proyecto y compara el SHA-256 con el publicado para la versión.

1. Abre Prism Browser y crea un perfil nuevo.
2. Introduce un nombre y elige sistema, idioma, zona horaria, pantalla e identidad de hardware.
3. Usa conexión directa si no necesitas proxy; de lo contrario, introduce protocolo, servidor, puerto y credenciales, y prueba la conexión.
4. Guarda y abre el perfil. Al cerrar la ventana, se conservan sus cookies, caché, marcadores y datos de extensiones.

Cada perfil utiliza su propio directorio de datos. Al duplicarlo, se conservan los ajustes y se genera una identidad y una semilla nuevas.

## Funciones

Todo se ejecuta en la máquina local: no hay cuenta, suscripción ni activación. La API de automatización local, las tareas programadas y el control de IA local mediante MCP forman parte de la versión gratuita, y el núcleo de huellas se incluye con la aplicación.

Community ofrece perfiles locales ilimitados, datos de navegación independientes, proxies HTTP/HTTPS/SOCKS5 y protección contra fugas WebRTC. Permite configurar User-Agent, idioma, zona horaria, pantalla, CPU, memoria y GPU, manteniendo coherencia entre Canvas, WebGL, Audio, DOMRect, fuentes, Speech y WebGPU.

Incluye duplicación, grupos, etiquetas, favoritos, operaciones por lotes, papelera y migración local de cookies, perfiles o del espacio de trabajo completo. Los iconos del Dock de macOS y de la barra de tareas de Windows pueden mostrar el número del perfil.

## Verificación

El proyecto utiliza Pixelscan, CreepJS, BrowserLeaks, IPhey y las herramientas de matriz de huellas y auditoría de datos de Prism para revisar la coherencia de identidad, estabilidad al reiniciar con la misma semilla, separación entre semillas, coherencia entre iframe/Worker y persistencia del almacenamiento.

Las pruebas de terceros cambian; no se garantiza superarlas todas indefinidamente. La calidad del proxy, reputación de IP, escritorio remoto, fuentes del sistema y hardware real también influyen.

## Desarrollo y compilación

Se requieren Node.js 22 o posterior, npm y las herramientas básicas de compilación de tu plataforma. Desde la raíz del repositorio:

```bash
# Instalar, comprobar y compilar
npm ci
npm run typecheck
npm run build

# Modo de desarrollo
npm run dev

# Paquete para macOS
npm run dist:mac

# Paquete para Windows
npm run dist:win
```

Estos comandos de empaquetado no incluyen el motor de huellas. Para compilar Chromium 144 se recomiendan 32 GB de RAM, unos 300 GB libres en SSD y una ruta corta sin espacios.

- macOS arm64: Xcode, Git, Python 3, Ninja y un volumen APFS. Acepta la licencia de Xcode y sigue la [guía de compilación](tools/macos-kernel/README.md).
- Windows x64: Windows 10/11, Visual Studio con desarrollo de escritorio en C++, Windows SDK, Git, Python 3 y un volumen NTFS. Se recomienda un entorno virtual limpio de Python. Consulta la [guía de compilación](tools/windows-kernel/README.md).

`tools/kernel-lock.json` registra versiones fijadas, commits de origen, orden de parches y SHA-256; los parches compartidos están en `tools/kernel-patches`. Para continuar una compilación interrumpida, vuelve a ejecutar `Build-Kernel` para tu plataforma. Los resultados se guardan en `artifacts/<version>-<platform>` dentro del directorio de compilación, y los registros en `logs`. Los comandos detallados también están en el [README en inglés](README.md).

En la gestión de motores de Prism, importa la compilación local: selecciona `Chromium.app` en macOS o el directorio que contiene `chrome.exe` en Windows. Verifica el motor antes de activarlo; se conservan los datos y ajustes existentes.

## Seguridad y licencia

No publiques códigos de activación, contraseñas de proxy, cookies, información de monederos, claves privadas ni diagnósticos con datos personales en los issues. Incluye pasos mínimos de reproducción, versión, plataforma e impacto, sin información sensible. Un cambio en la puntuación de una prueba de huellas no implica necesariamente una vulnerabilidad; indica sitio, fecha, versión del motor y campos que fallaron.

El código propio de Prism Browser Community usa la [licencia MIT](LICENSE). Chromium, Electron y otros componentes mantienen sus respectivas licencias. Las distribuciones de Chromium deben conservar los archivos `LICENSE`, `LICENSES` y avisos exigidos. La licencia del código no concede automáticamente derechos de marca sobre el nombre, logotipo o iconos de Prism.

Utiliza el proyecto únicamente para aislamiento de navegadores, pruebas automatizadas, investigación de privacidad y gestión de cuentas legales y autorizados, respetando los términos de los sitios y las leyes aplicables.

## Historial de estrellas

[![Prism Browser Community Star History](https://api.star-history.com/svg?repos=DFarm6/Prism-Browser-Community&type=Date)](https://www.star-history.com/#DFarm6/Prism-Browser-Community&Date)
