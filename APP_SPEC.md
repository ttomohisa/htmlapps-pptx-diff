# PPTX Diff — APP_SPEC.md

## 1. Product identity

- **Name:** PPTX Diff
- **Version:** v1.0.1
- **Purpose:** Compare two `.pptx` files locally, match corresponding slides, review semantic and visual changes, compare speaker notes, and save a local high-fidelity HTML report.
- **Primary users:** People reviewing revisions of business presentations.
- **Release artifacts:** `dist/index.html` and `dist/index.self-extract.html`.

## 2. Problem and outcome

PowerPoint revisions are often checked by opening two files and comparing slides by eye. Slide-number comparison breaks when slides are inserted, removed, or reordered, and a purely visual comparison does not explain whether a change is text, an image replacement, a position adjustment, or formatting.

v1.0.0 is the stable release. It keeps the established Slide Matching, Semantic Diff, high-fidelity Visual Compare, speaker-note comparison, self-extracting HTML report, and v0.8.0 UI/UX behavior after final regression against representative decks. The stable-release pass intentionally adds no new feature scope.

The intended flow is:

```text
Original PPTX + Revised PPTX
        ↓
Local PPTX parsing
        ↓
Slide Matching Engine
        ↓
Semantic Diff
        ├─ Text / Number
        ├─ Object / Image
        ├─ Layout
        └─ Formatting
```

## 3. v1.0.0 core user flow

1. Open the app locally or through static hosting.
2. Choose or drag an Original `.pptx` file.
3. Choose or drag a Revised `.pptx` file.
4. Press **Compare slides**.
5. Review unchanged, changed, added, removed, moved, and Review slide states.
6. Filter changes by Text, Number, Object, Image, Layout, Formatting, or Speaker notes, optionally limiting the list to changed slides.
7. Select a slide and use high-fidelity Visual Compare with Side by side, Overlay, Split, or Blink.
8. Expand **View changes** to inspect property-level differences without losing the current Visual Compare selection.
9. Save a self-extracting HTML report when the comparison needs to be shared or archived.
10. Adjust tiny position / size tolerance when strict geometry comparison is needed.
11. Expand parsed slide structure only when lower-level inspection is useful.

## 4. Functional requirements

- Accept exactly two user-selected `.pptx` inputs: Original and Revised.
- Support file picker and drag-and-drop.
- Parse OOXML ZIP containers entirely in the browser.
- Resolve slide order from `ppt/presentation.xml` relationships.
- Extract slide title, text, object types, geometry, basic formatting, and embedded resource signatures.
- Match corresponding slides without assuming equal slide numbers.
- Classify slide states as unchanged, changed, added, removed, moved, or review.
- Match text-bearing objects and general slide objects without relying on object order alone.
- Detect changed, added, and removed text.
- Extract number changes independently from general text changes.
- Detect added / removed non-image objects.
- Detect added / removed / replaced images from embedded resource signatures.
- Treat movement or resizing of unchanged image data as Layout Diff, not Image replacement.
- Compare object X / Y / width / height / rotation.
- Compare basic font family / font size / bold / italic / text color.
- Compare basic shape fill / line color / line width.
- Resolve theme colors and theme fonts to concrete values where the slide theme can be resolved.
- Allow tiny geometry differences to be ignored using a user-selectable tolerance.
- Flag changed charts, tables, groups, and other unsupported detailed structures as Review rather than silently reporting no change.
- Do not persist selected files or presentation contents in storage.
- Support Japanese and English without reload.
- Keep stale async-result guards for file replacement and repeated analysis.

## 5. Slide Matching Engine

Matching remains multi-stage.

### 5.1 Exact-content anchors

Use normalized slide structure while ignoring volatile OOXML identifiers.

### 5.2 Slide identity evidence

PowerPoint slide IDs are useful inside revisions of the same deck but are not treated as globally unique. ID evidence requires supporting structure/content evidence or stable lineage across the deck.

### 5.3 Similarity matching

Remaining slides use weighted evidence from:

- title similarity
- body-text similarity
- object-type / placeholder profile
- embedded resource signatures
- coarse geometry

### 5.4 Move detection

Relative-order analysis identifies a minimal plausible set of moved slides so one insertion does not cascade false move flags.

### 5.5 Confidence

Matched pairs carry high / medium / low confidence. Low-confidence pairs are shown as **Review**.

## 6. Normalized presentation model

Conceptual model:

