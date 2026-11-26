import { useCallback, useEffect, useRef, useState } from 'react';
import { effectivePlacement } from '../store';
import type { Photo, Placement } from '../lib/types';
import { blobUrl } from '../lib/format';
import { DPI_FLOOR, printDpi } from '../lib/geometry';

export const FRAME_W = 279; // px preview of the 219-unit crop window
export const FRAME_H = 331;

/** Re-frame state for one photo: drag / zoom / nudge / rotate with a pending placement that is
 *  committed (debounced for the fine controls) through `onCommit`. `undefined` = back to the
 *  buyer's own framing. Shared by Review and Crop export. */
export function useReframe(
  photo: Photo | undefined,
  onCommit: (photo: Photo, placement: Placement | undefined) => void,
  /** printed photo frame in mm the DPI is judged against; default = Instant Photo Prints */
  frame?: { w: number; h: number },
  /** on-screen width of the crop frame in px (height keeps the 279:331 preview ratio) */
  frameW: number = FRAME_W
) {
  // pending (uncommitted) placement while dragging/zooming
  const [pend, setPend] = useState<Placement | null>(null);
  const commitTimer = useRef<number | null>(null);
  const eff = photo ? (pend ?? effectivePlacement(photo)) : null;

  // while focused, the zoom input holds a draft string; null = mirror the live value
  const [zoomDraft, setZoomDraft] = useState<string | null>(null);
  // escape blurs synchronously, before the setZoomDraft(null) state update lands — flag the cancel
  const zoomCancel = useRef(false);

  const photoId = photo?.id;
  useEffect(() => { setPend(null); setZoomDraft(null); }, [photoId]);

  const commit = useCallback(
    (p: Placement) => {
      if (!photo) return;
      const same =
        p.scale === photo.buyerPlacement.scale &&
        p.angle === photo.buyerPlacement.angle &&
        p.position.x === photo.buyerPlacement.position.x &&
        p.position.y === photo.buyerPlacement.position.y;
      onCommit(photo, same ? undefined : p);
    },
    [photo, onCommit]
  );

  const scheduleCommit = useCallback(
    (p: Placement) => {
      if (commitTimer.current) window.clearTimeout(commitTimer.current);
      commitTimer.current = window.setTimeout(() => commit(p), 350);
    },
    [commit]
  );

  const editable = !!photo && !!eff && !photo.missing;

  function zoomTo(newScale: number) {
    if (!photo || !eff || photo.missing) return;
    const s = Math.max(0.01, Math.min(newScale, 5));
    // keep the crop-window centre fixed
    const cx = photo.crop.x + photo.crop.w / 2;
    const cy = photo.crop.y + photo.crop.h / 2;
    const ix = (cx - eff.position.x) / eff.scale;
    const iy = (cy - eff.position.y) / eff.scale;
    const p: Placement = { ...eff, scale: s, position: { x: cx - ix * s, y: cy - iy * s } };
    setPend(p);
    scheduleCommit(p);
  }

  /** move the image by design-canvas units; 1 unit ≈ 0.32 mm on paper */
  function nudge(dx: number, dy: number) {
    if (!editable || !eff) return;
    const p: Placement = { ...eff, position: { x: eff.position.x + dx, y: eff.position.y + dy } };
    setPend(p);
    scheduleCommit(p);
  }

  function rotate90() {
    if (!editable || !eff) return;
    const p: Placement = { ...eff, angle: (eff.angle + 90) % 360 };
    setPend(p);
    commit(p);
  }

  /** fine rotation about the image centre — the crop pipeline takes any angle */
  function rotateBy(delta: number) {
    if (!editable || !eff) return;
    const p: Placement = { ...eff, angle: (((eff.angle + delta) % 360) + 360) % 360 };
    setPend(p);
    scheduleCommit(p);
  }

  function resetFraming() {
    if (!photo) return;
    if (commitTimer.current) window.clearTimeout(commitTimer.current);
    setPend(null);
    onCommit(photo, undefined);
  }

  // rotate handle: drag swings the image about its centre; snaps to right angles unless shift is held
  const frameRef = useRef<HTMLDivElement>(null);
  const rotRef = useRef<{ startAngle: number; startPointer: number } | null>(null);
  const pointerAngle = (e: React.PointerEvent) => {
    const r = frameRef.current!.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const onRotDown = (e: React.PointerEvent) => {
    if (!editable || !eff) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    rotRef.current = { startAngle: eff.angle, startPointer: pointerAngle(e) };
  };
  const onRotMove = (e: React.PointerEvent) => {
    if (!rotRef.current || !eff) return;
    let a = rotRef.current.startAngle + pointerAngle(e) - rotRef.current.startPointer;
    a = ((a % 360) + 360) % 360;
    const near = (Math.round(a / 90) * 90) % 360;
    const off = ((a - near + 540) % 360) - 180;
    if (!e.shiftKey && Math.abs(off) < 2.5) a = near; // settle onto 0/90/180/270
    else a = Math.round(a * 2) / 2; // otherwise 0.5° steps
    setPend({ ...eff, angle: a });
  };
  const onRotUp = () => {
    if (rotRef.current && pend) commit(pend);
    rotRef.current = null;
  };

  // drag to pan
  const dragRef = useRef<{ x: number; y: number; p: Placement } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!editable || !eff) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, p: eff };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current || !photo) return;
    const unitsPerPx = photo.crop.w / frameW;
    const start = dragRef.current;
    setPend({
      ...start.p,
      position: {
        x: start.p.position.x + (e.clientX - start.x) * unitsPerPx,
        y: start.p.position.y + (e.clientY - start.y) * unitsPerPx,
      },
    });
  };
  const onPointerUp = () => {
    if (dragRef.current && pend) commit(pend);
    dragRef.current = null;
  };

  const dpi = photo && eff ? printDpi(photo.crop, eff.scale, frame) : 0;

  return {
    frameW, eff, dpi, zoomTo, nudge, rotate90, rotateBy, resetFraming,
    frameRef, onPointerDown, onPointerMove, onPointerUp, onRotDown, onRotMove, onRotUp,
    zoomDraft, setZoomDraft, zoomCancel,
  };
}

