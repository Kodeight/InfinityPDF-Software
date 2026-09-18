import React, { useEffect, useRef, useState } from 'react';
import { ToolId } from '../../types';
import { NEW_TOOL_CATEGORIES, NEW_TOOL_DEFS, ntTitle, ntDesc, ntCat } from './toolDefs';
import { translations, LanguageCode } from '../../translations';

interface Props {
  activeTab: 'dashboard' | ToolId;
  setActiveTab: (tab: 'dashboard' | ToolId) => void;
  lang?: string;
}

// Overflow menu for the 25 additive tools. New file; the existing navbar
// buttons are untouched — this is a single appended entry.
const MoreToolsMenu: React.FC<Props> = ({ activeTab, setActiveTab, lang }) => {
  const t = (key: string) => translations[key]?.[(lang || 'en') as LanguageCode] || key;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = NEW_TOOL_DEFS.some((d) => d.id === activeTab);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`btn-nav px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${isActive ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
      >
        {t('more_tools')} ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[560px] bg-[#141414] border border-white/10 rounded-2xl shadow-2xl z-[100] overflow-hidden">
          {/* Rounded clip wrapper (no scrolling here) + nested scroller:
              Chromium paints native scrollbar chrome square to the edge,
              so radius + overflow on one element lets the scrollbar escape
              the curve. Same pattern in LogDropdown + MultiPDF dropdowns. */}
          <div className="max-h-[70vh] overflow-y-auto custom-scrollbar p-4">
          {/* Uniform spacing system: CSS columns (not grid) so every
              category boundary has the identical gap regardless of how
              many tools each group contains. Grid rows stretch to the
              tallest group, which made heading-to-heading gaps vary. */}
          <div className="columns-2 gap-4">
            {NEW_TOOL_CATEGORIES.map((cat) => (
              <div key={cat} className="mb-4 break-inside-avoid last:mb-0">
                <p className="text-[0.5625em] font-bold uppercase tracking-[0.25em] text-white/30 mb-1 px-1">{ntCat(cat, lang || 'en')}</p>
                {NEW_TOOL_DEFS.filter((d) => d.category === cat).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setActiveTab(d.id as ToolId); setOpen(false); }}
                    // flex-col restores the intended stacked title/desc layout:
                    // the global button rule makes buttons inline-flex (row),
                    // which would otherwise place both spans side by side.
                    className={`btn-nav w-full flex-col items-stretch text-left px-3 py-2 rounded-xl transition-all ${activeTab === d.id ? 'bg-blue-600/20 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                  >
                    <span className="text-xs font-bold block">{ntTitle(d.id, lang || 'en')}</span>
                    <span className="text-[0.625em] text-white/35 block truncate">{ntDesc(d.id, lang || 'en')}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MoreToolsMenu;
