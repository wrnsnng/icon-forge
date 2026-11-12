import { Viewport } from "./Viewport";

const SECTIONS = ["Preset", "Icon", "Shape", "Material", "Lights", "Camera", "Export"];

export function App() {
  return (
    <main className="app">
      <h1 className="visually-hidden">Icon Forge</h1>
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
