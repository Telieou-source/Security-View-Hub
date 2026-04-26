import { useState, useRef } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  ZoomableGroup,
} from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// ISO 3166-1 alpha-2 → numeric mapping for common threat intel countries
const ALPHA2_TO_NUMERIC: Record<string, number> = {
  AF: 4, AL: 8, DZ: 12, AR: 32, AM: 51, AU: 36, AT: 40, AZ: 31, BD: 50, BY: 112,
  BE: 56, BA: 70, BR: 76, BG: 100, KH: 116, CA: 124, CL: 152, CN: 156, CO: 170,
  HR: 191, CY: 196, CZ: 203, DK: 208, EG: 818, EE: 233, ET: 231, FI: 246, FR: 250,
  GE: 268, DE: 276, GH: 288, GR: 300, HK: 344, HU: 348, IN: 356, ID: 360, IR: 364,
  IQ: 368, IE: 372, IL: 376, IT: 380, JP: 392, JO: 400, KZ: 398, KE: 404, KP: 408,
  KR: 410, LV: 428, LT: 440, LU: 442, MY: 458, MX: 484, MD: 498, MN: 496, MA: 504,
  NL: 528, NZ: 554, NG: 566, NO: 578, PK: 586, PE: 604, PH: 608, PL: 616, PT: 620,
  RO: 642, RU: 643, SA: 682, RS: 688, SG: 702, SK: 703, SI: 705, ZA: 710, ES: 724,
  SE: 752, CH: 756, SY: 760, TW: 158, TH: 764, TN: 788, TR: 792, UA: 804, AE: 784,
  GB: 826, US: 840, UZ: 860, VN: 704, YE: 887,
};

// Build reverse map: numeric → alpha-2
const NUMERIC_TO_ALPHA2: Record<number, string> = {};
for (const [alpha2, numeric] of Object.entries(ALPHA2_TO_NUMERIC)) {
  NUMERIC_TO_ALPHA2[numeric] = alpha2;
}

function getThreatColor(count: number, max: number): string {
  if (count === 0) return "hsl(215 25% 14%)";
  const ratio = count / max;
  if (ratio < 0.15) return "hsl(195 80% 25%)";
  if (ratio < 0.3)  return "hsl(45 90% 35%)";
  if (ratio < 0.5)  return "hsl(30 95% 40%)";
  if (ratio < 0.75) return "hsl(15 95% 42%)";
  return "hsl(0 90% 45%)";
}

interface CountByField {
  label: string;
  count: number;
}

interface TooltipState {
  name: string;
  count: number;
  x: number;
  y: number;
}

interface Props {
  data: CountByField[];
}

export default function WorldThreatMap({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const countMap: Record<string, number> = {};
  for (const { label, count } of data) {
    if (label) countMap[label.toUpperCase()] = count;
  }

  const max = Math.max(1, ...Object.values(countMap));

  // Convert clientX/Y to coordinates relative to the container div.
  // Using absolute positioning on the tooltip avoids the offset that occurs
  // when fixed positioning is combined with scrolled or transformed parents.
  const toRelative = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const legendStops = [
    { label: "None",     color: "hsl(215 25% 14%)" },
    { label: "Low",      color: "hsl(195 80% 25%)" },
    { label: "Medium",   color: "hsl(45 90% 35%)"  },
    { label: "High",     color: "hsl(15 95% 42%)"  },
    { label: "Critical", color: "hsl(0 90% 45%)"   },
  ];

  return (
    <div ref={containerRef} className="relative w-full h-full select-none overflow-hidden">
      <ComposableMap
        projectionConfig={{ scale: 147, center: [0, 10] }}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomableGroup zoom={1} minZoom={0.9} maxZoom={6}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const numericId = parseInt(geo.id as string, 10);
                const alpha2 = NUMERIC_TO_ALPHA2[numericId] ?? null;
                const count = alpha2 ? (countMap[alpha2] ?? 0) : 0;
                const fill = getThreatColor(count, max);
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke="hsl(215 20% 20%)"
                    strokeWidth={0.4}
                    style={{
                      default: { outline: "none" },
                      hover: {
                        outline: "none",
                        fill: count > 0 ? "hsl(0 90% 55%)" : "hsl(215 30% 20%)",
                        cursor: count > 0 ? "pointer" : "default",
                      },
                      pressed: { outline: "none" },
                    }}
                    onMouseEnter={(e) => {
                      if (alpha2) {
                        const { x, y } = toRelative(e.clientX, e.clientY);
                        setTooltip({ name: geo.properties.name as string, count, x, y });
                      }
                    }}
                    onMouseMove={(e) => {
                      if (tooltip) {
                        const { x, y } = toRelative(e.clientX, e.clientY);
                        setTooltip(t => t ? { ...t, x, y } : null);
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })
            }
          </Geographies>
        </ZoomableGroup>
      </ComposableMap>

      {/* Tooltip — absolutely positioned relative to the container */}
      {tooltip && (
        <div
          className="absolute z-50 pointer-events-none px-3 py-2 rounded text-xs font-mono shadow-lg border border-border"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y - 36,
            backgroundColor: "hsl(215 30% 8%)",
            color: tooltip.count > 0 ? "hsl(0 85% 60%)" : "hsl(215 20% 60%)",
          }}
        >
          <div className="font-semibold text-foreground">{tooltip.name}</div>
          <div>{tooltip.count > 0 ? `${tooltip.count.toLocaleString()} indicator${tooltip.count !== 1 ? "s" : ""}` : "No indicators"}</div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-2 left-3 flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider mr-1">Threat Level</span>
        {legendStops.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm border border-border/50" style={{ backgroundColor: color }} />
            <span className="text-xs text-muted-foreground font-mono">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