export type Reframe = ReturnType<typeof useReframe>;

/** Keyboard for the re-frame controls: ⇧arrows nudge, [ ] rotate 1° (⇧ = 5°), R rotate 90°.
 *  Returns true when the key was handled. */
export function reframeKey(e: KeyboardEvent, r: Reframe): boolean {
  if (e.shiftKey && e.key.startsWith('Arrow')) {
    // fine adjustment: shift+arrows nudge the image 1 unit (~0.32 mm printed)
    e.preventDefault();
    if (e.key === 'ArrowRight') r.nudge(1, 0);
    else if (e.key === 'ArrowLeft') r.nudge(-1, 0);
    else if (e.key === 'ArrowUp') r.nudge(0, -1);
    else if (e.key === 'ArrowDown') r.nudge(0, 1);
    return true;
  }
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    // fine rotation: [ ] = 1°, with shift = 5°
    e.preventDefault();
    r.rotateBy((e.code === 'BracketLeft' ? -1 : 1) * (e.shiftKey ? 5 : 1));
    return true;
  }
  if (e.key === 'r' || e.key === 'R') {
    r.rotate90();
    return true;
  }
  return false;
}

/** The draggable crop window: source image placed live under the frame, thirds grid, rotate handle. */
export function CropFrame({ photo, r }: { photo: Photo; r: Reframe }) {
  const eff = r.eff;
  if (!eff) return null;
  const kUnits = r.frameW / (photo.crop.w || 219); // px per design unit in the crop frame
  return (
    <div
      ref={r.frameRef}
      className="crop-frame"
      style={{ width: r.frameW, height: Math.round((r.frameW * FRAME_H) / FRAME_W) }}
      onPointerDown={r.onPointerDown}
      onPointerMove={r.onPointerMove}
      onPointerUp={r.onPointerUp}
      onWheel={(e) => {
        r.zoomTo(eff.scale * (e.deltaY < 0 ? 1.06 : 1 / 1.06));
      }}
    >
      {r.dpi < DPI_FLOOR && <div className="dpi-chip">{r.dpi} DPI</div>}
      <img
        src={blobUrl(photo.sourceBlob)}
        alt=""
        style={{
          left: (eff.position.x - photo.crop.x) * kUnits,
          top: (eff.position.y - photo.crop.y) * kUnits,
          width: eff.dimension.width * eff.scale * kUnits,
          height: eff.dimension.height * eff.scale * kUnits,
          transform: eff.angle ? `rotate(${eff.angle}deg)` : undefined,
        }}
      />
      <div className="thirds" />
      <div className="safe" />
      <div
        className="rot-handle"
        title="Drag to rotate · snaps to 90s, hold shift for free rotation"
        onPointerDown={r.onRotDown}
        onPointerMove={r.onRotMove}
        onPointerUp={r.onRotUp}
      >
        ⟳
      </div>
    </div>
  );
}

