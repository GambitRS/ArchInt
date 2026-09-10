# ArchiMate 4.0 implementation plan

1. **Establish the ArchiMate 4.0 compatibility contract.**

   Target ArchiMate 4 semantics, notation, and editable model files containing drawing views. Version 4 changes the concept catalogue and introduces relationship multiplicities, so existing 3.x definitions cannot simply be relabeled. Use the official specification as the authority. [The Open Group release announcement](https://www.opengroup.org.cn/node/12886)

   Confirm the applicable exchange schema, namespaces, file extensions, and reference fixtures before implementing serialization. Track language version and file-format version independently. Distinguish Open Group exchange XML from Archi’s native `.archimate` format; support each through an explicit adapter if both are required. A compatible official 4.0 exchange schema was not verified during planning, so resolving that dependency is the first milestone.

2. **Introduce a versioned model that separates architecture from presentation.**

   Replace the current drawing-only `Element[]` representation with a document containing:

   - Model identity, language version, names, documentation, and properties.
   - Typed architecture elements with stable identifiers.
   - Typed relationships referencing model elements.
   - Multiple drawing views containing positioned nodes and routed connections.
   - Presentation settings and application-specific drawing annotations.

   Give view nodes their own identifiers and references to model elements. Allow one model element to appear in multiple views without duplicating its architectural identity. Preserve elements and relationships that have no visual representation.

   Create shared model definitions, validation, and migrations used by the frontend and backend.

3. **Migrate existing drawings without changing their meaning.**

   Migrate existing saved arrays and versioned JSON documents into a document with one view. Retain cards, containers, text, freehand strokes, icons, styling, and connector geometry.

   Keep generic drawing objects as annotations until a user explicitly assigns an ArchiMate type. Provide a conversion action for selected shapes and connectors, including relationship validation.

   Back up stored documents before migration and verify that migrated drawings retain their appearance and remain editable.

4. **Build the ArchiMate concept and notation catalogue.**

   Create a versioned registry covering all ArchiMate 4 element types, domains, relationship types, permitted connections, and notation rules.

   Supply local SVG glyphs with documented provenance and appropriate usage rights. Associate each glyph with its semantic element type.

   Render the correct icon **inside the element**, integrated with its shape and label. Moving, resizing, copying, or deleting an element must automatically include its icon. Reserve label space so text cannot overlap the glyph.

   Use the same rendering components for the editor, library thumbnails, SVG, PNG, and PDF exports. Include standard relationship line styles, endpoint decorations, labels, and multiplicities.

5. **Extend the editor for semantic modeling.**

   Add a searchable ArchiMate palette organized by domain, alongside existing drawing tools. Extend the inspector with element type, documentation, properties, and relationship details.

   Add a view selector and commands to create, rename, and remove views. Distinguish removing an occurrence from a view from deleting its underlying model element.

   Support placing an existing model element into another view and creating an independent copy. Apply semantic edits consistently across occurrences while keeping geometry and styling view-specific.

   Integrate these operations with selection, snapping, grouping, undo/redo, and the existing save queue.

6. **Implement validated file import.**

   Add “Open ArchiMate file” to the library and editor. Detect the actual format and version from file contents.

   Parse model elements, relationships, properties, organization, and drawing views, including nesting, positions, sizes, styles, labels, and connection bendpoints. Replace fixed-page assumptions with persisted view dimensions and suitable imported bounds.

   Validate schema structure, identifiers, references, and semantic relationships. Disable external entities and network resolution, and enforce file-size and complexity limits.

   Present an import summary with errors and unsupported features before committing the document. Import as a new drawing by default. Preserve unfamiliar extension data where supported; never silently discard it.

7. **Implement file creation and round-trip export.**

   Add “Save ArchiMate file” for new and imported models. Serialize the complete model and its views using the verified format adapter, preserving identifiers across repeated exports.

   Validate exported files against the pinned schema and semantic rules before download.

   Define how freehand strokes, generic icons, rotation, and other application-specific features are represented. Use permitted extension points for complete ArchInt recovery. Where the chosen format cannot preserve a feature, explain the limitation before export and retain the full document in application storage.

   Treat downloaded files as snapshots; clearly distinguish file export from server autosave.

8. **Integrate persistence and recovery.**

   Extend the existing drawing API, SQLite document payload, browser recovery drafts, and conflict handling to store the complete versioned model atomically.

   Keep ownership checks and revision-based concurrency control. Ensure saves preserve every view, including views not currently open.

   Update library thumbnails and metadata to identify ArchiMate documents and their default view. Preserve existing JSON import/export as a recovery and migration path.

9. **Verify compatibility and release readiness.**

   Add fixtures and tests covering every supported element and relationship type, multiple views, repeated element occurrences, nesting, properties, Unicode, and extension data.

   Verify import → edit → export → reopen preserves semantic identity and supported visual layout. Test malformed XML, dangling references, unsupported versions, oversized files, migrations, recovery, and revision conflicts.

   Visually verify all element icons and relationship decorations on canvas and in exported images. Validate representative files with an independent compatible tool where available.

   Complete the existing automated tests, frontend typecheck, and production build. Release when users can create a typed ArchiMate drawing, save it as a validated file, reopen it with its icons and layout intact, edit it, and save it again without silent data loss.
