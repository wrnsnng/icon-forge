import { Viewport } from "./Viewport";

const SECTIONS = ["Preset", "Icon", "Shape", "Material", "Lights", "Camera", "Export"];

export function App() {
  return (
    <main className="app">
      <Viewport />
      <aside className="panel">
        {SECTIONS.map((title) => (
          <section key={title} className="panel-section">
            <h2>{title}</h2>
          </section>
        ))}
      </aside>
    </main>
  );
}