/** Zoom stepper, nudge pad, fine rotation, rotate 90° and reset — the row under the crop frame. */
export function CropControls({ photo, r }: { photo: Photo; r: Reframe }) {
  const eff = r.eff;
  if (!eff || photo.missing) return null;
  const { zoomDraft, setZoomDraft, zoomCancel } = r;
  return (
    <>
      <div className="crop-controls">
        <div className="stepper" title="Zoom relative to the buyer's framing — type an exact value, e.g. 1.37">
          <button onClick={() => r.zoomTo(eff.scale / 1.1)}>−</button>
          <input
            className="val"
            value={zoomDraft ?? `${(eff.scale / photo.buyerPlacement.scale).toFixed(2)}×`}
            onFocus={(e) => {
              setZoomDraft((eff.scale / photo.buyerPlacement.scale).toFixed(2));
              e.target.select();
            }}
            onChange={(e) => setZoomDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              else if (e.key === 'Escape') { zoomCancel.current = true; (e.target as HTMLInputElement).blur(); }
            }}
            onBlur={() => {
              if (!zoomCancel.current && zoomDraft !== null) {
                const v = parseFloat(zoomDraft.replace(',', '.'));
                if (Number.isFinite(v) && v > 0) r.zoomTo(v * photo.buyerPlacement.scale);
              }
              zoomCancel.current = false;
              setZoomDraft(null);
            }}
          />
          <button onClick={() => r.zoomTo(eff.scale * 1.1)}>+</button>
        </div>
        <div className="stepper nudge" title="Nudge the image · click = 0.3 mm · shift+click = 1.6 mm">
          {(
            [
              ['◀', -1, 0],
              ['▲', 0, -1],
              ['▼', 0, 1],
              ['▶', 1, 0],
            ] as const
          ).map(([sym, dx, dy]) => (
            <button key={sym} onClick={(e) => r.nudge(dx * (e.shiftKey ? 5 : 1), dy * (e.shiftKey ? 5 : 1))}>
              {sym}
            </button>
          ))}
        </div>
        <div className="stepper nudge" title="Fine rotation · click = 1° · shift+click = 5°">
          <button onClick={(e) => r.rotateBy(e.shiftKey ? -5 : -1)}>⟲</button>
          <span className="val">{(eff.angle > 180 ? eff.angle - 360 : eff.angle).toFixed(0)}°</span>
          <button onClick={(e) => r.rotateBy(e.shiftKey ? 5 : 1)}>⟳</button>
        </div>
        <button className="btn sm" onClick={r.rotate90}>Rotate 90° <span className="faint mono">R</span></button>
        <button className="btn sm" onClick={r.resetFraming}>Reset to buyer framing</button>
      </div>
      <div className="crop-hint">Drag to re-frame · scroll to zoom · ⇧arrows / pad to nudge · [ ] to rotate fine</div>
    </>
  );
}
