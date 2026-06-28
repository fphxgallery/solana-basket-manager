import type { LucideIcon } from "lucide-react";

export type TabKey = "trades" | "basket" | "dynamic" | "metrics" | "settings";

export interface TabDef {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  count?: number;
}

export function Tabs({ tabs, active, onChange }: { tabs: TabDef[]; active: TabKey; onChange: (k: TabKey) => void }) {
  return (
    <div className="flex items-center gap-6 px-4">
      {tabs.map((t) => {
        const on = active === t.key;
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`group flex items-center gap-2 py-3 text-[11px] tracking-wide transition-colors ${
              on ? "text-ink" : "text-dim hover:text-muted"
            }`}
          >
            {/* marker dot — only the active tab shows a glowing cyan dot */}
            <span
              className="w-[5px] h-[5px] rounded-full flex-shrink-0 transition-all"
              style={on ? { background: "var(--cyan)", boxShadow: "0 0 7px var(--cyan)" } : { background: "transparent" }}
            />
            <Icon className="w-3.5 h-3.5" />
            {t.label}
            {t.count != null && (
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] leading-none border ${
                  on ? "text-cyan border-cyan-line bg-cyan-bg" : "text-dim border-cardline"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
