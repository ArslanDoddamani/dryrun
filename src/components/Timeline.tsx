import { ChevronLeft, ChevronRight, Pause, Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { addStep, checkpoint, deleteStep, gotoStep, moveStep, setNote, useStore } from "../store";

/** Bottom bar: the trace is a list of steps (snapshots); each step has a note explaining it. */
export function Timeline() {
  const doc = useStore((s) => s.doc);
  const [playing, setPlaying] = useState(false);
  const chips = useRef<HTMLDivElement>(null);
  const note = useRef<HTMLTextAreaElement>(null);
  const step = doc.steps[doc.current];

  // grow the note box with its content
  useLayoutEffect(() => {
    const ta = note.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight + 2}px`;
  }, [step.note]);

  useEffect(() => {
    chips.current?.querySelector(".chip.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [doc.current]);

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      const { doc } = useStore.getState();
      if (doc.current >= doc.steps.length - 1) setPlaying(false);
      else gotoStep(doc.current + 1);
    }, 1600);
    return () => window.clearInterval(t);
  }, [playing]);

  return (
    <div className="timeline island" onPointerDown={(e) => e.stopPropagation()}>
      <div className="timeline-row">
        <span className="timeline-title">Steps</span>
        <button className="icon-btn" title="Previous step — [" disabled={doc.current === 0} onClick={() => gotoStep(doc.current - 1)}>
          <ChevronLeft size={18} />
        </button>
        <div className="chips" ref={chips}>
          {doc.steps.map((s, i) => (
            <button
              key={s.id}
              className={`chip${i === doc.current ? " active" : ""}`}
              title={s.note || `Step ${i + 1}`}
              onClick={() => gotoStep(i)}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/step", String(i))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const from = Number(e.dataTransfer.getData("text/step"));
                if (!Number.isNaN(from)) moveStep(from, i);
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
        <button className="icon-btn" title="Next step — ]" disabled={doc.current === doc.steps.length - 1} onClick={() => gotoStep(doc.current + 1)}>
          <ChevronRight size={18} />
        </button>
        <button className="primary-btn" title="Snapshot this board as the next step, then edit it — N" onClick={addStep}>
          <Plus size={16} /> Next step
        </button>
        <button
          className="icon-btn"
          title={playing ? "Pause" : "Play through the steps"}
          disabled={doc.steps.length < 2}
          onClick={() => {
            if (!playing && doc.current === doc.steps.length - 1) gotoStep(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="icon-btn danger" title="Delete this step" disabled={doc.steps.length < 2} onClick={() => deleteStep()}>
          <Trash2 size={16} />
        </button>
      </div>
      <textarea
        ref={note}
        className="note"
        rows={1}
        placeholder={`Step ${doc.current + 1} note — what happens here? e.g. "i=2: nums[i]=11, need -2 → not in map"`}
        value={step.note}
        onFocus={checkpoint}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
        }}
      />
    </div>
  );
}
