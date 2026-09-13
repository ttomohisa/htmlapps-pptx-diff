# Third-party notices

PPTX Diff v0.7.3 embeds the following pinned runtime component in the generated standalone HTML.

## PowerPoint renderer

- Package: `@aiden0z/pptx-renderer`
- Version: `1.2.4`
- License: Apache-2.0
- Project: https://github.com/aiden0z/pptx-renderer
- Purpose: local high-fidelity PPTX rendering for Visual Compare

The renderer is downloaded only by repository build tooling, hash-locked through the Browser Kitty single-HTML template dependency system, and embedded into the generated HTML. It is not fetched from a CDN or any other network location at runtime.

PPTX Diff continues to use its own local OOXML parsing and Semantic Diff logic as the source of truth for change detection. The third-party renderer is used only for visual confirmation of slides. If the renderer cannot initialize, the application can fall back to its local structural preview.

### Local compatibility patch

PPTX Diff v0.7.3 applies a narrow in-memory compatibility patch to the embedded `@aiden0z/pptx-renderer` 1.2.4 browser module before importing it. The patch changes text-color precedence so a resolved paragraph/run color can override the shape-level `fontRef` color, matching PowerPoint behavior for files where color is declared in paragraph `defRPr`. The original pinned third-party asset remains hash-locked and embedded unchanged; the patch is application code and is applied only at runtime in memory.

## Runtime behavior

No third-party asset is fetched at runtime. The PPTX renderer is embedded in the standalone HTML, and the app CSP keeps `connect-src 'none'`.

The application otherwise uses browser-native APIs for file access, ZIP DEFLATE decompression, XML parsing, Blob URLs, dynamic import of the embedded renderer, and local UI behavior. System fonts are used where available.

Keep this file and `LICENSE` with source redistributions of this application.
