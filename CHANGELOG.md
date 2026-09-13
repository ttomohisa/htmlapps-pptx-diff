# Changelog

## 1.0.0

- Promote PPTX Diff from the v0.9.0 release candidate to the first stable release without expanding feature scope.
- Re-run end-to-end regression for slide matching, Semantic Diff, Visual Compare, chart rendering, speaker notes, filters, and HTML report export.
- Re-verify identical-deck behavior, invalid-file handling, added-slide preview, difference-marker focus, and no-rerender overlay toggling.
- Re-verify Japanese / English layouts at desktop and 320 / 360 / 390 px smartphone widths, including long file names and zero horizontal scrolling.
- Re-verify readable and self-extracting single-HTML artifacts, embedded dependency integrity, `connect-src 'none'`, and byte-for-byte self-extract restoration.
- Finalize stable-release metadata, README release status, screenshots, APP_SPEC, and release guard tests for v1.0.0.

## 0.9.0

- Promote PPTX Diff to release-candidate status after full regression of slide matching, Semantic Diff, Visual Compare, speaker notes, chart rendering, filters, and HTML report export.
- Re-verify representative added, changed, moved, and unchanged slide scenarios, including text, number, object, image, layout, formatting, and chart/detail review cases.
- Re-verify note-only changes and Speaker notes filtering with a dedicated notes regression deck.
- Re-verify high-fidelity chart rendering in both Visual Compare and exported report snapshots.
- Re-verify report confirmation, collapsible slide sections, human-readable geometry units, favicon embedding, gzip self-extraction, and fully local viewing.
- Re-verify Japanese / English layouts at desktop and 320–390 px smartphone widths, including long file names and zero horizontal scrolling.
- Rewrite English and Japanese README files to match the repository style used by PDF Organizer, with a concise feature overview, quick start, privacy model, build layout, limitations, dependencies, and release-oriented usage guidance.
- Add release-candidate guard tests for version metadata, UI/UX invariants, chart-mount ordering, report behavior, CSP, embedded dependencies, and standalone artifact consistency.

## 0.8.0

- Finish the comparison flow for desktop and smartphone without changing Semantic Diff or high-fidelity rendering behavior.
- Keep the result heading visible below the sticky app header after comparison and show the compared file names in the result header.
- Fix slide-row interaction so **View changes** can be expanded without the parent row swallowing the click.
- Preserve expanded Semantic Diff panels when selecting another Visual Compare slide or using Previous / Next by avoiding unnecessary result-list rebuilds.
- Add clear processing indicators to comparison and report export actions.
- Disable empty category filters while keeping the active filter usable.
- Increase smartphone tap targets for filters, Visual Compare controls, navigation, and header actions.
- Remove nested button semantics from file drop areas while keeping the visible file-picker buttons and full drop-zone pointer behavior.
- Replace the development-version scope section with a user-facing capability summary.
- Verify Japanese / English layouts at 320–390 px, long file names, report export, and no horizontal scrolling.

## 0.7.3

- Fix high-fidelity chart rendering in Visual Compare by mounting rendered slides before awaiting renderer readiness.
- Fix chart rendering in exported high-fidelity HTML reports and wait for ECharts to finish before snapshotting.
- Keep chart diff detection and existing semantic comparison behavior unchanged.

## 0.7.2

- Replace the app favicon with the supplied canonical SVG and embed the same icon into exported comparison reports.
- Compress high-fidelity HTML reports with gzip and save them as self-extracting HTML files that restore locally with `DecompressionStream`.
- Keep report export fully local and fall back to normal readable HTML only when browser-side `CompressionStream` is unavailable.

## 0.7.1

- Replace the native save confirmation with the template confirmation dialog and explicitly warn that exported reports can contain slide text, images, and speaker notes.
- Make every slide section in the exported HTML report collapsible.
- Export high-fidelity slide previews by freezing the local `@aiden0z/pptx-renderer` DOM into the report, including embedded local images, without embedding the source PPTX files.
- Format layout geometry values using user-facing units such as cm instead of raw PowerPoint EMU values.

## 0.7.0

- Add speaker-note extraction from PPTX notes slides and semantic note diff.
- Add Speaker notes to result summary and category filters.
- Add a Changed slides only toggle that composes with existing filters.
- Add fully local single-HTML comparison report export with a privacy warning.
- Include comparison summary, semantic differences, note changes, and simple slide previews in exported reports.
- Keep source PPTX files out of the generated report.

## 0.6.7

- Simplify visual text highlighting to the full matched text-box bounds instead of estimating individual text extents.
- Keep the red/green text-box border treatment while avoiding misleading fine-grained highlight geometry.
- Keep clickable Visual Compare change labels, but remove automatic scrolling when a label is clicked; only the linked highlight and detail card pulse in place.

## 0.6.6

- Restore compact visual-diff labels in a dedicated strip above the slide so labels no longer cover slide content.
- Make each visual-diff label clickable; selecting one focuses the matching highlight region and the corresponding Semantic Diff card.
- Remove inline re-rendered text differences from the slide preview while keeping the red/green text-region borders.
- Keep the existing no-rerender show/hide behavior for Visual Diff overlays.

## 0.6.5

- Replace on-slide diff labels for text changes with inline before/after highlighting: removed text is shown in red on the original slide and added text in green on the revised slide.
- Keep non-text visual differences as lightweight region outlines without label pills.
- Make the Visual Compare difference toggle hide/show only the overlay layer, avoiding high-fidelity slide re-rendering and visible flicker.