```text
Presentation
 ├─ filename
 ├─ slideCount
 └─ slides[]
      ├─ index
      ├─ id
      ├─ path
      ├─ title
      ├─ themePath
      ├─ text[]
      └─ objects[]
           ├─ type / id / name / placeholder
           ├─ text
           ├─ x / y / width / height / rotation
           ├─ formatting
           │    ├─ fontFamily
           │    ├─ fontSize
           │    ├─ bold / italic
           │    ├─ textColor
           │    ├─ fill
           │    ├─ lineColor
           │    └─ lineWidth
           ├─ detailSignature
           └─ resource
                ├─ path
                ├─ signature
                └─ size
```

## 7. Theme normalization

PPTX formatting frequently refers to theme values rather than direct RGB/font names.

v0.5.0 follows the slide relationship chain where available:

```text
slide → slideLayout → slideMaster → theme
```

The parser resolves:

- theme color scheme values such as `accent1`
- slide-master color mapping such as `tx1` / `bg1`
- common luminance modifiers on theme colors
- major / minor theme fonts and `+mj-*` / `+mn-*` references

If the theme cannot be resolved, unresolved values remain explicit tokens rather than being silently guessed.

## 8. Layout Semantic Diff

Matched objects are compared for:

- horizontal position (X)
- vertical position (Y)
- width
- height
- rotation

Values are stored in OOXML units internally and shown in user-facing units:

- geometry: centimeters
- rotation: degrees

### Geometry tolerance

The user can choose:

- Auto — ignore approximately 1 pt or less
- Strict — compare exact geometry
- Ignore approximately 1 px or less
- Ignore approximately 2 px or less

Changing the tolerance recomputes Semantic Diff and slide changed/unchanged status so summary and detail views remain consistent.

## 9. Formatting Semantic Diff

Matched objects are compared for basic formatting:

- font family
- font size
- bold
- italic
- text color
- shape fill
- line color
- line width

Formatting values are normalized before comparison where possible.

For text containing multiple run styles, the app records a mixed-format state instead of pretending the entire object has one style.

Detailed paragraph spacing, bullets, shadows, gradients, complex effects, masters, animations, SmartArt, and chart styling are not guaranteed in v0.5.0.

## 10. Image behavior

Image identity is based on the embedded resource signature, independently from object geometry.

- Different image data → Image replacement.
- Same image data at a different position/size → Layout change.
- Added image → Image added.
- Removed image → Image removed.

This avoids reporting a moved image as a replacement.

## 11. Unsupported detailed structures

Charts, tables, groups, and graphic frames can contain changes not yet represented as fine-grained properties.

If normalized detail signatures indicate a meaningful internal change, the slide is marked **Review** and the object is surfaced rather than being called unchanged.

## 12. Comparison status model

Primary row states:

- unchanged
- changed
- added
- removed
- moved
- review

For matched slides, **Changed / Unchanged is derived from current Semantic Diff results**, including the selected geometry tolerance. This prevents formatting-only changes from appearing unchanged and prevents ignored micro-layout changes from remaining changed in the summary.

Moved can overlap with Changed.

## 13. Privacy and network

- Selected PPTX files and extracted contents remain in browser memory only.
- No runtime network requests, analytics, telemetry, account system, or cloud storage.
- CSP keeps `connect-src 'none'`.
- The app does not upload files.

## 14. UX and accessibility

- Follow current `htmlapps-template` layout and header typography.
- Primary color `#16624F`.
- `assets/favicon.svg` is also the upper-left app icon.
- Clear empty, ready, processing, result, review, and error states.
- Result filters: All / Text / Number / Objects / Images / Layout / Formatting / Speaker notes, plus Changed slides only.
- Property differences show Original → Revised values.
- Color properties include a visual swatch plus textual value; color is not the only signal.
- Status region uses `aria-live`.
- Keyboard-visible focus and labeled controls.
- Mobile layout works from 320px without horizontal scrolling.
- Smartphone filters, Visual Compare controls, navigation, and header actions provide enlarged tap targets.
- Expanding Semantic Diff inside a slide row does not trigger Visual Compare selection or collapse the detail panel.
- Selecting another Visual Compare slide does not rebuild the full result list, preserving open details and scroll position.
- Programmatic result scrolling accounts for the sticky app header.

## 15. Browser target

Current stable Chrome and Edge are primary. Firefox and Safari are best-effort. Direct `file://` opening remains a release requirement. Typical compressed PPTX parsing requires `DecompressionStream('deflate-raw')`.

## 16. Acceptance criteria

