# 🕸️ Atenea: Tu Red de Conocimiento Local-First, Ultraliviana y Reactiva

Atenea es una aplicación de escritorio diseñada para la gestión de conocimiento personal (PKM) que funciona bajo la filosofía **local-first** (tus datos son tuyos, en archivos Markdown estándar en tu disco duro). Combina la reactividad moderna de **Angular 21 (Signals)** con la velocidad de ejecución y bajo consumo de recursos de **Tauri v2 (Rust)**.

---

## 💜 El Corazón del Sistema: Obsidian vs. Atenea

Para refinar el propósito del proyecto, identificamos qué define la esencia de Obsidian y cómo Atenea toma esa fortaleza y la evoluciona hacia una arquitectura moderna de alto rendimiento:

### 1. El Corazón de Obsidian (The Core Philosophy)
*   **Privacidad Absoluta (Local-First):** Las notas son simples archivos `.md` locales. No hay dependencia de servidores externos ni secuestro de datos (no vendor lock-in).
*   **Grafo de Conocimiento No Lineal:** Conectar ideas a través de enlaces bidireccionales (`[[Link]]`) creando una red de pensamientos que imita la estructura asociativa de la mente humana.
*   **Flexibilidad Extrema:** Adaptabilidad a cualquier metodología de organización (Zettelkasten, PARA, etc.) gracias a un formato de texto plano y maleable.

### 2. El Corazón de Atenea (The Atenea Evolution)
Atenea respeta el 100% de la filosofía local-first de Obsidian, pero resuelve sus mayores problemas de rendimiento y arquitectura:
*   **Adiós a Electron (Ultra-Bajo Consumo):** Obsidian está construido sobre Electron, lo que lo hace consumir más de 150MB de RAM en reposo y pesar más de 80MB de descarga. Atenea utiliza **Tauri v2 + Rust**, reduciendo el instalador a **5-15MB** y la memoria RAM en reposo a **menos de 40MB**.
*   **Reactividad de Vanguardia:** Implementa **Angular 21 con Signals**, eliminando ciclos de renderizado pesados y asegurando actualizaciones en la UI (como el explorador y el editor) en milisegundos de manera síncrona.
*   **Grafo Nativo de Alto Rendimiento:** En lugar de wrappers pesados, Atenea utiliza **D3.js** puro conectado directamente a un lienzo SVG controlado reactivamente por Signals, permitiendo una representación visual fluida y con estéticas personalizadas en tiempo real.

---

## 🔗 Propuesta de Refinamiento: WikiLinks vs. Enlaces Estándar de Markdown

Actualmente, Atenea (al igual que Obsidian por defecto) indexa la red de notas a través de **WikiLinks** (`[[Nombre de Nota]]`). Sin embargo, muchos repositorios de documentación y blogs estáticos utilizan **Enlaces Markdown Estándar** (`[Etiqueta](ruta-relativa.md)`). 

A continuación, analizamos la viabilidad, ventajas y retos técnicos de implementar un **Modo Híbrido** en el futuro:

### Tabla Comparativa

| Criterio | WikiLinks (`[[Nota A]]`) | Enlaces Estándar (`[Etiqueta](docs/Nota%20A.md)`) |
| :--- | :--- | :--- |
| **Velocidad de Escritura** | Alta. Solo escribes el nombre del archivo. | Media. Requiere ruta relativa y etiquetas. |
| **Portabilidad Externa** | Baja. Solo funciona en software tipo Wiki (Obsidian, Logseq). | Alta. Funciona nativamente en GitHub, Hugo, Docusaurus, GitLab, etc. |
| **Robustez ante Renombrado** | Excelente. Se indexa por el título de la nota, sin importar su carpeta. | Frágil. Si mueves un archivo de carpeta, los enlaces relativos se rompen. |
| **Manejo de Espacios** | Nativo (`[[Nota con Espacio]]`). | Requiere codificación URL (`[Etiqueta](Nota%20con%20Espacio.md)`). |

### 🛠️ Desafíos Técnicos para un Motor de Enlaces Estándar (Markdown Link Parser)

Si decidimos incorporar soporte para Enlaces Estándar de Markdown, el backend en Rust deberá resolver los siguientes retos complejos de parsing e indexación:

1.  **Resolución de Rutas Relativas:**
    *   Si `/docs/notas/NotaA.md` contiene `[Enlace](../manuales/NotaB.md)`, el indexador de Rust no puede simplemente leer `"../manuales/NotaB.md"`. Debe resolver la ruta relativa contra la ubicación de `NotaA.md` en el disco duro para determinar que apunta a `/docs/manuales/NotaB.md`.
2.  **Decodificación de Caracteres URL (URL Decoding):**
    *   Los enlaces estándar escapan caracteres (por ejemplo, `%20` en lugar de espacio). El parser debe decodificar estas secuencias para poder enlazar el nodo del grafo con el título limpio del archivo real en disco.
3.  **Sincronización Incremental en Renombrado:**
    *   Si se renombra o mueve un archivo en el explorador, actualizar un enlace estándar de Markdown es mucho más complejo que actualizar un WikiLink. Requiere re-calcular y re-escribir la ruta relativa en todos los archivos que lo referencien.

### 💡 Conclusión y Arquitectura Propuesta

**Es 100% posible y viable implementar el Modo Híbrido.** La mejor manera de abordarlo es hacer que el parser de Rust escanee concurrentemente ambos patrones utilizando expresiones regulares de alto rendimiento compiladas una sola vez (`lazy_static` regexes en Rust):
*   WikiLinks: `\[\[([^\]|]+)(?:\|[^\]]+)?\]\]`
*   Enlaces Estándar: `\[[^\]]+\]\(([^)]+\.md)\)`

El sistema podría ofrecer una opción en la configuración global del Workspace:
-   **Modo Estricto (Obsidian):** Solo indexa `[[WikiLinks]]`.
-   **Modo Estándar (GitHub Wiki):** Solo indexa `[Links](normales.md)`.
-   **Modo Híbrido (Recomendado):** Indexa ambos y los muestra unificados en el Grafo de Conocimiento, dándole a Atenea una versatilidad sin precedentes.

---

## ⚠️ Directrices de Desarrollo y Despliegue (Importante para Desarrolladores e IA)

Cualquier colaborador o agente de IA que trabaje en este repositorio debe respetar estrictamente la siguiente directiva:

> [!CAUTION]
> **POLÍTICA DE LANZAMIENTOS Y TAGS (RELEASES):**
> *   **NUNCA** crees ni empujes una etiqueta de Git (`git tag v*`) de forma autónoma.
> *   **NUNCA** publiques una versión ("Release") en GitHub de forma automatizada.
> *   Antes de realizar cualquier compilación de versión oficial o disparar un Release en el repositorio, **SIEMPRE debes preguntar al usuario primero** y esperar su confirmación explícita.
