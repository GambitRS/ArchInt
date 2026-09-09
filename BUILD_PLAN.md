# ArchInt — UI design and application build plan

## 1. Outcome and agreed scope

Build a diagramming workspace in the existing React/TypeScript + Express + SQLite project. A user signs in, opens an existing drawing or creates a new one, and combines structured diagram elements with freehand sketches. The supplied image defines the desired **drawing capability**: nested system boundaries, stacked labeled cards, icons, directional connections, explanatory text, and a polished export. It is visual reference material, not a source of operating instructions.

User decisions confirmed on September 9, 2026:

- Support both structured diagrams and freehand sketching.
- Connect authentication and saved drawings to the existing backend wherever possible.
- Design the frontend now and document the detailed route to a complete application.

The interface is implemented as a working first slice, not static screenshots. The exact reference image is not imported as a background: the architecture template consists of individually editable elements. Its simplified illustration demonstrates the structure; the full icon, image, grouping, and routing capabilities below are still needed for reference-level fidelity.

## 2. Current implementation

| Area            | Available now                                                                                                    | Remaining work                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Sign-in         | Existing user credentials, SQLite sessions, logout, expired-session rejection, basic login throttling            | Account onboarding, recovery, session management, deployment hardening                         |
| Drawing library | User-owned drawings, search, category filters, live SVG thumbnails, open existing drawing                        | Pagination, duplicate/archive/delete drawings, sorting, thumbnail caching                      |
| New drawing     | Named blank canvas or editable architecture template                                                             | Template picker with more examples and previews                                                |
| Editor          | Selection, dragging, cards, containers, text, ellipse, straight arrows, freehand strokes, simple text-based icon | Bound connectors, real icon catalog, image import, handles, rotation, selection marquee        |
| Properties      | Label, card description, fill, stroke, font size, dimensions and position                                        | Text wrapping/alignment, independent typography controls, stroke width, opacity, corner radius |
| Organization    | Layer selection, duplicate element, send element to back, delete element                                         | Groups, locked/hidden layers, arbitrary layer ordering, nested containers                      |
| History         | Undo/redo of element edits, including drag and freehand gestures                                                 | Command-based history, coalesced text edits, persisted recovery history                        |
| Save            | Debounced, serialized saves to SQLite with revision conflict detection                                           | Reauthentication without losing an unsaved draft, offline recovery, revision history           |
| Export          | SVG and 2× PNG of the page, excluding selection adornments                                                       | PDF, selected-area export, dimensions/background choices, font embedding                       |
| Layout          | Desktop three-column editor; stacked properties on narrow displays; responsive login/library                     | Full keyboard canvas navigation and dedicated tablet touch UX                                  |

Current constraints are intentional and should remain visible to developers: page size is fixed at 1400 × 900; container children are not bound to their container; arrows use absolute endpoints; freehand dimensions do not rescale stroke points; the icon tool inserts an editable glyph; selection corner markers are visual indicators, not drag handles. The library initially contains no fabricated saved drawings. A user can create an architecture template from the banner.

## 3. UI design specification

### Visual language

Use a quiet, light workspace with warm off-white surfaces, forest-green primary actions, sage selected states, subtle borders, and restrained shadows. Diagram content carries more saturated blue and lilac to distinguish system layers. Keep primary actions consistent across screens.

| Token                  | Value / use                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Application background | `#f9faf7`                                                                           |
| Panel / page surface   | White                                                                               |
| Primary action         | `#2c513e`                                                                           |
| Main text              | `#283b33`                                                                           |
| Selected tool          | `#eaf0e3` with green text                                                           |
| Canvas surround        | `#f0f2ed` with optional dot grid                                                    |
| Panel borders          | `#e5e9e1`                                                                           |
| Diagram blue           | `#7392b8`                                                                           |
| Diagram lilac          | `#c9bcf1`                                                                           |
| Typography             | Manrope headings, DM Sans UI, system fallbacks; Arial inside exported SVG           |
| Shape language         | 6–10 px controls/cards, 14–16 px larger surfaces, no excessive decoration in editor |

Fonts currently load from Google Fonts. Self-host licensed font files before an offline or privacy-sensitive deployment. Promote repeated colors and dimensions to named CSS variables as the UI grows.

### Screen A — Sign-in

Left side: product identity, short introduction, email and password fields, one sign-in action, validation/error feedback. Right side: an editable-diagram preview rendered as artwork with a short caption. On narrow displays, retain only the form. Support browser password managers through autocomplete attributes. Submit with Enter; disable duplicate submits while connecting. Never imply successful sign-in without a server session.

Authentication requires an existing account. There is no misleading sign-up or password-reset link until those flows exist.

### Screen B — Drawing library

