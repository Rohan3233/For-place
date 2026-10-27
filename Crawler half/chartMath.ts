/**
 * Pure geometry for the report's visualizations (#11, #12). Deliberately
 * dependency-free — no charting library in package.json, and both
 * surfaces (react-pdf's <Svg>/<Path>/<Polygon> and a plain web <svg>)
 * accept the exact same `d` / `points` string syntax, so one set of math
 * functions here can drive both renderers. Callers just wrap the output
 * in the right element for their surface.
 */

export interface PieSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  pathD: string; // SVG path 'd' attribute for this wedge
  percent: number; // 0-100, for a legend label
}

/**
 * Builds pie/donut wedge paths for a set of {key,label,value,color} items,
 * centered at (cx, cy) with outer radius r. innerRadiusRatio > 0 produces
 * a donut instead of a solid pie (0.55 looks like a typical "donut chart").
 * Slices with value 0 are skipped entirely (an empty wedge is a rendering
 * bug waiting to happen, not a real slice).
 */
export function buildPieSlices(
  items: { key: string; label: string; value: number; color: string }[],
  cx: number,
  cy: number,
  r: number,
  innerRadiusRatio = 0
): PieSlice[] {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  if (total <= 0) return [];

  const innerR = r * innerRadiusRatio;
  let angleStart = -Math.PI / 2; // start at 12 o'clock
  const slices: PieSlice[] = [];

  for (const item of items) {
    if (item.value <= 0) continue;
    const fraction = item.value / total;
    const angleEnd = angleStart + fraction * Math.PI * 2;
    const largeArc = angleEnd - angleStart > Math.PI ? 1 : 0;

    const x1 = cx + r * Math.cos(angleStart);
    const y1 = cy + r * Math.sin(angleStart);
    const x2 = cx + r * Math.cos(angleEnd);
    const y2 = cy + r * Math.sin(angleEnd);

    let pathD: string;
    if (innerR > 0) {
      const ix1 = cx + innerR * Math.cos(angleStart);
      const iy1 = cy + innerR * Math.sin(angleStart);
      const ix2 = cx + innerR * Math.cos(angleEnd);
      const iy2 = cy + innerR * Math.sin(angleEnd);
      pathD = [
        `M ${ix1} ${iy1}`,
        `L ${x1} ${y1}`,
        `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`,
        `L ${ix2} ${iy2}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1}`,
        "Z",
      ].join(" ");
    } else {
      pathD = [`M ${cx} ${cy}`, `L ${x1} ${y1}`, `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`, "Z"].join(" ");
    }

    slices.push({
      key: item.key,
      label: item.label,
      value: item.value,
      color: item.color,
      pathD,
      percent: Math.round(fraction * 100),
    });
    angleStart = angleEnd;
  }

  return slices;
}

export interface VitalsScaleSegment {
  label: string;
  color: string;
  widthPct: number; // proportion of the total scale this band occupies
}

export interface VitalsScaleResult {
  segments: VitalsScaleSegment[];
  markerPct: number; // 0-100, where the site's actual value falls on the scale
}

/**
 * Turns a value + Google's good/needs-improvement/poor thresholds into a
 * labeled scale with a marker — replaces a bare "5.9s Poor" with
 * something a non-technical client can actually place in context (#12).
 * `scaleMax` should be comfortably above the worst realistic value you
 * expect to display, so the marker has room to sit visually "far right"
 * on a genuinely bad score instead of clipping at the edge.
 */
export function buildVitalsScale(
  value: number,
  goodMax: number,
  needsImprovementMax: number,
  scaleMax: number
): VitalsScaleResult {
  const clampedMax = Math.max(scaleMax, needsImprovementMax * 1.4, value * 1.05);
  const segments: VitalsScaleSegment[] = [
    { label: "Good", color: "#1F9D55", widthPct: (goodMax / clampedMax) * 100 },
    {
      label: "Needs improvement",
      color: "#D98A1A",
      widthPct: ((needsImprovementMax - goodMax) / clampedMax) * 100,
    },
    { label: "Poor", color: "#D9432E", widthPct: ((clampedMax - needsImprovementMax) / clampedMax) * 100 },
  ];
  const markerPct = Math.min(100, Math.max(0, (value / clampedMax) * 100));
  return { segments, markerPct };
}

export interface RadarAxisPoint {
  label: string;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
}

export interface RadarResult {
  polygonPoints: string; // SVG 'points' attribute for the data polygon
  axes: RadarAxisPoint[];
  gridPolygons: string[]; // concentric background rings at 25/50/75/100%
}

/**
 * Builds a radar/spider chart polygon from N categories each scored
 * 0-100, centered at (cx, cy) with max radius r. Used for the
 * Performance/Metadata/Content/Accessibility/Technical category
 * breakdown (#12) as an alternative/companion to the existing bar view.
 */
export function buildRadarChart(
  categories: { label: string; score: number }[],
  cx: number,
  cy: number,
  r: number,
  labelOffset = 16
): RadarResult {
  const n = categories.length;
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2;

  const axes: RadarAxisPoint[] = categories.map((cat, i) => {
    const angle = startAngle + i * angleStep;
    return {
      label: cat.label,
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      labelX: cx + (r + labelOffset) * Math.cos(angle),
      labelY: cy + (r + labelOffset) * Math.sin(angle),
    };
  });

  const dataPoints = categories.map((cat, i) => {
    const angle = startAngle + i * angleStep;
    const scaledR = r * (Math.max(0, Math.min(100, cat.score)) / 100);
    return `${cx + scaledR * Math.cos(angle)},${cy + scaledR * Math.sin(angle)}`;
  });

  const gridPolygons = [0.25, 0.5, 0.75, 1].map((ratio) => {
    const points = Array.from({ length: n }, (_, i) => {
      const angle = startAngle + i * angleStep;
      return `${cx + r * ratio * Math.cos(angle)},${cy + r * ratio * Math.sin(angle)}`;
    });
    return points.join(" ");
  });

  return { polygonPoints: dataPoints.join(" "), axes, gridPolygons };
}

/** Standard severity color palette, reused by the pie chart and anywhere
 * else critical/moderate/minor gets a color (keeps them consistent). */
export const SEVERITY_COLORS = {
  critical: "#D9432E",
  moderate: "#D98A1A",
  minor: "#1F9D55",
} as const;
