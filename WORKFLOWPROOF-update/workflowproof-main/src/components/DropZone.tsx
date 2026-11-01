import { useRef, useState } from 'react';

interface Props {
  onFile: (file: File) => void;
  error?: string;
}

export function DropZone({ onFile, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const handle = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div>
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
      >
        <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={(e) => handle(e.target.files)} />
        <div className="drop-icon">⇩</div>
        <h2>Drop your n8n workflow.json</h2>
        <p>or click to choose a file</p>
        <div className="privacy-pill">Workflow JSON stays on device · Report saved to your account</div>
      </div>
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}