## 0.6.4

- Keep Previous / Next controls in a fixed Visual Compare header position so long slide titles no longer move the navigation.
- Link on-slide highlight markers to the Semantic Diff cards by showing the same category name and ordinal number on both.
- Add a show / hide control for Visual Compare difference markers without changing the underlying Semantic Diff results.

## 0.6.3

- Fix text colors in high-fidelity Visual Compare when paragraph `defRPr` colors were incorrectly overridden by shape-level `fontRef` colors.
- Apply the renderer correction as a narrow in-memory compatibility patch while keeping the pinned `@aiden0z/pptx-renderer` 1.2.4 asset unchanged and hash-locked.
- Tighten Visual Compare highlight regions: text-only changes use estimated text-content bounds rather than the entire text-box rectangle.
- Use a lighter, thinner highlight style and dashed outlines for layout-only changes.

## 0.6.2

- Remove the redundant Split range slider and keep direct canvas drag / keyboard control on the split handle.
- Show the selected slide's Semantic Diff directly inside Visual Compare.
- Allow Added and Removed slide rows to be selected and preview the side that exists.
- Add Previous / Next slide navigation inside Visual Compare.
- Add Overlay layer order controls so Original or Revised can be placed on top.
- Integrate the same `@aiden0z/pptx-renderer` 1.2.4 high-fidelity rendering path used by Presentation Video Maker, with the existing structural preview retained as fallback.


## 0.6.1

- Fix Split mode so clipping no longer changes the revised slide size.
- Add a draggable splitter directly on the slide canvas, while keeping the range input as an accessible fallback.
- Move Original / Revised labels outside layered Overlay / Split / Blink canvases to prevent badge overlap.
- Use the source slide aspect ratio consistently in all four visual modes.
- Scale text from PowerPoint point sizes with the preview canvas and honor text-box alignment and internal margins more closely.
- Stop drawing synthetic borders and fills on plain text boxes when the PPTX specifies none.
- Render embedded PPTX images from local Blob URLs for closer visual fidelity.


## 0.6.0

- Add Visual Compare for matched slide pairs with Side by side, Overlay, Split, and Blink modes.
- Highlight slide objects implicated by Semantic Diff so layout, formatting, text, number, object, and image changes are easier to spot visually.
- Carry presentation slide size into the extracted slide model so previews preserve the source aspect ratio.
- Keep approximate slide previews fully local with no runtime network access or extra dependencies.


## 0.5.0

- Add Layout Semantic Diff for object X/Y position, width, height, and rotation.
- Add Formatting Semantic Diff for font family, font size, bold, italic, text color, fill, line color, and line width.
- Resolve per-slide theme colors and theme fonts through slide layout / master / theme relationships where available.
- Move unchanged-image position/size changes from the Image category into Layout Diff.
- Add All / Text / Number / Object / Image / Layout / Formatting filters and six semantic summary cards.
- Add configurable tiny-geometry tolerance: Auto, Strict, about 1 px, or about 2 px.
- Recompute slide changed/unchanged status from Semantic Diff so formatting-only and ignored micro-layout changes remain consistent with the summary.
- Add property-level Original → Revised cards with human-readable centimeters, degrees, points, and color swatches.
- Preserve fully local processing with no new runtime dependencies or network access.


## 0.4.0

- Add Object / Image Semantic Diff inside matched slides.
- Match slide objects using shape identity, placeholder roles, embedded resource signatures, text, and geometry evidence.
- Detect added and removed non-image objects without relying on object order alone.
- Detect image additions, removals, and replacements from embedded image signatures.
- Distinguish layout-only changes when the exact same image data is moved or resized.
- Flag changed charts, tables, groups, and other unsupported detailed structures as Review instead of reporting them as unchanged.
- Add Object and Image summary cards, filters, and detailed change cards.
- Keep runtime processing fully local with no new third-party dependencies.


## 0.3.0

- Add Text Semantic Diff for matched slides using shape identity, placeholder roles, text similarity, and geometry.
- Show Original / Revised text with changed spans highlighted and added/removed text elements identified.
- Extract number changes independently, including decimals, percentages, currency-prefixed numbers, and common magnitude suffixes.
- Add All / Text changes / Number changes filters and semantic change summary counts.
- Preserve numeric equivalence across formatting-only changes such as `1,200` vs `1200`.
- Rework the canonical icon with a clear `P` tile, two presentation revisions, and explicit plus/minus diff marks.


## 0.2.0

- Add Slide Matching Engine using exact content, slide identity, and structural similarity evidence.
- Detect added, removed, changed, and minimally reordered slides without slide-number cascade errors.
- Add confidence levels and Review state for uncertain matches.
- Add resource signatures for embedded image/chart relationships to strengthen matching.
- Add matching summary and paired-slide result UI while retaining parsed structure inspection.
- Rework the canonical icon as two landscape presentation slides with visible plus/minus differences.
- Restore the sticky header typography to the template rules exactly.
- Hide the Review banner correctly when there are no uncertain matches.

## 0.1.0

- Add two-file PPTX input with drag-and-drop.
- Add fully local OOXML ZIP parsing for standard stored/DEFLATE entries.
- Resolve presentation slide order from `presentation.xml` relationships.
- Add normalized slide/object extraction for titles, text, object identity, and basic geometry.
- Add bilingual structural inspection UI for validating the parsing foundation.
- Add stale asynchronous-result guards and clear processing/error states.