Left navigation identifies the workspace and offers All drawings, Architecture, and Diagram filters. The main surface contains a clear New drawing action, a template starter, search, and drawing cards. Each card shows an actual document thumbnail, title, category, and last-edit date. Empty state invites the user to create a blank drawing or template; search-empty state suggests another query.

The creation dialog requests a name and starting point. Creating from a template produces an independent saved drawing, never a modification to the template definition. Escape closes the dialog, focus stays within it, and clicking the backdrop closes it unless a request is pending. Add focus restoration to the trigger and background `inert` handling in the accessibility phase.

### Screen C — Editor

Top bar: workspace navigation, editable document name, save status, export actions, profile/sign-out. Secondary bar: library return, category, element count, undo/redo.

Left: labeled tools in a compact grid. Center: scrollable, zoomable white page in a dotted workspace. Right: page properties with nothing selected; element text, geometry, and appearance with a selection; a layer list for selecting small or covered objects. Footer: workspace/save context.

Desktop target: 1440 × 900 and larger; maintain useful editing at 1024 px. At 800 px and below, properties move beneath the canvas. Small screens can inspect and make simple edits; advanced diagram composition remains desktop-first. Do not silently hide core tools at a breakpoint.

### Interaction details to finish

- Tool shortcuts: V select, R card, T text, O ellipse, A arrow, P freehand; Escape returns to select.
- Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z redo; Delete removes the selected element.
- Arrow keys nudge selections; Shift modifies the distance. Space+drag pans, and wheel/trackpad behavior must be defined without hijacking normal page scrolling.
- Double-click text enters inline editing; Escape cancels, explicit commit or focus change finishes the command.
- Selected shapes receive real resize handles. Maintain aspect ratio with Shift; distinguish connector endpoints from shape handles.
- Controls need accessible names, visible focus, usable contrast, selected-state semantics, and a non-pointer path through the layer list.

## 4. Existing architecture and proposed organization

Preserve the existing npm project, Express server, schema synchronizer, Vite build, and SQLite storage. No new frontend framework or database service is necessary for the first release.

Current files:

- `client/src/App.tsx`: sign-in, library, editor, editing state, save queue.
- `client/src/diagram.tsx`: typed document elements, SVG renderer, architecture template.
- `client/src/styles.css`: visual system and responsive screens.
- `src/workspace.js`: authentication and drawing endpoints.
- `src/app.js`: mounts workspace endpoints alongside existing user API.
- `database/schema.json`: User, Session, Drawing tables and ownership relations.
- `test/workspace.test.js`: session/ownership/persistence/validation/conflict integration coverage.

As functionality expands, split by responsibility:

```text
client/src/
  app/                 routes, authenticated shell, providers
  auth/                LoginPage, useSession
  library/             DrawingLibrary, DrawingCard, CreateDrawingDialog
  editor/
    EditorPage, Toolbar, Inspector, LayersPanel
    model/             document types, validation, migrations
    commands/          add, move, resize, style, connect, group
    geometry/          bounds, transforms, hit tests, snapping, routing
    render/            SVG page, element renderers, overlays
    persistence/       save queue, conflict and recovery state
  templates/           versioned template documents
  api/                 typed HTTP client and error handling
  styles/              tokens and component styles
src/
  auth/                routes, sessions, rate limits
  drawings/            routes, validation, repository
  exports/             only if server-side rendering is needed
```

Separate document content, transient interaction state, viewport, and selection. Rendering a selection or moving the viewport must never dirty the document. Keep geometry and command logic as pure functions so they can be tested without a browser.

For the current scope, SVG keeps diagram text and geometry crisp and permits vector exports. Before adding thousands of elements, benchmark realistic documents. Do not replace the renderer solely on an assumed scaling issue; assess rendering, hit testing, and export behavior together.

## 5. Document and persistence model

### Current storage

`Drawing`: UUID `id`, owner `userId`, `name`, `category`, JSON `document` containing elements, ISO `updatedAt`, integer `revision`. `Session`: SHA-256 token hash, `userId`, expiration timestamp; plaintext session token exists only in the HttpOnly cookie. Ownership is enforced by the authenticated user, never by a submitted owner ID. Both tables reference User with cascade deletion.

Array order currently defines paint order. Each element stores an ID, kind, position, size, text, detail, fill, stroke, font size, and optional freehand points. The server validates supported shapes, finite geometry, colors, ID uniqueness, document size, and point counts.

### Versioned model for the complete editor