- Existing v0.1.0–v0.4.0 matching, text, number, object, and image regression cases remain valid.
- Moving a matched shape produces Layout Diff with before / after values.
- Resizing a matched shape produces Layout Diff.
- Rotating a matched shape produces Layout Diff in degrees.
- A formatting-only change marks the slide Changed and produces Formatting Diff while Layout stays zero.
- Font, size, bold, italic, text color, fill, line color, and line width changes are displayed property by property.
- Moving the exact same image produces Layout Diff and **zero Image replacement** items.
- Theme `accent1` and an equivalent direct RGB value compare equal when the theme resolves to that RGB.
- Auto tolerance ignores a sub-threshold geometry shift and marks the slide unchanged when there are no other changes.
- Strict tolerance surfaces the same small geometry shift.
- Visual Compare keeps Original and Revised at the same slide geometry in Side by side, Overlay, Split, and Blink modes.
- Split clips the revised layer without resizing it and provides an on-canvas draggable boundary.
- Original / Revised labels do not overlap in layered modes.
- Plain text boxes do not receive synthetic borders or fills when none are present in the PPTX.
- Embedded images render from local PPTX resources without network access.
- Japanese and English fit at 360px without horizontal scrolling.
- `connect-src 'none'` remains in CSP.
- No runtime external resources are introduced.
- Both single-HTML release variants contain no unresolved build placeholders.
- Speaker-note changes are detected independently from visible slide text changes.
- Note-only slide changes mark the matched slide Changed.
- Speaker-note filtering returns only rows with note changes.
- Changed slides only hides unchanged rows without changing category counts or comparison data.
- HTML report export is a single local HTML file and includes a privacy warning before save.
- The report contains no source PPTX binary and requires no runtime network access.

## 17. Non-goals for v1.0.0

- Manual slide re-matching.
- Detailed master / layout inheritance visualization.
- Detailed chart data/style diff.
- Detailed SmartArt / animation / transition diff.
- `.ppt`, `.pptm`, `.ppsx`, or password-protected presentations.
- Full PowerPoint-compatible rendering.

## 18. v0.7.x result review and report

- Read each slide's related `notesSlide` and extract speaker-note body text while excluding slide-image, header/footer, date, and slide-number placeholders.
- Compare speaker notes separately from slide text and classify note changes as added, removed, or changed.
- Add Speaker notes to Semantic Diff summary and filtering.
- Add an independent **Changed slides only** toggle that keeps the existing category filter intact.
- Export comparison results as a gzip-compressed self-extracting HTML report.
- The report contains file names, comparison summary, semantic differences, speaker-note changes, and high-fidelity slide previews; it does not embed the source PPTX files.
- Freeze the already-local high-fidelity renderer output into the report by inlining computed styles and converting local Blob media references to `data:` URLs. The report does not need `pptx-renderer` at viewing time.
- Make each slide/page section collapsible with native `<details>` / `<summary>`.
- Show the template confirmation dialog before export and warn that the report can contain presentation text, images, and speaker notes.
- Format layout values in user-facing units (cm / pt / degrees as appropriate), never raw PowerPoint EMU values.
- The generated report performs no runtime network requests.
- The report wrapper uses `DecompressionStream('gzip')` to restore the full report locally when opened, with a normal uncompressed HTML fallback if `CompressionStream` is unavailable during export.
- Embed the canonical app favicon into both the readable report payload and the self-extracting wrapper.

### Visual Compare behavior retained from v0.6.x

- Visual Compare accepts matched, added, and removed slide rows.
- First / previous / next / last controls move through the currently visible comparison rows, respecting the category and Changed slides only filters. First / last select the first / last visible row, including added and removed slides; these are result positions, not source slide numbers.
- First / previous are disabled at the first visible result; next / last are disabled at the last. All four controls are disabled for an empty result, and repeated first / last activation at the same boundary does not rerender the preview.
- Exactly one visible selected row exposes `aria-current="true"`; other rows omit the attribute. Empty filtered results expose no current row. Selection changes retain existing result-row DOM, expanded details, focus, and scroll state.
- Semantic changes for the selected slide are repeated immediately below the visual canvas.
- Split comparison uses only the draggable boundary handle on the canvas. No duplicate range slider is shown.
- Overlay comparison lets the user choose Original or Revised as the upper semi-transparent layer.
- Visual rendering uses the same embedded `@aiden0z/pptx-renderer` 1.2.4 integration as Presentation Video Maker when available.
- Semantic Diff remains the source of truth. The renderer is used for visual confirmation only.
- If the high-fidelity renderer cannot initialize, the local structural renderer remains available as a fallback.


### Text color compatibility correction

