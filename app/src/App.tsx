import { ImageTool } from "./components/ImageTool";

export function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b border-outline-gray bg-snow-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1000px] items-center px-6">
          <span className="text-heading font-bold text-midnight-indigo">Toolzy</span>
          <span className="ml-3 rounded-full bg-pale-gray px-2 py-1 text-body font-semibold text-glacier-blue">
            native
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-6 py-12">
        <header className="mb-8 text-center">
          <h1 className="text-display-sm font-bold text-midnight-indigo">Image converter</h1>
          <p className="mx-auto mt-3 max-w-xl text-body-lg text-slate-blue">
            Convert and resize images natively. Files are processed on your device by the app.
          </p>
        </header>
        <ImageTool />
      </main>
    </div>
  );
}
