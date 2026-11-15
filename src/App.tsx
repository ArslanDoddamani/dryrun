import { useEffect } from "react";
import { Canvas } from "./components/Canvas";
import { Credit, HelpDialog, MainMenu, PresentOverlay, TopRight, Welcome, ZoomControls } from "./components/Chrome";
import { InsertDialog } from "./components/InsertDialog";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { TextEditor } from "./components/TextEditor";
import { Timeline } from "./components/Timeline";
import { Toolbar } from "./components/Toolbar";
import { useShortcuts } from "./shortcuts";
import { useStore } from "./store";

export default function App() {
  useShortcuts();
  const presenting = useStore((s) => s.presenting);
  const theme = useStore((s) => s.theme);
  const notice = useStore((s) => s.notice);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const empty = useStore((s) => s.doc.steps.length === 1 && s.doc.steps[0].elements.length === 0);

  return (
    <div className={`app${presenting ? " presenting" : ""}`}>
      <Canvas />
      <TextEditor />
      {presenting ? (
        <PresentOverlay />
      ) : (
        <>
          {empty && <Welcome />}
          <MainMenu />
          <Toolbar />
          <TopRight />
          <PropertiesPanel />
          <ZoomControls />
          <Timeline />
        </>
      )}
      {notice && <div className="notice">{notice}</div>}
      <Credit />
      <InsertDialog />
      <HelpDialog />
    </div>
  );
}
