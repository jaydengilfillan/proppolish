"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { triggerDownload } from "@/lib/image";

interface Point {
  x: number;
  y: number;
}

type ShapeKind = "room" | "outdoor" | "garage" | "driveway" | "lot";

interface Shape {
  id: string;
  kind: ShapeKind;
  points: Point[];
  label: string;
  dimensionText: string;
}

interface Tree {
  id: string;
  x: number;
  y: number;
}

type Selection = { type: "shape"; id: string } | { type: "tree"; id: string } | null;

type AreaMode = "total" | "split";

interface Brand {
  agencyName: string;
  logoColor: string;
  address: string;
  agentName: string;
  agentPhone: string;
  beds: string;
  baths: string;
  cars: string;
  areaMode: AreaMode;
  areaTotal: string;
  areaInternal: string;
  areaExternal: string;
  areaBlock: string;
  disclaimer: string;
}

const VB_W = 1600;
const VB_H = 1250;
const PLAN_H = 1000; // drawing area; footer occupies the rest

const KIND_LABEL: Record<ShapeKind, string> = {
  room: "Room",
  outdoor: "Outdoor / Patio",
  garage: "Garage",
  driveway: "Driveway",
  lot: "Lot boundary (lawn)",
};

const FILL_BY_KIND: Record<ShapeKind, string> = {
  room: "#A9A9A9",
  outdoor: "url(#hatchPattern)",
  garage: "url(#stipplePattern)",
  driveway: "url(#stipplePattern)",
  lot: "#A0BC8E",
};

const DEFAULT_BRAND: Brand = {
  agencyName: "RayWhite.",
  logoColor: "#FFE512",
  address: "123 Example Street, Suburb",
  agentName: "Agent Name",
  agentPhone: "0400 000 000",
  beds: "4",
  baths: "2",
  cars: "2",
  areaMode: "split",
  areaTotal: "180",
  areaInternal: "160",
  areaExternal: "16",
  areaBlock: "364",
  disclaimer:
    "Dimensions are approximate, interested parties should do their own due diligence. The floor planners take no responsibility for inaccurate measurements or errors",
};

function pointsToPath(points: Point[]): string {
  if (points.length === 0) return "";
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
}

function polygonCentroid(points: Point[]): Point {
  const n = points.length || 1;
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / n, y: sum.y / n };
}

/**
 * Floor Plan — a client-side vector floor plan builder that renders a
 * branded, agency-style output (matching a real Ray White template pulled
 * apart pixel-by-pixel: yellow logo block, address/agent, bed/bath/car icon
 * row, area stats, disclaimer, green lawn, grey rooms, stippled driveway).
 *
 * Deliberately NOT AI-generated: every shape is hand-drawn by the user and
 * every label/dimension/area figure is typed, not inferred. A floor plan is
 * a document buyers rely on for real measurements — this tool automates the
 * DESIGN work (matching your exact branded layout instantly) while keeping
 * every number under full manual control, the same "data-in, template-out"
 * principle used throughout this app's riskier tools.
 *
 * Known simplification: uses a system font stack rather than embedding your
 * exact Canva font, since custom web fonts are unreliable to rasterize
 * consistently across browsers when exporting SVG -> PNG client-side.
 */