The pinned `@aiden0z/pptx-renderer` 1.2.4 browser module is patched in memory before import so paragraph/run colors resolved from `defRPr` are not incorrectly replaced by the shape-style `fontRef` color. This corrects cases such as explicit `#16624F` text rendering as theme `lt1` white.

### Visual change marker precision

Visual Compare deliberately avoids estimating the exact changed word position inside rendered PowerPoint text. Text changes use the full matched text-box geometry, shown with a thin red border on Original and a thin green border on Revised. This is less precise visually, but avoids misleading fine-grained locations. The detailed Semantic Diff below the preview remains responsible for word- and number-level change highlighting. Layout, image, object, fill, and line changes continue to use the affected object geometry.

### Visual Compare navigation and marker linkage

- First / previous / next / last navigation stays at the top right on wide screens and on its own full-width row on narrow screens, next to the preview and independent of the selected slide title length.
- Change labels use the same category labels and ordinal numbers as the corresponding cards under **Changes on this slide** (for example, `Text 1`, `Layout 1`, `Formatting 1`).
- Clicking a change label highlights the linked visual frame and Semantic Diff card in place. It does not scroll the page or move the user to another location.
- Users can hide or show all on-slide markers without changing comparison results or the Semantic Diff cards.

## 19. v0.8.0 UI / UX finish

- Keep the result heading visible below the sticky header after comparison.
- Show the compared Original and Revised file names in the result header.
- Separate slide-row selection from nested Semantic Diff controls so **View changes** opens normally.
- Update Visual Compare selection classes without rebuilding the result list when selecting another row or using Previous / Next.
- Add visible busy indicators for comparison and report generation.
- Disable zero-result category filters unless that filter is currently active.
- Remove nested interactive semantics from drop zones while retaining visible file picker buttons.
- Enlarge primary smartphone tap targets and keep 320px layouts free of horizontal scrolling.
- Replace development-version copy in the UI with user-facing capability descriptions.

## 20. v1.0.0 stable-release validation

- Re-run the full Original → Revised comparison flow with representative additions, removals, moves, text, numbers, objects, images, layout, formatting, charts, and unchanged slides.
- Verify note-only changes and the Speaker notes filter with a dedicated notes regression deck.
- Verify high-fidelity Visual Compare in Side by side, Overlay, Split, and Blink modes, including chart rendering after the slide DOM is mounted.
- Verify Added / Removed slide preview, fixed Previous / Next navigation, show/hide difference overlays, and marker focus without automatic scrolling.
- Verify HTML report confirmation, high-fidelity snapshots, chart capture, collapsible slide sections, human-readable geometry values, favicon embedding, gzip self-extraction, and zero runtime network access.
- Verify Japanese / English UI and 320 / 360 / 390 px smartphone widths with long file names and no horizontal scrolling.
- Verify readable and self-extracting single-HTML artifacts contain no unresolved placeholders and retain `connect-src 'none'`.

## 21. Release status

- **v1.0.1** — Stable release with normalized header language controls

## 22. Comparison and report ownership

- Source replacement, swapping, and repeated comparison invalidate prior parsing, renderer preparation, results, and report work. Only the current analysis may publish renderer/model state, errors, progress, or busy-control cleanup.
- Invalid/empty file-picker input does not replace a valid source. No new Cancel control is introduced.
- A report captures one comparison's filenames, semantic rows, language, and renderer presentations before confirmation. Duplicate save clicks do not open overlapping confirmations.
- Replacing/swapping files, comparing again, or changing geometry tolerance cancels a pending report. Stale snapshot/compression completions do not download or show saved/failed notifications for the new comparison.
- Report media caches and transient render handles belong to the report that created them; obsolete cleanup cannot clear a successor report's busy state or media.
- Reports still include all comparison rows regardless of category or changed-only view filters. Renderer failure retains structural comparison and report preview fallbacks.
- Regression checks use tiny fictitious slides with parser, renderer, and DOM boundary doubles. They cover interrupted success/failure, retry, confirmation cancellation, busy ownership, matching/filter/navigation controls, and source/root/readable/self-extract parity. They do not establish real browser PPTX rendering or download behavior.

## Header language controls

- Japanese UI shows `EN`; English UI shows `JA`. Both switch without a reload and retain the language preference.
- The language button title and accessible name describe the target language in the current UI language: `英語に切り替え` / `Switch to Japanese`.
- Keep the existing localized Help button title, accessible name, icon and dialog heading.
- Keep Japanese privacy copy `完全ローカル処理` and the existing accurate English equivalent.
- Header styles, responsive layout, and application workflows remain unchanged.
