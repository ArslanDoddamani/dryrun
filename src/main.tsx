import "@fontsource/patrick-hand/400.css";
import { createRoot } from "react-dom/client";
import App from "./App";
import { twoSumExample } from "./examples";
import { clearMeasureCache } from "./geometry";
import { loadDoc, loadSaved, useStore, zoomToFit } from "./store";
import "./styles.css";

async function boot() {
  // text layout is measured on a canvas, so the hand-drawn font must be ready first
  await document.fonts.load('20px "Patrick Hand"').catch(() => {});
  clearMeasureCache();

  if (!loadSaved()) {
    loadDoc(twoSumExample());
    useStore.setState({ past: [] });
  }
  document.documentElement.dataset.theme = useStore.getState().theme;
  createRoot(document.getElementById("root")!).render(<App />);
  requestAnimationFrame(() => zoomToFit());
}

boot();