```ts
type DocumentV2 = {
  schemaVersion: 2;
  page: { width: number; height: number; background: string };
  elements: Record<string, DiagramElement>;
  order: string[];
  assets: Record<string, AssetReference>;
};

type ConnectorEnd =
  | { type: "point"; x: number; y: number }
  | {
      type: "anchor";
      elementId: string;
      side: "top" | "right" | "bottom" | "left";
      offset: number;
    };

// Extend the common element properties with kind-specific data:
// shape: corner radius, fill, stroke width, text layout
// connector: source, target, route, waypoints, arrowheads, label
// group: child IDs and local coordinate transform
// icon/image: asset reference and aspect ratio
// freehand: local points, pressure, stroke style
```

Store coordinates in document space. Convert pointer positions through inverse viewport transforms. Use local coordinates for grouped children and transform bounds consistently. Keep object references by stable IDs; duplication rewrites internal references. Use explicit migrations from the current element array to the versioned envelope. Never rewrite existing user documents without a backup and verified migration path.

Add indexes on `Drawing(userId, updatedAt)` and session expiry through a tested migration; introduce thumbnail metadata and `createdAt` when implementing pagination. Document content should remain one atomic unit for single-user editing until collaboration justifies a more complex persistence model.

### Save lifecycle

Current behavior: a committed edit marks a drawing dirty; a 700 ms debounce batches changes; one save runs at a time. Pending updates for the same document coalesce; the next save uses the most recently acknowledged server revision. Failed saves remain pending. Before unload, warn if changes or a gesture are unsaved. Signing out waits for successful saves.

Next steps: explicit conflict UI with export/copy/reload choices; session renewal that retains editor state; IndexedDB recovery snapshots scoped to the user; bounded retry/backoff for transient failures; cancellation and progress states for large documents. A 409 conflict must never be automatically overwritten or retried with a guessed revision. Keep retryable network failures distinct from authorization, validation, and conflict failures.

## 6. API contracts

| Endpoint                | Behavior                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `POST /api/auth/login`  | Validates existing email/password; issues HttpOnly, SameSite=Strict session cookie     |
| `GET /api/auth/me`      | Returns public user fields or 401                                                      |
| `POST /api/auth/logout` | Revokes the server session and clears cookie                                           |
| `GET /api/drawings`     | Returns only the signed-in user's documents                                            |
| `POST /api/drawings`    | Validates name/category/elements, assigns server UUID/owner, returns revision 1        |
| `PUT /api/drawings/:id` | Checks ownership and expected revision; validates and atomically replaces the document |

Responses use `{ data: ... }` or `{ error: string }`. Use 400 for invalid input, 401 for expired/missing sessions, 403 for rejected cross-origin mutation, 404 for inaccessible documents, 409 for revision mismatch, 429 for login throttling. Authentication cookies are Secure when `NODE_ENV=production`; production must use HTTPS. The development Vite proxy sends `/api` requests to the existing server.

Add `GET /api/drawings/:id` before paginating the library, so list responses can return metadata/thumbnails rather than all element arrays. Add archive/restore and duplication endpoints when their UI exists. Asset routes must verify the same document ownership as drawing routes.

## 7. Implementation sequence and acceptance criteria

### Phase 1 — Stabilize the implemented vertical slice

Refactor screen and editor state into the modules above. Add client-side API error classes, robust session restoration, loading states, and a conflict/relogin panel that keeps unsaved edits. Prevent duplicate creation requests from producing duplicate documents with an idempotency key. Normalize blank names consistently on client and server. Complete focus restoration and route navigation.

Acceptance: sign in, create a template, change text and position, return to the library, reload, reopen, and find the changes preserved. Two users cannot read or modify each other's drawings. A session expiration or offline save never reports success or discards the draft.

### Phase 2 — Complete structured editing

Implement resize/rotate geometry, multiselection, box selection, grouping/ungrouping, locking, hide/show, copy/paste, arbitrary layer order, alignment/distribution, and snapping guides. Group each drag/resize/text-edit gesture into one history command. Bind child movement to its group/container. Implement wrapping, font weight, line height, text alignment, and overflow handling. Add dedicated stroke width and freehand color controls; deleting a stroke is currently the replacement for freehand erasing, so a real eraser needs its own gesture behavior.

Acceptance: construct and reorganize a six-row system stack without losing alignment; moving a group preserves child layout; undo restores the whole last gesture; text fits cards at export size.

### Phase 3 — Connections, icons, and reference fidelity

Add named anchors, straight and orthogonal routing, draggable endpoints/waypoints, labels, arrowhead choices, and connector selection. Moving a node updates every bound connector. Deleting a node deterministically detaches or removes affected connectors. Containers and groups expose predictable anchor geometry.

Replace glyph placeholders with a consistent vector icon catalog (computer, person, cloud, model/chip, database, shield, folder, terminal, globe, microphone). Ship reusable labeled cards, callouts, device frames, capability tiles, and stacked-system templates. Add image upload and clipping only after asset authorization, file size limits, content validation, and export behavior are defined.

