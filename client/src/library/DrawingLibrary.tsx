import { Diagram, type Drawing } from "../diagram";
import type { User } from "../app/types";

type DrawingLibraryProps = {
  user: User;
  drawings: Drawing[];
  filter: string;
  search: string;
  onFilterChange: (filter: string) => void;
  onSearchChange: (search: string) => void;
  onOpen: (drawing: Drawing) => void;
  onCreate: () => void;
  onUseArchitectureTemplate: () => void;
};

export function DrawingLibrary({
  user,
  drawings,
  filter,
  search,
  onFilterChange,
  onSearchChange,
  onOpen,
  onCreate,
  onUseArchitectureTemplate,
}: DrawingLibraryProps) {
  const filters = ["All drawings", "Architecture", "Diagram"];
  const visible = drawings.filter(
    (drawing) =>
      (filter === "All drawings" || drawing.category === filter) &&
      drawing.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="library-layout">
      <aside className="library-nav" aria-label="Workspace navigation">
        <div className="workspace-label">
          <span className="workspace-icon">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <strong>{user.name}&apos;s workspace</strong>
            <small>Personal workspace</small>
          </div>
        </div>
        <div className="nav-section">WORKSPACE</div>
        {filters.map((option, index) => (
          <button
            type="button"
            key={option}
            onClick={() => onFilterChange(option)}
            className={filter === option ? "nav-item active" : "nav-item"}
            aria-current={filter === option ? "page" : undefined}
          >
            <span>{["▪", "▧", "◇"][index]}</span>
            {option}
            <small>
              {
                drawings.filter(
                  (drawing) =>
                    option === "All drawings" || drawing.category === option,
                ).length
              }
            </small>
          </button>
        ))}
        <div className="nav-bottom">
          <div className="small-mark">✳</div>
          <strong>Room for your next idea.</strong>
          <p>
            Start with a blank page.
            <br />
            See where it takes you.
          </p>
          <button onClick={onCreate}>Create a drawing ↗</button>
        </div>
      </aside>
      <main className="library-main">
        <div className="row between">
          <div>
            <div className="eyebrow">YOUR WORKSPACE</div>
            <h1>
              A place for the big picture<span>.</span>
            </h1>
            <p className="muted">
              Pick up where you left off, or start with a new idea.
            </p>
          </div>
          <button className="primary" onClick={onCreate}>
            ＋ New drawing
          </button>
        </div>
        <section className="start-banner">
          <div>
            <span className="eyebrow">LESS BLANK PAGE. MORE POSSIBILITY.</span>
            <h2>Your next diagram starts here.</h2>
            <p>
              Build a clear picture with shapes, connections, and a little
              structure.
            </p>
            <button onClick={onUseArchitectureTemplate}>
              Use architecture template <span>↗</span>
            </button>
          </div>
          <div className="banner-diagram">
            <span>Idea</span>
            <i>⟶</i>
            <span className="green">Structure</span>
            <i>⟶</i>
            <span>Clarity</span>
            <small>CONNECT THE DOTS</small>
          </div>
        </section>
        <div className="row between library-toolbar">
          <div className="row">
            <h2>{filter}</h2>
            <span className="count">{visible.length}</span>
          </div>
          <input
            className="search"
            aria-label="Search drawings"
            placeholder="⌕  Search your drawings…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="drawing-grid">
          {visible.map((drawing) => (
            <button
              type="button"
              className="drawing-card"
              key={drawing.id}
              aria-label={`Open drawing ${drawing.name || "Untitled drawing"}`}
              onClick={() => onOpen(drawing)}
            >
              <div className="thumbnail">
                {drawing.elements.length ? (
                  <Diagram elements={drawing.elements} />
                ) : (
                  <span className="blank-preview">
                    ＋<small>A fresh perspective</small>
                  </span>
                )}
                <span className="open-drawing">Open drawing ↗</span>
              </div>
              <div className="drawing-info">
                <div className="row between">
                  <strong>{drawing.name || "Untitled drawing"}</strong>
                  <span>↗</span>
                </div>
                <div className="row between">
                  <small>{drawing.category}</small>
                  <small>
                    {new Date(drawing.updated).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </small>
                </div>
              </div>
            </button>
          ))}
          {!search && (
            <button className="new-card" onClick={onCreate}>
              <span>＋</span>
              <strong>Start from scratch</strong>
              <small>An open canvas. Endless possibilities.</small>
            </button>
          )}
        </div>
        {!drawings.length && !search && (
          <p className="empty">
            Your workspace is ready. Create your first drawing or try the
            architecture template above.
          </p>
        )}
        {search && !visible.length && (
          <div className="empty">No drawings found. Try another name.</div>
        )}
        <footer className="library-footer">
          <span>Made for thoughts that don&apos;t fit in a text box.</span>
          <span>YOUR IDEAS. CONNECTED.</span>
        </footer>
      </main>
    </div>
  );
}
