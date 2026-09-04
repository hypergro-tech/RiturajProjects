import { useRef, useState, type DragEvent } from 'react';

interface Props { error: string; onFiles: (files: FileList | null) => void; onDemo: () => void }

export function UploadScreen({ error, onFiles, onDemo }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    onFiles(e.dataTransfer.files);
  };
  return (
    <section className="upload">
      <img src="/assets/monogram-on-white.png" alt="" className="upload-monogram" />
      <div className="upload-heading">
        <h1 className="upload-title">One master. Every format.</h1>
        <p className="upload-lede">
          Upload a key visual: it is parsed and rasterized in your browser, a vision model tags every element, and each target size
          routes through scale, smart crop, expand or rebuild — with brand and compliance gates on every output.
        </p>
      </div>
      <div
        className={'dropzone' + (dragging ? ' is-dragging' : '')}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <div className="dropzone-title">Drop your key visual</div>
        <div className="dropzone-hint">
          .ai (saved with PDF compatibility) or .pdf · first artboard is used · processed locally, nothing leaves your browser except
          one preview frame sent to the vision model
        </div>
        <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>Browse files</button>
        <input
          ref={inputRef}
          type="file"
          accept=".ai,.pdf,application/pdf,application/postscript"
          hidden
          onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
        />
        {error && <div className="dropzone-error" role="alert">{error}</div>}
      </div>
      <div className="or-divider"><span />or<span /></div>
      <button type="button" className="btn btn-secondary" onClick={onDemo}>Use demo master — FedOne Personal Loan (1080×1080)</button>
    </section>
  );
}