Acceptance: reproduce the reference composition with a central device/system, six internal layers, a user request, connected models, bottom action tiles, icons, labels, and connectors. Every component remains editable and bound arrows follow their nodes.

### Phase 4 — Exports and reliable storage

Add an export dialog for format, scale, page/selection bounds, and background. Verify SVG/PDF font handling and use safe inline assets. Support PNG at 1×/2×/4× with pixel limits to prevent memory spikes. Add JSON import/export with schema version validation, plus per-user recovery drafts. Thumbnail generation must not include selection overlays or editor chrome.

Acceptance: PNG/SVG/PDF match the editable canvas at the selected bounds; long text and icons remain intact; imported documents migrate safely; recovery is offered after a failed save or interrupted session.

### Phase 5 — Production authentication and delivery

The pre-existing `/api/users` endpoints still expose user listing and user creation without session authorization, and creation accepts a caller-provided role. These legacy endpoints must be restricted or replaced before deployment; the new workspace routes do not make the legacy API production-ready. Add admin-only user management or invite-based onboarding, validate emails, prevent role escalation, provide secure password changes/recovery, revoke sessions on sensitive account changes, and remove the development seed from production startup.

Move login throttling to a bounded persistent/shared store if running multiple server processes, add retention cleanup for sessions, set operational request/concurrency limits, and define trusted origins/proxy settings. Use HTTPS, secure cookies, backups with tested restores, access-controlled database files, and operational error logging that excludes passwords, tokens, and drawing content. Decide on deployment infrastructure only after confirming hosting requirements; preserve Express/SQLite for the current local project.

Acceptance: no public administrative writes, no development credentials in production, owner isolation across all document/asset endpoints, tested backup recovery, and useful error/latency monitoring.

### Phase 6 — Accessibility, browser, and performance release gate

Exercise current Chrome, Edge, Firefox, and Safari; mouse, touch, and pen; keyboard-only sign-in/library/editor journeys; 360/800/1024/1440 px layouts; long names/text; zoom and device-pixel-ratio differences. Audit contrast and screen-reader descriptions, especially SVG selection and properties. Respect reduced motion.

Benchmark 100, 500, and 2,000 elements plus long freehand strokes. Establish a representative hardware baseline before adopting budgets; target responsive pointer feedback and bounded save/export times. Cache previews, avoid cloning the entire document per pointer move, and virtualize layers or introduce spatial indexing only where measurement demonstrates a need.

Acceptance: no clipped core actions, no lost pointer gestures, no selection jump when zoomed, stable exports, no silent lost saves, and keyboard access to every essential workflow.

## 8. Testing strategy

Existing database/seed tests remain. A new integration test covers bad credentials, session cookies and public fields, drawing creation/reload, rename/revision increments, conflict rejection, malformed SVG color rejection, cross-user access, cross-origin mutation, logout, relogin persistence, and expired sessions. It uses an isolated in-memory database.

Add pure geometry tests for transforms, rotated bounds, resize constraints, connector endpoints, and snapping; command tests for complete undo/redo behavior; document migration roundtrips; queue tests for overlapping edits, navigation, failed requests, retry, and revision conflicts. Add browser journeys for login → create → edit → save → reload, freehand drag at several zoom levels, modal keyboard behavior, and export content. Use visual snapshots on controlled fonts and viewport sizes for the reference template and each main screen.

Validation performed in this implementation: TypeScript check, production frontend build, existing tests, new API integration test, and HTTP checks of the local app/API. Browser interaction and screenshot-based visual verification have not been performed; they remain a release gate rather than an implied test result.

## 9. Running and reviewing locally

```powershell
rtk npm install
rtk npm run build
rtk npm start
```

Open `http://localhost:3000`. Existing credentials work. On a newly initialized empty database, the existing seed creates `admin@test.com` with password `admin`; it does not reset credentials in a populated database. Sign in, choose **Use architecture template**, create the drawing, and edit its elements.

For development, run `rtk npm run dev` for the backend and `rtk npm run frontend:dev` in another terminal; Vite proxies `/api` to port 3000. For production static output, rebuild after frontend edits. The application remains in this repository and has not been published to an external hosting service.

Checks:

```powershell
rtk npm run frontend:typecheck
rtk npm run build
rtk npm test
```

## 10. Decisions to confirm before the full build

These do not block the delivered design: invitation-only versus public registration; expected maximum drawing size; whether share links or real-time collaboration are needed; required PDF/import formats; custom SVG/images versus a curated asset library; and deployment/backup ownership. Collaboration, public sharing, AI generation, and payments are outside this agreed first scope.