export default function FloorPlan() {
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [trees, setTrees] = useState<Tree[]>([]);
  const [mode, setMode] = useState<ShapeKind | "tree" | "select">("select");
  const [draft, setDraft] = useState<Point[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [brand, setBrand] = useState<Brand>(DEFAULT_BRAND);
  const [dragging, setDragging] = useState<
    | { type: "vertex"; shapeId: string; index: number }
    | { type: "shape"; shapeId: string; last: Point }
    | { type: "tree"; treeId: string }
    | null
  >(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const getSvgPoint = useCallback((e: { clientX: number; clientY: number }): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: Math.round(local.x), y: Math.round(local.y) };
  }, []);

  const selectedShape = useMemo(
    () => (selection?.type === "shape" ? shapes.find((s) => s.id === selection.id) : undefined),
    [selection, shapes]
  );

  const finishDraft = useCallback(() => {
    if (draft.length < 3 || mode === "select" || mode === "tree") {
      setDraft([]);
      return;
    }
    const kind = mode as ShapeKind;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const shape: Shape = {
      id,
      kind,
      points: draft,
      label: kind === "lot" ? "" : kind === "driveway" ? "" : KIND_LABEL[kind],
      dimensionText: "",
    };
    setShapes((prev) => [...prev, shape]);
    setDraft([]);
    setMode("select");
    setSelection({ type: "shape", id });
  }, [draft, mode]);

  const onCanvasClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const p = getSvgPoint(e);
      if (mode === "tree") {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setTrees((prev) => [...prev, { id, x: p.x, y: p.y }]);
        return;
      }
      if (mode === "select") {
        setSelection(null);
        return;
      }
      if (draft.length >= 3) {
        const first = draft[0];
        const dist = Math.hypot(p.x - first.x, p.y - first.y);
        if (dist < 18) {
          finishDraft();
          return;
        }
      }
      setDraft((prev) => [...prev, p]);
    },
    [mode, draft, getSvgPoint, finishDraft]
  );

  const onVertexPointerDown = useCallback(
    (e: React.PointerEvent, shapeId: string, index: number) => {
      e.stopPropagation();
      setSelection({ type: "shape", id: shapeId });
      setDragging({ type: "vertex", shapeId, index });
    },
    []
  );

  const onShapeBodyPointerDown = useCallback(
    (e: React.PointerEvent, shapeId: string) => {
      e.stopPropagation();
      setSelection({ type: "shape", id: shapeId });
      const p = getSvgPoint(e);
      setDragging({ type: "shape", shapeId, last: p });
    },
    [getSvgPoint]
  );

  const onTreePointerDown = useCallback((e: React.PointerEvent, treeId: string) => {
    e.stopPropagation();
    setSelection({ type: "tree", id: treeId });
    setDragging({ type: "tree", treeId });
  }, []);

  const onCanvasPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragging) return;
      const p = getSvgPoint(e);
      if (dragging.type === "vertex") {
        setShapes((prev) =>
          prev.map((s) =>
            s.id === dragging.shapeId
              ? { ...s, points: s.points.map((pt, i) => (i === dragging.index ? p : pt)) }
              : s
          )
        );
      } else if (dragging.type === "shape") {
        const dx = p.x - dragging.last.x;
        const dy = p.y - dragging.last.y;
        setShapes((prev) =>
          prev.map((s) =>
            s.id === dragging.shapeId
              ? { ...s, points: s.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) }
              : s
          )
        );
        setDragging({ type: "shape", shapeId: dragging.shapeId, last: p });
      } else if (dragging.type === "tree") {
        setTrees((prev) => prev.map((t) => (t.id === dragging.treeId ? { ...t, x: p.x, y: p.y } : t)));
      }
    },
    [dragging, getSvgPoint]
  );

  const onCanvasPointerUp = useCallback(() => setDragging(null), []);

  const deleteSelected = useCallback(() => {
    if (!selection) return;
    if (selection.type === "shape") setShapes((prev) => prev.filter((s) => s.id !== selection.id));
    else setTrees((prev) => prev.filter((t) => t.id !== selection.id));
    setSelection(null);
  }, [selection]);

  const patchSelectedShape = useCallback(
    (patch: Partial<Shape>) => {
      if (selection?.type !== "shape") return;
      setShapes((prev) => prev.map((s) => (s.id === selection.id ? { ...s, ...patch } : s)));
    },
    [selection]
  );

  const exportPng = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll("[data-editor-only]").forEach((el) => el.remove());
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(clone);
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = VB_W * scale;
      canvas.height = VB_H * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob2) => {
        if (!blob2) return;
        const dlUrl = URL.createObjectURL(blob2);
        triggerDownload(dlUrl, "floor-plan.png");
        URL.revokeObjectURL(dlUrl);
      }, "image/png");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, []);

  const areaText =
    brand.areaMode === "total"
      ? `Total - ${brand.areaTotal}m2`
      : `Internal - ${brand.areaInternal}m2    External - ${brand.areaExternal}m2    Block - ${brand.areaBlock}m2`;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex flex-1 flex-col gap-3">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Every number here is typed by you, not detected.</p>
          <p className="mt-1">
            Draw each shape (click to place points, click near the start point or hit Finish to
            close it), then type its label and dimensions in the panel on the right. Nothing is
            traced from a photo -- that keeps every measurement on the finished plan exactly what
            you entered.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(["select", "room", "outdoor", "garage", "driveway", "lot", "tree"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setDraft([]);
                setMode(m);
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                mode === m
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white hover:bg-neutral-50"
              }`}
            >
              {m === "select" ? "Select / Edit" : m === "tree" ? "Add Tree" : `Draw ${KIND_LABEL[m]}`}
            </button>
          ))}
          {mode !== "select" && mode !== "tree" && draft.length >= 3 && (
            <button
              onClick={finishDraft}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700"
            >
              Finish shape ({draft.length} pts)
            </button>
          )}
          {mode !== "select" && mode !== "tree" && draft.length > 0 && (
            <button
              onClick={() => setDraft([])}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium transition hover:bg-neutral-50"
            >
              Cancel
            </button>
          )}
          <button
            onClick={exportPng}
            className="ml-auto rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Download PNG
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VB_W} ${VB_H}`}
            className="block w-full cursor-crosshair select-none"
            onClick={onCanvasClick}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerLeave={onCanvasPointerUp}
          >
            <defs>
              <pattern id="hatchPattern" width="16" height="16" patternUnits="userSpaceOnUse">
                <rect width="16" height="16" fill="#ffffff" />
                <path d="M0 16 L16 0" stroke="#cfcfcf" strokeWidth="1.5" />
                <path d="M0 0 L0 16 M0 0 L16 0" stroke="#cfcfcf" strokeWidth="1" />
              </pattern>
              <pattern id="stipplePattern" width="10" height="10" patternUnits="userSpaceOnUse">
                <rect width="10" height="10" fill="#E6E7E2" />
                <circle cx="2" cy="2" r="0.8" fill="#c9cac4" />
                <circle cx="7" cy="6" r="0.8" fill="#c9cac4" />
              </pattern>
            </defs>

            <rect x={0} y={0} width={VB_W} height={PLAN_H} fill="#ffffff" />

            {shapes
              .filter((s) => s.kind === "lot")
              .concat(shapes.filter((s) => s.kind !== "lot"))
              .map((s) => {
                const c = polygonCentroid(s.points);
                return (
                  <g key={s.id}>
                    <path
                      d={pointsToPath(s.points)}
                      fill={FILL_BY_KIND[s.kind]}
                      stroke={selection?.type === "shape" && selection.id === s.id ? "#111827" : "#4b5563"}
                      strokeWidth={selection?.type === "shape" && selection.id === s.id ? 4 : 3}
                      onPointerDown={(e) => onShapeBodyPointerDown(e, s.id)}
                      className="cursor-move"
                    />
                    {(s.label || s.dimensionText) && (
                      <g pointerEvents="none">
                        {s.label && (
                          <text
                            x={c.x}
                            y={c.y - (s.dimensionText ? 10 : 0)}
                            textAnchor="middle"
                            fontSize="20"
                            fontWeight={700}
                            fill="#1a1a1a"
                            fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
                          >
                            {s.label}
                          </text>
                        )}
                        {s.dimensionText && (
                          <text
                            x={c.x}
                            y={c.y + 16}
                            textAnchor="middle"
                            fontSize="15"
                            fill="#1a1a1a"
                            fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
                          >
                            {s.dimensionText}
                          </text>
                        )}
                      </g>
                    )}
                    {selection?.type === "shape" &&
                      selection.id === s.id &&
                      s.points.map((pt, i) => (
                        <circle
                          key={i}
                          data-editor-only="true"
                          cx={pt.x}
                          cy={pt.y}
                          r={7}
                          fill="#3b82f6"
                          stroke="#ffffff"
                          strokeWidth={2}
                          className="cursor-pointer"
                          onPointerDown={(e) => onVertexPointerDown(e, s.id, i)}
                        />
                      ))}
                  </g>
                );
              })}

            {trees.map((t) => (
              <g
                key={t.id}
                transform={`translate(${t.x}, ${t.y})`}
                onPointerDown={(e) => onTreePointerDown(e, t.id)}
                className="cursor-move"
              >
                <circle
                  r={14}
                  fill={selection?.type === "tree" && selection.id === t.id ? "#4f7a3f" : "#6b9e56"}
                  stroke="#3f5f32"
                  strokeWidth={2}
                />
                <circle cx={-6} cy={-6} r={9} fill="#7fb369" />
                <circle cx={7} cy={-4} r={9} fill="#7fb369" />
                <circle cx={0} cy={7} r={9} fill="#7fb369" />
              </g>
            ))}

            {draft.length > 0 && (
              <g data-editor-only="true" pointerEvents="none">
                <path
                  d={draft.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
                {draft.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={5} fill="#3b82f6" />
                ))}
              </g>
            )}

            <g fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">
              <rect x={0} y={PLAN_H} width={VB_W} height={VB_H - PLAN_H} fill="#ffffff" />
              <rect x={40} y={PLAN_H + 30} width={180} height={140} fill={brand.logoColor} />
              <text
                x={130}
                y={PLAN_H + 110}
                textAnchor="middle"
                fontSize="22"
                fontWeight={800}
                fontStyle="italic"
                fill="#2b2b40"
              >
                {brand.agencyName}
              </text>

              <text x={250} y={PLAN_H + 90} fontSize="26" fontWeight={700} fill="#1a1a1a">
                {brand.address}
              </text>
              <text x={250} y={PLAN_H + 125} fontSize="18" fill="#1a1a1a">
                {brand.agentName} - {brand.agentPhone}
              </text>

              <g transform={`translate(900, ${PLAN_H + 55})`} fontSize="15" fill="#1a1a1a">
                <text x={28} y={5}>{brand.beds} Bedrooms</text>
                <text x={28} y={35}>{brand.baths} Bathrooms</text>
                <text x={28} y={65}>{brand.cars} Car Spaces</text>
              </g>

              <text x={1180} y={PLAN_H + 90} fontSize="20" fill="#1a1a1a">
                {areaText}
              </text>

              <text x={VB_W / 2} y={PLAN_H + 200} textAnchor="middle" fontSize="13" fill="#4b4b4b">
                {brand.disclaimer}
              </text>
            </g>
          </svg>
        </div>
      </div>

      <div className="flex w-full flex-col gap-4 lg:w-80">
        {selection && (
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <p className="mb-2 text-sm font-medium">
              {selection.type === "tree" ? "Tree" : KIND_LABEL[selectedShape?.kind ?? "room"]}
            </p>
            {selection.type === "shape" && selectedShape && (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-neutral-500">
                  Label
                  <input
                    type="text"
                    value={selectedShape.label}
                    onChange={(e) => patchSelectedShape({ label: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
                  />
                </label>
                <label className="text-xs text-neutral-500">
                  Dimensions (typed, e.g. "4.5 x 6.6m")
                  <input
                    type="text"
                    value={selectedShape.dimensionText}
                    onChange={(e) => patchSelectedShape({ dimensionText: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
                  />
                </label>
                <label className="text-xs text-neutral-500">
                  Kind
                  <select
                    value={selectedShape.kind}
                    onChange={(e) => patchSelectedShape({ kind: e.target.value as ShapeKind })}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
                  >
                    {(Object.keys(KIND_LABEL) as ShapeKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            <button
              onClick={deleteSelected}
              className="mt-3 w-full rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
            >
              Delete
            </button>
          </div>
        )}

        <div className="rounded-xl border border-neutral-200 bg-white p-3">
          <p className="mb-2 text-sm font-medium">Branding</p>
          <div className="flex flex-col gap-2">
            <FieldText label="Agency name" value={brand.agencyName} onChange={(v) => setBrand((b) => ({ ...b, agencyName: v }))} />
            <FieldColor label="Logo block colour" value={brand.logoColor} onChange={(v) => setBrand((b) => ({ ...b, logoColor: v }))} />
            <FieldText label="Property address" value={brand.address} onChange={(v) => setBrand((b) => ({ ...b, address: v }))} />
            <FieldText label="Agent name" value={brand.agentName} onChange={(v) => setBrand((b) => ({ ...b, agentName: v }))} />
            <FieldText label="Agent phone" value={brand.agentPhone} onChange={(v) => setBrand((b) => ({ ...b, agentPhone: v }))} />
            <div className="grid grid-cols-3 gap-2">
              <FieldText label="Beds" value={brand.beds} onChange={(v) => setBrand((b) => ({ ...b, beds: v }))} />
              <FieldText label="Baths" value={brand.baths} onChange={(v) => setBrand((b) => ({ ...b, baths: v }))} />
              <FieldText label="Cars" value={brand.cars} onChange={(v) => setBrand((b) => ({ ...b, cars: v }))} />
            </div>

            <label className="text-xs text-neutral-500">
              Area stats
              <div className="mt-1 flex gap-1 rounded-lg bg-neutral-100 p-1">
                <button
                  onClick={() => setBrand((b) => ({ ...b, areaMode: "total" }))}
                  className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                    brand.areaMode === "total" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
                  }`}
                >
                  Total only
                </button>
                <button
                  onClick={() => setBrand((b) => ({ ...b, areaMode: "split" }))}
                  className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition ${
                    brand.areaMode === "split" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
                  }`}
                >
                  Internal / External / Block
                </button>
              </div>
            </label>

            {brand.areaMode === "total" ? (
              <FieldText label="Total area (m2)" value={brand.areaTotal} onChange={(v) => setBrand((b) => ({ ...b, areaTotal: v }))} />
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <FieldText label="Internal" value={brand.areaInternal} onChange={(v) => setBrand((b) => ({ ...b, areaInternal: v }))} />
                <FieldText label="External" value={brand.areaExternal} onChange={(v) => setBrand((b) => ({ ...b, areaExternal: v }))} />
                <FieldText label="Block" value={brand.areaBlock} onChange={(v) => setBrand((b) => ({ ...b, areaBlock: v }))} />
              </div>
            )}

            <label className="text-xs text-neutral-500">
              Disclaimer
              <textarea
                value={brand.disclaimer}
                onChange={(e) => setBrand((b) => ({ ...b, disclaimer: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs outline-none focus:border-neutral-500"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs text-neutral-500">
      {label}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-500"
      />
    </label>
  );
}

function FieldColor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs text-neutral-500">
      {label}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-8 w-full rounded-lg border border-neutral-300"
      />
    </label>
  );
}
