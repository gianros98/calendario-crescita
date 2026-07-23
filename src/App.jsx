import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import logoFiver from "./assets/logo-fiver-white.png";
import { supabase, STATE_TABLE, STATE_ROW_ID } from "./supabaseClient";

/* ---------------------------------------------------------
   CALENDARIO CRESCITA 2026
   Design token system (invariato dalle versioni precedenti)
     bg #1C1428  surface #241B33  surface2 #2E2240
     text #F5EFE6  textMuted #B8A9C9
     gold #E8B84B "previsto"  coral #FF6F59 "effettivo"
     sage #7FBC8C positivo    rose #E1637A negativo
   Type: Fraunces (display) + Space Grotesk (dati, tabular-nums)

   Architettura di questa versione:
   - Nessun evento precompilato: si aggiungono a mano, mese per mese.
   - Ogni mese mostra una griglia di celle-evento; cliccando si entra
     nella vista di gestione dedicata (tabelle ricavi/costi + KPI).
   - Ricavi = tabella Ingressi/Beverage, previsto ed effettivo, con
     il Movimentato calcolato come somma (non più una leva a sé).
   - Costi = elenco libero per evento (si aggiungono/rimuovono righe).
   - Percentuale locale applicata per ultima su (ricavi - altri costi):
     due livelli di margine, Livello 1 (pre-locale) e Livello 2 = provvigione.
     Il locale può prendere una % oppure un importo fisso.
   - Alcuni eventi (es. casting) hanno una provvigione fissa diretta,
     scollegata da ricavi/costi.

   Persistenza: Supabase (Postgres cloud condiviso), tabella
   "fiver_plan_state", riga singola (id=1) con colonne jsonb
   "events"/"settings". Sincronizzazione in tempo reale via
   Realtime: ogni client aggiornato vede le modifiche altrui.
   --------------------------------------------------------- */

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Space+Grotesk:wght@400;500;600;700&display=swap');`;

const MONTHS = ["Settembre", "Ottobre", "Novembre", "Dicembre"];

const EVENT_TYPES = {
  aperitivo: { label: "Aperitivo", icon: "◐" },
  party: { label: "Festa", icon: "✷" },
  sport: { label: "Sport", icon: "◈" },
  casting: { label: "Casting", icon: "◎" },
  altro: { label: "Altro", icon: "○" },
};

const REVENUE_LINES = [
  { key: "ticket", label: "Ingressi", color: "#FF6F59" },
  { key: "bar", label: "Beverage", color: "#E8B84B" },
];

const DEFAULT_COST_LABELS = [
  "Personale", "DJ / intrattenimento", "Sicurezza", "Pubblicità", "Materiale e attrezzature", "Noleggio attrezzature",
];

const OLD_COST_LABELS = {
  personale: "Personale", dj: "DJ / intrattenimento", sicurezza: "Sicurezza",
  pubblicita: "Pubblicità", materiale: "Materiale e attrezzature", noleggio: "Noleggio attrezzature", altro: "Altro",
};

/* ---------- il piano (percorso strategico Fiver) ---------- */

const PLAN_SECTIONS = [
  {
    title: "Chi è Fiver oggi",
    points: [
      { icon: "◈", title: "Cosa fa", text: "Feste a tema (Halloween, Capodanno, Carnevale), aperitivi ricorrenti in locali e piscine, tornei sportivi — per privati e aperti al pubblico." },
      { icon: "⚽", title: "Il torneo diventato un punto fermo", text: "La Fiver Cup di calcio è l'evento sportivo di riferimento, con l'idea di ampliarsi anche a pallavolo e padel." },
      { icon: "◎", title: "Come lavora oggi", text: "Sulla carta è un servizio di consulenza, ma nella pratica le feste sono organizzate direttamente da Fiver." },
      { icon: "?", title: "Il marchio oggi", text: "Riconosciuto e riconoscibile nella zona, ma non ancora registrato — e la parte fiscale non è ancora allineata a quello che fa davvero." },
    ],
  },
  {
    title: "Dove vuole arrivare Fiver",
    points: [
      { icon: "✷", title: "Un'azienda vera, non un servizio", text: "Commercia i propri servizi: organizzazione eventi, ingressi, beverage, merchandising, consulenza per chi vuole sfruttare il marchio." },
      { icon: "€", title: "Incassa e paga, non prende quello che avanza", text: "Fa il prezzo, paga fornitori e dipendenti, incassa dai clienti — non aspetta più quello che resta a fine serata." },
      { icon: "!", title: "Si assume il rischio", text: "Costi fissi, permessi, responsabilità: Fiver diventa chi rischia in prima persona, non chi sta a guardare." },
      { icon: "✓", title: "In regola, a tutti gli effetti", text: "Una vera azienda che organizza eventi — e lo fa nel modo giusto, stipendiando i soci come chiunque altro ci lavori." },
    ],
  },
  {
    title: "Cosa serve a Lorenzo e Gabriele per arrivarci",
    points: [
      { icon: "◈", title: "Avere un piano", text: "Una direzione scritta, con tappe e obiettivi chiari — non solo l'intenzione di arrivarci." },
      { icon: "✷", title: "Costruire procedure aziendali", text: "Il patrimonio dell'azienda: know-how tecnico e conoscenze che oggi vivono solo nella testa di due persone." },
      { icon: "€", title: "Avere strumenti di monitoraggio", text: "Economici e non: per sapere sempre, numeri alla mano, se la strada presa è quella giusta." },
    ],
  },
  {
    title: "Cosa succede se non si studia un piano",
    variant: "warn",
    points: [
      { icon: "!", title: "Si passa di moda", text: "Il pubblico cambia gusti più in fretta di quanto un'idea vincente riesca a reggere da sola." },
      { icon: "!", title: "Manca la capacità di reinventarsi", text: "Senza una struttura, ogni cambiamento richiesto dal mercato diventa un salto nel buio, non una scelta preparata." },
      { icon: "!", title: "Investimenti sbagliati, o nessun investimento", text: "Senza numeri e un piano, non si sa mai davvero dove conviene mettere energie e soldi." },
      { icon: "!", title: "Restano due persone brave a fare feste", text: "Non un'azienda. La differenza si vede quando l'entusiasmo iniziale finisce." },
    ],
  },
  {
    title: "Il primo strumento: chiudere bene il 2026",
    variant: "highlight",
    points: [
      { icon: "€", title: "Un budget su quanto ci si aspetta di guadagnare", text: "Sia il movimentato che passa dai locali dove organizzate, sia quello che resta davvero a voi — fino a dicembre." },
      { icon: "=", title: "Un riscontro reale, evento dopo evento", text: "Per sapere come sta andando con i dati alla mano, non a sensazione." },
      { icon: "✓", title: "La base per il 2027", text: "Gli stessi numeri diventano le fondamenta su cui costruire le previsioni dell'anno prossimo." },
    ],
    cta: true,
  },
  {
    title: "Se il 2026 conferma l'obiettivo",
    points: [
      { icon: "✷", title: "Un obiettivo ambizioso e realistico", text: "Se lo si raggiunge, vuol dire che il modello regge davvero — non è stato un caso." },
      { icon: "◈", title: "Un piano 2027 su 12 mesi", text: "Costruito sui dati veri raccolti nel 2026, non su stime o sensazioni." },
      { icon: "✓", title: "Da qui si diventa un'azienda", text: "Permessi, società, uno stipendio vero, le regole in ordine — comportarsi da azienda, non più da due persone che organizzano feste." },
    ],
    closingSteps: [
      { emoji: "💡", label: "Idea" },
      { emoji: "📋", label: "Progetto" },
      { emoji: "📈", label: "Azienda che crea valore" },
    ],
  },
];

const uid = () => Math.random().toString(36).slice(2, 10);

function newEvent(month, costLabels) {
  return {
    id: uid(), month, name: "Nuovo evento", type: "altro",
    revenues: { ticket: { budget: 0, actual: null }, bar: { budget: 0, actual: null } },
    costs: (Array.isArray(costLabels) ? costLabels : DEFAULT_COST_LABELS).map((label) => ({ id: uid(), label, budget: 0, actual: null })),
    marginMode: "percent", // "percent" | "fixedLocale" | "flatFee"
    percLocalePct: 20,
    localeFixed: { budget: null, actual: null },
    flatFee: { budget: null, actual: null },
    budgetAttendees: null, actualAttendees: null,
    note: "",
  };
}

const defaultEvents = () => [];

const defaultSettings = () => ({
  targetMovimentato: { min: 50000, obiettivo: 80000, stretch: 100000 },
  targetMargine: { min: 12000, obiettivo: 18000, stretch: 22000 },
  defaultCostLabels: [...DEFAULT_COST_LABELS],
});

function formatEuro(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(n) + "€";
}

/* ---------- calcoli ---------- */

function revenueTotal(ev, field) {
  const t = ev.revenues.ticket[field];
  const b = ev.revenues.bar[field];
  if (field === "actual" && (t === null || t === undefined) && (b === null || b === undefined)) return null;
  return (t || 0) + (b || 0);
}

function costsTotal(ev, field) {
  return ev.costs.reduce((sum, c) => sum + (c[field] || 0), 0);
}

// Livello 1: margine prima della percentuale locale (ricavi meno gli altri costi).
function levelOne(ev, field) {
  const rev = revenueTotal(ev, field);
  if (rev === null) return null;
  return rev - costsTotal(ev, field);
}

// Livello 2 = provvigione finale, dopo aver dato al locale la sua quota (in % o fissa).
function computeMargin(ev, field) {
  if (ev.marginMode === "flatFee") {
    const v = ev.flatFee[field];
    return v === null || v === undefined ? (field === "budget" ? 0 : null) : v;
  }
  const l1 = levelOne(ev, field);
  if (l1 === null) return null;
  if (ev.marginMode === "fixedLocale") {
    const amt = ev.localeFixed[field] || 0;
    return l1 - amt;
  }
  const pct = ev.percLocalePct || 0;
  const quota = Math.max(0, l1) * pct / 100;
  return l1 - quota;
}

// Quanto prende il locale, in qualunque modalità (solo per i modi legati a ricavi/costi).
function localeAmount(ev, field) {
  if (ev.marginMode === "flatFee") return null;
  const l1 = levelOne(ev, field);
  if (l1 === null) return null;
  return l1 - computeMargin(ev, field);
}

// Punto di pareggio: movimentato che serve per andare a zero (Livello 2 = 0).
function breakEvenValue(ev, field) {
  const costs = costsTotal(ev, field);
  if (ev.marginMode === "fixedLocale") return costs + (ev.localeFixed[field] || 0);
  return costs;
}

/* ---------- migrazione dati salvati in versioni precedenti ---------- */

function migrateEvent(ev) {
  if (ev.revenues && ev.costs) {
    return {
      ...ev,
      revenues: {
        ticket: { budget: ev.revenues.ticket?.budget ?? 0, actual: ev.revenues.ticket?.actual ?? null },
        bar: { budget: ev.revenues.bar?.budget ?? 0, actual: ev.revenues.bar?.actual ?? null },
      },
      costs: Array.isArray(ev.costs) ? ev.costs : [],
      marginMode: ev.marginMode || "percent",
      percLocalePct: ev.percLocalePct ?? 20,
      localeFixed: ev.localeFixed || { budget: null, actual: null },
      flatFee: ev.flatFee || { budget: null, actual: null },
      budgetAttendees: ev.budgetAttendees ?? null,
      actualAttendees: ev.actualAttendees ?? null,
      note: ev.note || "",
    };
  }

  // formato legacy (versioni precedenti della dashboard)
  const rc = ev.revenueCenters || { ticket: 50, bar: 50 };
  const bm = ev.budgetMovimentato || 0;
  const am = ev.actualMovimentato;
  const oldCosts = ev.costCategories || {};
  const costs = Object.keys(OLD_COST_LABELS)
    .filter((k) => oldCosts[k])
    .map((k) => ({ id: uid(), label: OLD_COST_LABELS[k], budget: oldCosts[k].budget || 0, actual: oldCosts[k].actual ?? null }));

  return {
    id: ev.id || uid(),
    month: ev.month,
    name: ev.name || "Evento",
    type: ev.type || "altro",
    revenues: {
      ticket: { budget: Math.round(bm * (rc.ticket ?? 50) / 100), actual: am != null ? Math.round(am * (rc.ticket ?? 50) / 100) : null },
      bar: { budget: Math.round(bm * (rc.bar ?? 50) / 100), actual: am != null ? Math.round(am * (rc.bar ?? 50) / 100) : null },
    },
    costs,
    marginMode: (ev.fixedMargin !== null && ev.fixedMargin !== undefined) ? "flatFee" : "percent",
    percLocalePct: ev.percLocalePct ?? 20,
    localeFixed: { budget: null, actual: null },
    flatFee: { budget: ev.fixedMargin ?? null, actual: ev.actualMargine ?? null },
    budgetAttendees: ev.budgetAttendees ?? null,
    actualAttendees: ev.actualAttendees ?? null,
    note: ev.note || "",
  };
}

/* ---------- storage (Supabase — dati condivisi tra tutti i dispositivi) ---------- */

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

async function loadState() {
  const { data, error } = await supabase
    .from(STATE_TABLE)
    .select("events, settings")
    .eq("id", STATE_ROW_ID)
    .single();
  if (error) throw error;
  const settings = data.settings && Object.keys(data.settings).length ? data.settings : defaultSettings();
  return {
    events: Array.isArray(data.events) ? data.events.map(migrateEvent) : defaultEvents(),
    settings: {
      ...settings,
      defaultCostLabels: Array.isArray(settings.defaultCostLabels) && settings.defaultCostLabels.length
        ? settings.defaultCostLabels
        : [...DEFAULT_COST_LABELS],
    },
  };
}

async function persistEvents(events) {
  await supabase.from(STATE_TABLE).update({ events, updated_at: new Date().toISOString() }).eq("id", STATE_ROW_ID);
}
async function persistSettings(settings) {
  await supabase.from(STATE_TABLE).update({ settings, updated_at: new Date().toISOString() }).eq("id", STATE_ROW_ID);
}

const saveEvents = debounce(persistEvents, 500);
const saveSettings = debounce(persistSettings, 500);

/* ---------- atomi UI ---------- */

function NumberField({ value, onChange, placeholder, prefix, small }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState("");
  const isCurrency = prefix === "€";

  const displayValue = () => {
    if (focused) return raw;
    if (value === null || value === undefined || Number.isNaN(value)) return "";
    return isCurrency ? new Intl.NumberFormat("it-IT").format(value) : String(value);
  };

  return (
    <div className={"numfield" + (small ? " numfield-small" : "")}>
      <input
        type="text"
        inputMode="numeric"
        value={displayValue()}
        placeholder={placeholder || "—"}
        onFocus={() => { setFocused(true); setRaw(value === null || value === undefined ? "" : String(value)); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^\d]/g, "");
          setRaw(cleaned);
          onChange(cleaned === "" ? null : Number(cleaned));
        }}
      />
      {prefix && <span className="numfield-suffix">{prefix}</span>}
      <style>{`
        .numfield { display:inline-flex; align-items:baseline; gap:2px; width: 84px; max-width:100%; }
        .numfield-small { width: 60px; }
        .numfield-suffix { color: var(--text-muted); font-size: 0.8em; font-family:'Space Grotesk',sans-serif; flex-shrink:0; }
        .numfield input {
          background: transparent; border: none; border-bottom: 1px dashed rgba(245,239,230,0.25);
          color: var(--text); font-family: 'Space Grotesk', sans-serif; font-variant-numeric: tabular-nums;
          font-size: 16px; padding: 2px 2px; outline: none; text-align:right;
          width: 100%; min-width: 0; flex: 1 1 auto;
        }
        .numfield input:focus { border-bottom: 1px solid var(--coral); }
        .numfield input::placeholder { color: rgba(184,169,201,0.5); font-size: 13px; }
      `}</style>
    </div>
  );
}

function VarianceBadge({ budget, actual }) {
  if (actual === null || actual === undefined) return <span className="var-badge var-empty">in attesa</span>;
  const diff = actual - budget;
  const pct = budget ? (diff / budget) * 100 : 0;
  const positive = diff >= 0;
  return (
    <span className={"var-badge " + (positive ? "var-pos" : "var-neg")}>
      {positive ? "▲" : "▼"} {formatEuro(Math.abs(diff))} ({pct >= 0 ? "+" : ""}{pct.toFixed(0)}%)
      <style>{`
        .var-badge { font-family:'Space Grotesk',sans-serif; font-size:0.72rem; padding:3px 8px; border-radius:20px; font-weight:600; letter-spacing:0.02em; white-space:nowrap; }
        .var-pos { background: rgba(127,188,140,0.15); color:#9FDaAB; }
        .var-neg { background: rgba(225,99,122,0.15); color:#F0899D; }
        .var-empty { background: rgba(184,169,201,0.12); color: var(--text-muted); font-weight:500; }
      `}</style>
    </span>
  );
}

function Slider({ label, value, onChange, min = 0, max = 100, step = 1, format, accent = "var(--coral)" }) {
  const v = value ?? min;
  const pct = ((v - min) / (max - min)) * 100;
  return (
    <div className="fader">
      <div className="fader-top">
        <span className="fader-label">{label}</span>
        <span className="fader-value" style={{ color: accent }}>{format ? format(v) : v}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        className="fader-input"
        style={{ "--fill": pct + "%", "--accent": accent }}
      />
      <style>{`
        .fader { margin-bottom: 16px; }
        .fader-top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px; }
        .fader-label { font-family:'Space Grotesk',sans-serif; font-size:0.75rem; color: var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; }
        .fader-value { font-family:'Fraunces',serif; font-size:1rem; font-weight:600; font-variant-numeric: tabular-nums; }
        .fader-input { -webkit-appearance:none; appearance:none; width:100%; height:24px; background:transparent; cursor:grab; margin:0; }
        .fader-input:active { cursor:grabbing; }
        .fader-input::-webkit-slider-runnable-track {
          height:6px; border-radius:4px;
          background: linear-gradient(to right, var(--accent) 0%, var(--accent) var(--fill), rgba(245,239,230,0.1) var(--fill), rgba(245,239,230,0.1) 100%);
        }
        .fader-input::-webkit-slider-thumb {
          -webkit-appearance:none; width:14px; height:22px; margin-top:-8px; border-radius:4px;
          background: var(--text); border: 2px solid var(--accent);
        }
        .fader-input::-moz-range-track { height:6px; border-radius:4px; background: rgba(245,239,230,0.1); }
        .fader-input::-moz-range-progress { height:6px; border-radius:4px; background: var(--accent); }
        .fader-input::-moz-range-thumb { width:12px; height:22px; border-radius:4px; background: var(--text); border: 2px solid var(--accent); }
      `}</style>
    </div>
  );
}

/* ---------- pannello riepilogativo in alto ---------- */

function ScaleBar({ rowLabel, value, pct, color, minPct, objPct }) {
  return (
    <div className="kbar-row">
      <div className="kbar-row-top">
        <span className="kbar-row-label">{rowLabel}</span>
        <span className="kbar-row-value" style={{ color }}>{formatEuro(value)}</span>
      </div>
      <div className="kbar-track">
        <span className="kbar-zone kbar-zone-1" style={{ width: minPct + "%" }} />
        <span className="kbar-zone kbar-zone-2" style={{ left: minPct + "%", width: (objPct - minPct) + "%" }} />
        <span className="kbar-zone kbar-zone-3" style={{ left: objPct + "%", width: (100 - objPct) + "%" }} />
        <div className="kbar-fill" style={{ width: pct + "%", background: color }} />
        <span className="kbar-divider" style={{ left: minPct + "%" }} />
        <span className="kbar-divider kbar-divider-obj" style={{ left: objPct + "%" }} />
      </div>
    </div>
  );
}

function ProgressStrip({ label, budgetTotal, actualTotal, target, colorBudget = "var(--gold)", colorActual = "var(--coral)" }) {
  const toPct = (v) => Math.min(100, (v / target.stretch) * 100 || 0);
  const minPct = Math.min(100, (target.min / target.stretch) * 100 || 0);
  const objPct = Math.min(100, (target.obiettivo / target.stretch) * 100 || 0);
  const missing = target.obiettivo - budgetTotal;

  return (
    <div className="progress-strip">
      <div className="ps-label">{label}</div>

      <ScaleBar rowLabel="Budgettizzato (previsto)" value={budgetTotal} pct={toPct(budgetTotal)} color={colorBudget} minPct={minPct} objPct={objPct} />
      <ScaleBar rowLabel="Incassato (effettivo)" value={actualTotal} pct={toPct(actualTotal)} color={colorActual} minPct={minPct} objPct={objPct} />

      <div className="kscale-legend">
        <div className="kscale-legend-item">
          <span className="kscale-dot kscale-dot-1" />
          <span>minimo<br /><b>{formatEuro(target.min)}</b></span>
        </div>
        <div className="kscale-legend-item">
          <span className="kscale-dot kscale-dot-2" />
          <span>obiettivo<br /><b>{formatEuro(target.obiettivo)}</b></span>
        </div>
        <div className="kscale-legend-item">
          <span className="kscale-dot kscale-dot-3" />
          <span>stretch<br /><b>{formatEuro(target.stretch)}</b></span>
        </div>
      </div>

      <div className={"ps-missing" + (missing <= 0 ? " ps-missing-done" : "")}>
        {missing <= 0
          ? `Obiettivo già coperto dal previsto, con ${formatEuro(Math.abs(missing))} di margine`
          : `Mancano ${formatEuro(missing)} di previsto per raggiungere l'obiettivo`}
      </div>

      <style>{`
        .progress-strip { flex:1; min-width:270px; }
        .ps-label { font-family:'Space Grotesk',sans-serif; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; color: var(--text-muted); margin-bottom:14px; }

        .kbar-row { margin-bottom:14px; }
        .kbar-row-top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:5px; }
        .kbar-row-label { font-family:'Space Grotesk',sans-serif; font-size:0.78rem; color: var(--text-muted); font-weight:500; }
        .kbar-row-value { font-family:'Fraunces',serif; font-size:1.1rem; font-weight:600; font-variant-numeric: tabular-nums; }
        .kbar-track { position:relative; height:16px; border-radius:5px; overflow:hidden; background: rgba(245,239,230,0.06); }
        .kbar-zone { position:absolute; top:0; bottom:0; }
        .kbar-zone-1 { left:0; background: rgba(225,99,122,0.16); }
        .kbar-zone-2 { background: rgba(232,184,75,0.16); }
        .kbar-zone-3 { background: rgba(127,188,140,0.2); }
        .kbar-fill { position:absolute; top:3px; bottom:3px; left:0; width:0; border-radius:3px; transition: width 0.6s ease; box-shadow: 0 0 0 1px rgba(28,20,40,0.5); }
        .kbar-divider { position:absolute; top:0; bottom:0; width:1.5px; background: rgba(28,20,40,0.4); }
        .kbar-divider-obj { width:2px; background: rgba(28,20,40,0.65); }

        .kscale-legend { display:flex; justify-content:space-between; margin: 4px 0 14px; }
        .kscale-legend-item { display:flex; align-items:flex-start; gap:6px; font-family:'Space Grotesk',sans-serif; font-size:0.65rem; color: var(--text-muted); line-height:1.4; }
        .kscale-legend-item:last-child { text-align:right; flex-direction:row-reverse; }
        .kscale-legend-item b { display:block; color: var(--text); font-family:'Fraunces',serif; font-size:0.82rem; font-weight:600; margin-top:1px; }
        .kscale-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; margin-top:2px; }
        .kscale-dot-1 { background: var(--rose); }
        .kscale-dot-2 { background: var(--gold); }
        .kscale-dot-3 { background: var(--sage); }

        .ps-missing { margin-top:6px; font-family:'Space Grotesk',sans-serif; font-size:0.8rem; font-weight:600; color: #F0C879; background: rgba(232,184,75,0.1); border-radius:8px; padding:9px 12px; }
        .ps-missing-done { color: #9FDaAB; background: rgba(127,188,140,0.12); }
      `}</style>
    </div>
  );
}

/* ---------- cella evento (griglia mensile) ---------- */

function EventTile({ ev, onOpen }) {
  const bRev = revenueTotal(ev, "budget");
  const aRev = revenueTotal(ev, "actual");
  const bMargin = computeMargin(ev, "budget");
  const started = bRev > 0 || costsTotal(ev, "budget") > 0 || (ev.marginMode === "flatFee" && ev.flatFee.budget);

  return (
    <button className="tile" onClick={onOpen}>
      <span className="tile-icon">{EVENT_TYPES[ev.type]?.icon || "○"}</span>
      <span className="tile-name">{ev.name}</span>
      <span className="tile-type">{EVENT_TYPES[ev.type]?.label}</span>
      {started ? (
        <div className="tile-stats">
          <span className="tile-margin">{formatEuro(bMargin)}</span>
          <VarianceBadge budget={bRev} actual={aRev} />
        </div>
      ) : (
        <span className="tile-empty">da definire</span>
      )}
      <style>{`
        .tile {
          background: var(--surface); border: 1px solid rgba(245,239,230,0.08); border-radius: 14px;
          padding: 16px 14px; text-align:left; cursor:pointer; display:flex; flex-direction:column; gap:4px;
          min-height:118px; font-family:inherit; color:inherit;
        }
        .tile:hover { border-color: rgba(245,239,230,0.2); }
        .tile-icon { font-size:1.2rem; color: var(--gold); }
        .tile-name { font-family:'Fraunces',serif; font-size:1rem; font-weight:600; color: var(--text); margin-top:4px; }
        .tile-type { font-family:'Space Grotesk',sans-serif; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.06em; color: var(--text-muted); }
        .tile-stats { margin-top:auto; padding-top:10px; display:flex; flex-direction:column; gap:6px; align-items:flex-start; }
        .tile-margin { font-family:'Fraunces',serif; font-size:1.05rem; font-weight:600; color: var(--gold); }
        .tile-empty { margin-top:auto; padding-top:10px; font-family:'Space Grotesk',sans-serif; font-size:0.72rem; color: var(--text-muted); font-style:italic; }
      `}</style>
    </button>
  );
}

/* ---------- vista di gestione evento ---------- */

function EventDetail({ ev, onChange, onDelete, onBack }) {
  const patch = (fields) => onChange({ ...ev, ...fields });
  const patchRevenue = (key, field, val) => onChange({ ...ev, revenues: { ...ev.revenues, [key]: { ...ev.revenues[key], [field]: val } } });
  const patchCostValue = (id, field, val) => onChange({ ...ev, costs: ev.costs.map((c) => (c.id === id ? { ...c, [field]: val } : c)) });
  const patchCostLabel = (id, label) => onChange({ ...ev, costs: ev.costs.map((c) => (c.id === id ? { ...c, label } : c)) });
  const addCost = () => onChange({ ...ev, costs: [...ev.costs, { id: uid(), label: "Nuova voce", budget: 0, actual: null }] });
  const removeCost = (id) => onChange({ ...ev, costs: ev.costs.filter((c) => c.id !== id) });

  const revBudget = revenueTotal(ev, "budget");
  const revActual = revenueTotal(ev, "actual");
  const costBudget = costsTotal(ev, "budget");
  const costActual = costsTotal(ev, "actual");
  const l1Budget = levelOne(ev, "budget");
  const l1Actual = levelOne(ev, "actual");
  const marginBudget = computeMargin(ev, "budget");
  const marginActual = computeMargin(ev, "actual");
  const quotaBudget = localeAmount(ev, "budget");
  const quotaActual = localeAmount(ev, "actual");
  const beBudget = breakEvenValue(ev, "budget");
  const beActual = breakEvenValue(ev, "actual");

  const ticketShareBudget = revBudget ? Math.round((ev.revenues.ticket.budget || 0) / revBudget * 100) : null;
  const ticketShareActual = revActual ? Math.round((ev.revenues.ticket.actual || 0) / revActual * 100) : null;
  const barShareBudget = revBudget ? Math.round((ev.revenues.bar.budget || 0) / revBudget * 100) : null;
  const barShareActual = revActual ? Math.round((ev.revenues.bar.actual || 0) / revActual * 100) : null;

  const ricavoPersonaBudget = ev.budgetAttendees ? Math.round(revBudget / ev.budgetAttendees) : null;
  const ricavoPersonaActual = (revActual !== null && ev.actualAttendees) ? Math.round(revActual / ev.actualAttendees) : null;
  const marginPerPersonaBudget = ev.budgetAttendees ? Math.round(marginBudget / ev.budgetAttendees) : null;
  const marginPerPersonaActual = (marginActual !== null && ev.actualAttendees) ? Math.round(marginActual / ev.actualAttendees) : null;

  return (
    <div className="event-detail">
      <div className="detail-topbar">
        <button className="back-btn" onClick={onBack}>← Calendario</button>
        <VarianceBadge budget={revBudget} actual={revActual} />
      </div>

      <input className="detail-name-input" value={ev.name} onChange={(e) => patch({ name: e.target.value })} />
      <select className="type-select" value={ev.type} onChange={(e) => patch({ type: e.target.value })}>
        {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>

      <div className="table-block">
        <div className="table-title">Ricavi</div>
        <div className="data-table">
          <div className="dt-row-3 dt-head"><span></span><span className="dt-head-col">Previsto</span><span className="dt-head-col">Effettivo</span></div>
          {REVENUE_LINES.map((rl) => (
            <div className="dt-row-3 dt-row" key={rl.key}>
              <span className="dt-label"><span className="dt-dot" style={{ background: rl.color }} />{rl.label}</span>
              <span className="dt-cell"><NumberField value={ev.revenues[rl.key].budget} onChange={(v) => patchRevenue(rl.key, "budget", v)} prefix="€" /></span>
              <span className="dt-cell"><NumberField value={ev.revenues[rl.key].actual} onChange={(v) => patchRevenue(rl.key, "actual", v)} prefix="€" /></span>
            </div>
          ))}
          <div className="dt-row-3 dt-row dt-total">
            <span className="dt-label">Movimentato</span>
            <span className="dt-value">{formatEuro(revBudget)}</span>
            <span className="dt-value">{revActual !== null ? formatEuro(revActual) : "—"}</span>
          </div>
        </div>
      </div>

      <div className="table-block">
        <div className="table-title">Costi<span className="rc-sub">voci libere, personalizzale per questo evento</span></div>
        <div className="data-table">
          <div className="dt-row-4 dt-head"><span></span><span className="dt-head-col">Previsto</span><span className="dt-head-col">Effettivo</span><span></span></div>
          {ev.costs.map((c) => (
            <div className="dt-row-4 dt-row dt-row-editable" key={c.id}>
              <input className="dt-label-input" value={c.label} onChange={(e) => patchCostLabel(c.id, e.target.value)} />
              <span className="dt-cell"><NumberField value={c.budget} onChange={(v) => patchCostValue(c.id, "budget", v)} prefix="€" /></span>
              <span className="dt-cell"><NumberField value={c.actual} onChange={(v) => patchCostValue(c.id, "actual", v)} prefix="€" /></span>
              <button className="dt-remove" onClick={() => removeCost(c.id)} aria-label="Rimuovi voce">×</button>
            </div>
          ))}
          <button className="dt-add" onClick={addCost}>+ Aggiungi voce di costo</button>
          <div className="dt-row-4 dt-row dt-total">
            <span className="dt-label">Totale costi</span>
            <span className="dt-value">{formatEuro(costBudget)}</span>
            <span className="dt-value">{formatEuro(costActual)}</span>
            <span></span>
          </div>
        </div>
      </div>

      <div className="table-block">
        <div className="table-title">Locale e provvigione</div>
        <div className="mode-switch">
          <button className={ev.marginMode === "percent" ? "active" : ""} onClick={() => patch({ marginMode: "percent" })}>% sul margine</button>
          <button className={ev.marginMode === "fixedLocale" ? "active" : ""} onClick={() => patch({ marginMode: "fixedLocale" })}>Fisso al locale</button>
          <button className={ev.marginMode === "flatFee" ? "active" : ""} onClick={() => patch({ marginMode: "flatFee" })}>Provvigione fissa</button>
        </div>

        {ev.marginMode !== "flatFee" && (
          <>
            <div className="level-row level-row-1">
              <span className="level-row-label">Margine Livello 1 <em>(ricavi − altri costi)</em></span>
              <div className="level-row-values">
                <span className={l1Budget < 0 ? "level-neg" : ""}>{formatEuro(l1Budget)}</span>
                <span className={l1Actual !== null && l1Actual < 0 ? "level-neg" : ""}>{l1Actual !== null ? formatEuro(l1Actual) : "—"}</span>
              </div>
            </div>

            {ev.marginMode === "percent" ? (
              <div className="perc-locale-block">
                <Slider
                  label="% Locale pattuita — applicata per ultima"
                  value={ev.percLocalePct}
                  onChange={(v) => patch({ percLocalePct: v })}
                  min={0} max={100} step={1}
                  format={(v) => v + "%"} accent="var(--gold)"
                />
              </div>
            ) : (
              <div className="dt-row-3 dt-row dt-row-inline">
                <span className="dt-label">Importo fisso al locale</span>
                <span className="dt-cell"><NumberField value={ev.localeFixed.budget} onChange={(v) => patch({ localeFixed: { ...ev.localeFixed, budget: v } })} prefix="€" /></span>
                <span className="dt-cell"><NumberField value={ev.localeFixed.actual} onChange={(v) => patch({ localeFixed: { ...ev.localeFixed, actual: v } })} prefix="€" /></span>
              </div>
            )}

            <div className="level-row">
              <span className="level-row-label">Quota locale <em>(calcolata)</em></span>
              <div className="level-row-values">
                <span>{formatEuro(quotaBudget)}</span>
                <span>{quotaActual !== null ? formatEuro(quotaActual) : "—"}</span>
              </div>
            </div>

            <div className="level-row level-row-final">
              <span className="level-row-label">Provvigione finale <em>(Livello 2, post-locale)</em></span>
              <div className="level-row-values">
                <span className="level-final-value">{formatEuro(marginBudget)}</span>
                <span className="level-final-value level-final-actual">{marginActual !== null ? formatEuro(marginActual) : "—"}</span>
              </div>
            </div>

            <div className={"breakeven-callout" + (l1Budget < 0 ? " breakeven-callout-warn" : "")}>
              <span className="breakeven-callout-title">Punto di pareggio</span>
              Devi movimentare almeno <b>{formatEuro(beBudget)}</b> per andare in pareggio.
              {revActual !== null && <div className="breakeven-callout-actual">Pareggio reale: {formatEuro(beActual)}</div>}
            </div>
          </>
        )}

        {ev.marginMode === "flatFee" && (
          <div className="dt-row-3 dt-row dt-row-inline">
            <span className="dt-label">Provvigione fissa</span>
            <span className="dt-cell"><NumberField value={ev.flatFee.budget} onChange={(v) => patch({ flatFee: { ...ev.flatFee, budget: v } })} prefix="€" /></span>
            <span className="dt-cell"><NumberField value={ev.flatFee.actual} onChange={(v) => patch({ flatFee: { ...ev.flatFee, actual: v } })} prefix="€" /></span>
          </div>
        )}
      </div>

      <div className="table-block">
        <div className="table-title">KPI</div>
        <div className="dt-row-3 dt-head"><span></span><span className="dt-head-col">Previsto</span><span className="dt-head-col">Effettivo</span></div>
        <div className="dt-row-3 dt-row dt-row-inline">
          <span className="dt-label">Partecipanti</span>
          <span className="dt-cell"><NumberField value={ev.budgetAttendees} onChange={(v) => patch({ budgetAttendees: v })} placeholder="—" small /></span>
          <span className="dt-cell"><NumberField value={ev.actualAttendees} onChange={(v) => patch({ actualAttendees: v })} placeholder="—" small /></span>
        </div>
        <div className="dt-row-3 dt-row">
          <span className="dt-label">Movimentato / persona</span>
          <span className="dt-value">{ricavoPersonaBudget !== null ? formatEuro(ricavoPersonaBudget) : "—"}</span>
          <span className="dt-value">{ricavoPersonaActual !== null ? formatEuro(ricavoPersonaActual) : "—"}</span>
        </div>
        <div className="dt-row-3 dt-row">
          <span className="dt-label">Provvigione / persona</span>
          <span className="dt-value">{marginPerPersonaBudget !== null ? formatEuro(marginPerPersonaBudget) : "—"}</span>
          <span className="dt-value">{marginPerPersonaActual !== null ? formatEuro(marginPerPersonaActual) : "—"}</span>
        </div>
        <div className="dt-row-3 dt-row">
          <span className="dt-label">Quota Ingressi</span>
          <span className="dt-value">{ticketShareBudget !== null ? ticketShareBudget + "%" : "—"}</span>
          <span className="dt-value">{ticketShareActual !== null ? ticketShareActual + "%" : "—"}</span>
        </div>
        <div className="dt-row-3 dt-row">
          <span className="dt-label">Quota Beverage</span>
          <span className="dt-value">{barShareBudget !== null ? barShareBudget + "%" : "—"}</span>
          <span className="dt-value">{barShareActual !== null ? barShareActual + "%" : "—"}</span>
        </div>
      </div>

      <div className="detail-row">
        <label>Note</label>
        <textarea className="text-input" rows={2} value={ev.note} onChange={(e) => patch({ note: e.target.value })} />
      </div>

      <button className="delete-btn" onClick={onDelete}>Elimina evento</button>

      <style>{`
        .event-detail { max-width:880px; margin:0 auto; padding-bottom:40px; }
        .detail-topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; }
        .back-btn { background: var(--surface); border:1px solid rgba(245,239,230,0.1); color: var(--text); font-family:'Space Grotesk',sans-serif; font-size:0.82rem; padding:9px 14px; border-radius:10px; cursor:pointer; }
        .back-btn:hover { border-color: rgba(245,239,230,0.25); }
        .detail-name-input {
          width:100%; background:transparent; border:none; border-bottom: 1px solid rgba(245,239,230,0.15);
          font-family:'Fraunces',serif; font-size:1.6rem; font-weight:700; color: var(--text); padding: 4px 0 10px; margin-bottom:10px; outline:none;
        }
        .detail-name-input:focus { border-bottom-color: var(--coral); }
        .type-select {
          background: var(--surface); border:1px solid rgba(245,239,230,0.12); border-radius:8px; color: var(--text);
          font-family:'Space Grotesk',sans-serif; font-size:16px; padding:8px 10px; margin-bottom:24px; outline:none;
        }

        .table-block { background: var(--surface); border-radius:16px; padding:18px; margin-bottom:18px; }
        .table-title { font-family:'Fraunces',serif; font-size:1.05rem; font-weight:600; color: var(--text); margin-bottom:14px; }
        .rc-sub { display:block; font-family:'Space Grotesk',sans-serif; font-size:0.7rem; font-weight:400; color: var(--text-muted); font-style:italic; margin-top:2px; }

        .data-table { width:100%; }
        .dt-row-3 { display:grid; grid-template-columns: 1fr 76px 76px; align-items:center; column-gap:10px; }
        .dt-row-4 { display:grid; grid-template-columns: 1fr 76px 76px 22px; align-items:center; column-gap:10px; }
        .dt-head { padding-bottom:8px; }
        .dt-head-col { font-family:'Space Grotesk',sans-serif; font-size:0.66rem; text-transform:uppercase; letter-spacing:0.06em; color: var(--text-muted); text-align:right; }
        .dt-row { padding:7px 0; border-bottom: 1px solid rgba(245,239,230,0.06); }
        .dt-cell { text-align:right; min-width:0; }
        .dt-cell .numfield { width:100%; justify-content:flex-end; }
        .dt-row-inline { border-bottom:none; padding:10px 0; }
        .dt-label { font-family:'Space Grotesk',sans-serif; font-size:0.85rem; color: var(--text); display:flex; align-items:center; gap:8px; min-width:0; }
        .dt-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
        .dt-label-input {
          width:100%; background:transparent; border:none; border-bottom: 1px dashed rgba(245,239,230,0.2);
          font-family:'Space Grotesk',sans-serif; font-size:16px; color: var(--text); padding:2px 0; outline:none; min-width:0;
        }
        .dt-label-input:focus { border-bottom-color: var(--coral); }
        .dt-remove { background:transparent; border:none; color: var(--text-muted); font-size:1.1rem; cursor:pointer; line-height:1; padding:0; text-align:center; }
        .dt-remove:hover { color: #F0899D; }
        .dt-add { background:transparent; border: 1px dashed rgba(245,239,230,0.25); color: var(--text-muted); font-family:'Space Grotesk',sans-serif; font-size:0.78rem; padding:9px; border-radius:8px; width:100%; cursor:pointer; margin:6px 0 4px; }
        .dt-add:hover { border-color: var(--coral); color: var(--coral); }
        .dt-total { border-bottom:none; border-top: 1px dashed rgba(245,239,230,0.15); margin-top:4px; padding-top:10px; }
        .dt-total .dt-label { font-weight:600; }
        .dt-value { text-align:right; font-family:'Fraunces',serif; font-size:0.95rem; font-weight:600; color: var(--text); }


        .mode-switch { display:flex; gap:6px; margin-bottom:16px; flex-wrap:wrap; }
        .mode-switch button {
          flex:1; min-width:110px; background: rgba(245,239,230,0.04); border:1px solid rgba(245,239,230,0.1); color: var(--text-muted);
          font-family:'Space Grotesk',sans-serif; font-size:0.76rem; padding:9px 8px; border-radius:8px; cursor:pointer;
        }
        .mode-switch button.active { background: rgba(232,184,75,0.15); border-color: rgba(232,184,75,0.4); color: var(--gold); font-weight:600; }

        .level-row { display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom: 1px solid rgba(245,239,230,0.06); gap:10px; }
        .level-row-1 { margin-top:4px; }
        .level-row-label { font-family:'Space Grotesk',sans-serif; font-size:0.78rem; color: var(--text-muted); flex:1; }
        .level-row-label em { font-style:normal; display:block; font-size:0.68rem; opacity:0.8; margin-top:1px; }
        .level-row-values { display:flex; gap:16px; font-family:'Space Grotesk',sans-serif; font-size:0.85rem; color: var(--text); }
        .level-row-values span { width:76px; flex-shrink:0; text-align:right; }
        .level-neg { color: var(--rose); font-weight:600; }
        .level-row-final { border-bottom:none; border-top: 1px dashed rgba(245,239,230,0.15); padding-top:12px; margin-top:2px; }
        .level-final-value { font-family:'Fraunces',serif !important; font-size:1rem !important; font-weight:600; color: var(--gold); }
        .level-final-actual { color: var(--coral) !important; }
        .perc-locale-block { background: rgba(232,184,75,0.06); border-radius:10px; padding:12px 14px 2px; margin: 10px 0; }

        .breakeven-callout { margin-top:14px; font-family:'Space Grotesk',sans-serif; font-size:0.8rem; line-height:1.5; color: var(--text-muted); background: rgba(127,188,140,0.1); border-radius:10px; padding:12px 14px; }
        .breakeven-callout b { color: var(--sage); font-family:'Fraunces',serif; font-weight:600; }
        .breakeven-callout-title { display:block; font-family:'Space Grotesk',sans-serif; font-size:0.68rem; text-transform:uppercase; letter-spacing:0.06em; color: var(--sage); font-weight:600; margin-bottom:5px; }
        .breakeven-callout-warn { background: rgba(225,99,122,0.1); }
        .breakeven-callout-warn b { color: #F0899D; }
        .breakeven-callout-warn .breakeven-callout-title { color: #F0899D; }
        .breakeven-callout-actual { margin-top:6px; font-size:0.74rem; opacity:0.85; }


        .detail-row { display:flex; flex-direction:column; gap:5px; margin-bottom:16px; }
        .detail-row label { font-family:'Space Grotesk',sans-serif; font-size:0.7rem; text-transform:uppercase; letter-spacing:0.06em; color: var(--text-muted); }
        .text-input {
          background: rgba(245,239,230,0.05); border: 1px solid rgba(245,239,230,0.12); border-radius:8px;
          color: var(--text); font-family:'Space Grotesk',sans-serif; font-size:16px; padding: 8px 10px; outline:none;
        }
        .text-input:focus { border-color: var(--coral); }
        .delete-btn {
          background: transparent; border: 1px solid rgba(225,99,122,0.35); color: #F0899D;
          font-family:'Space Grotesk',sans-serif; font-size:0.78rem; padding:10px 16px; border-radius:8px; cursor:pointer; width:100%;
        }
        .delete-btn:hover { background: rgba(225,99,122,0.1); }
      `}</style>
    </div>
  );
}

/* ---------- pannello impostazioni target ---------- */

function SettingsPanel({ settings, events, onChange, onImportData, onClose }) {
  const patch = (metric, key, val) => onChange({ ...settings, [metric]: { ...settings[metric], [key]: val } });
  const fileInputRef = useRef(null);
  const [importMsg, setImportMsg] = useState(null);

  const costLabels = settings.defaultCostLabels || [];
  const patchCostLabel = (idx, label) => onChange({ ...settings, defaultCostLabels: costLabels.map((l, i) => (i === idx ? label : l)) });
  const addCostLabel = () => onChange({ ...settings, defaultCostLabels: [...costLabels, "Nuova categoria"] });
  const removeCostLabel = (idx) => onChange({ ...settings, defaultCostLabels: costLabels.filter((_, i) => i !== idx) });

  const handleExport = () => {
    const payload = { exportedAt: new Date().toISOString(), events, settings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fiver-plan-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!Array.isArray(data.events)) throw new Error("formato non valido");
        onImportData(data.events, data.settings || settings);
        setImportMsg({ type: "ok", text: `Ripristinati ${data.events.length} eventi dal backup del ${data.exportedAt ? new Date(data.exportedAt).toLocaleDateString("it-IT") : "file selezionato"}.` });
      } catch (err) {
        setImportMsg({ type: "error", text: "File non valido — assicurati di selezionare un backup scaricato da qui." });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-title">Target 4 mesi</div>
        {[
          { key: "targetMovimentato", label: "Movimentato" },
          { key: "targetMargine", label: "Provvigioni (margine)" },
        ].map(({ key, label }) => (
          <div className="settings-group" key={key}>
            <div className="settings-group-title">{label}</div>
            <div className="settings-fields">
              <div><label>Minimo</label><NumberField value={settings[key].min} onChange={(v) => patch(key, "min", v)} prefix="€" /></div>
              <div><label>Obiettivo</label><NumberField value={settings[key].obiettivo} onChange={(v) => patch(key, "obiettivo", v)} prefix="€" /></div>
              <div><label>Stretch</label><NumberField value={settings[key].stretch} onChange={(v) => patch(key, "stretch", v)} prefix="€" /></div>
            </div>
          </div>
        ))}

        <div className="settings-group">
          <div className="settings-group-title">Categorie di costo predefinite<span className="cat-sub">applicate ai nuovi eventi — modificabili poi per singolo evento</span></div>
          <div className="cat-list">
            {costLabels.map((label, idx) => (
              <div className="cat-row" key={idx}>
                <input className="cat-input" value={label} onChange={(e) => patchCostLabel(idx, e.target.value)} />
                <button className="cat-remove" onClick={() => removeCostLabel(idx)} aria-label="Rimuovi categoria">×</button>
              </div>
            ))}
          </div>
          <button className="cat-add" onClick={addCostLabel}>+ Aggiungi categoria</button>
        </div>

        <div className="settings-group">
          <div className="settings-group-title">Backup dati</div>
          <div className="backup-row">
            <button className="backup-btn" onClick={handleExport}>⬇ Scarica backup</button>
            <button className="backup-btn" onClick={handleImportClick}>⬆ Ripristina da backup</button>
          </div>
          <div className="backup-hint">Il ripristino sostituisce tutti gli eventi attuali con quelli del file scelto.</div>
          {importMsg && <div className={"backup-msg" + (importMsg.type === "error" ? " backup-msg-error" : "")}>{importMsg.text}</div>}
          <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileChange} style={{ display: "none" }} />
        </div>

        <button className="settings-close" onClick={onClose}>Chiudi</button>
      </div>
      <style>{`
        .settings-overlay { position:fixed; inset:0; background: rgba(0,0,0,0.5); display:flex; align-items:flex-end; justify-content:center; z-index:50; }
        .settings-panel { background: var(--surface); border-radius: 18px 18px 0 0; padding: 22px 20px 26px; width:100%; max-width:480px; max-height:85vh; overflow-y:auto; }
        .settings-title { font-family:'Fraunces',serif; font-size:1.3rem; color: var(--text); font-weight:600; margin-bottom:16px; }
        .settings-group { margin-bottom:18px; }
        .settings-group-title { font-family:'Space Grotesk',sans-serif; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.06em; color: var(--gold); margin-bottom:8px; }
        .settings-fields { display:flex; gap:16px; flex-wrap:wrap; }
        .settings-fields label { display:block; font-family:'Space Grotesk',sans-serif; font-size:0.68rem; color: var(--text-muted); margin-bottom:3px; }
        .cat-sub { display:block; font-family:'Space Grotesk',sans-serif; font-size:0.68rem; font-weight:400; color: var(--text-muted); font-style:italic; margin-top:2px; text-transform:none; letter-spacing:normal; }
        .cat-list { display:flex; flex-direction:column; gap:6px; margin-bottom:8px; }
        .cat-row { display:flex; align-items:center; gap:8px; }
        .cat-input {
          flex:1; min-width:0; background: rgba(245,239,230,0.05); border: 1px solid rgba(245,239,230,0.12); border-radius:8px;
          color: var(--text); font-family:'Space Grotesk',sans-serif; font-size:16px; padding:8px 10px; outline:none;
        }
        .cat-input:focus { border-color: var(--coral); }
        .cat-remove { background:transparent; border:none; color: var(--text-muted); font-size:1.2rem; cursor:pointer; line-height:1; padding:4px 6px; flex-shrink:0; }
        .cat-remove:hover { color: #F0899D; }
        .cat-add { background:transparent; border: 1px dashed rgba(245,239,230,0.25); color: var(--text-muted); font-family:'Space Grotesk',sans-serif; font-size:0.78rem; padding:9px; border-radius:8px; width:100%; cursor:pointer; }
        .cat-add:hover { border-color: var(--coral); color: var(--coral); }
        .settings-close { width:100%; margin-top:10px; background: var(--coral); border:none; color: #1C1428; font-family:'Space Grotesk',sans-serif; font-weight:600; padding:12px; border-radius:10px; cursor:pointer; }
        .backup-row { display:flex; gap:8px; flex-wrap:wrap; }
        .backup-btn { flex:1; min-width:150px; background: rgba(245,239,230,0.05); border:1px solid rgba(245,239,230,0.14); color: var(--text); font-family:'Space Grotesk',sans-serif; font-size:0.82rem; padding:11px 10px; border-radius:9px; cursor:pointer; }
        .backup-btn:hover { border-color: rgba(245,239,230,0.3); }
        .backup-hint { font-family:'Space Grotesk',sans-serif; font-size:0.7rem; color: var(--text-muted); margin-top:8px; line-height:1.4; }
        .backup-msg { margin-top:10px; font-family:'Space Grotesk',sans-serif; font-size:0.78rem; color: var(--sage); background: rgba(127,188,140,0.1); border-radius:8px; padding:9px 12px; line-height:1.4; }
        .backup-msg-error { color: #F0899D; background: rgba(225,99,122,0.1); }
      `}</style>
    </div>
  );
}

/* ---------- vista "Il Piano" (percorso strategico) ---------- */

function PlanView({ onGoToBudget }) {
  return (
    <div className="plan-view">
      <div className="plan-hero">
        <img src={logoFiver} className="plan-hero-logo" alt="Fiver" />
        <div className="plan-hero-title">Il piano di crescita di Fiver</div>
      </div>

      {PLAN_SECTIONS.map((section, si) => (
        <div className={"plan-section" + (section.variant ? " plan-section-" + section.variant : "")} key={si}>
          <div className="plan-section-title">{section.title}</div>
          <div className="plan-points">
            {section.points.map((p, pi) => (
              <div className="plan-point" key={pi}>
                <span className="plan-point-icon">{p.icon}</span>
                <div>
                  <div className="plan-point-title">{p.title}</div>
                  <div className="plan-point-text">{p.text}</div>
                </div>
              </div>
            ))}
          </div>
          {section.cta && (
            <button className="plan-cta" onClick={onGoToBudget}>Vai al Budget →</button>
          )}
          {section.closingSteps && (
            <div className="plan-closing-steps">
              {section.closingSteps.map((step, ci) => (
                <React.Fragment key={ci}>
                  {ci > 0 && <span className="plan-closing-arrow">→</span>}
                  <div className="plan-closing-step">
                    <span className="plan-closing-emoji">{step.emoji}</span>
                    <span className="plan-closing-label">{step.label}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>
      ))}

      <style>{`
        .plan-view { max-width:880px; margin:0 auto; padding-bottom:20px; }
        .plan-hero { text-align:center; padding: 20px 0 36px; }
        .plan-hero-logo { width:72px; height:72px; object-fit:contain; margin-bottom:14px; }
        .plan-hero-title { font-family:'Fraunces',serif; font-size: clamp(1.8rem, 6vw, 2.6rem); font-weight:700; color: var(--text); letter-spacing:-0.01em; line-height:1.15; }

        .plan-section { background: var(--surface); border-radius:16px; padding:20px; margin-bottom:16px; }
        .plan-section-title { font-family:'Fraunces',serif; font-size:1.15rem; font-weight:600; color: var(--text); margin-bottom:16px; }
        .plan-section-warn { background: rgba(225,99,122,0.08); }
        .plan-section-warn .plan-section-title { color: #F0899D; }
        .plan-section-highlight { background: linear-gradient(135deg, rgba(232,184,75,0.14), rgba(255,111,89,0.1)); border: 1px solid rgba(232,184,75,0.25); }

        .plan-points { display:grid; grid-template-columns: 1fr; gap:16px; }
        @media (min-width: 640px) {
          .plan-points { grid-template-columns: 1fr 1fr; }
        }
        .plan-point { display:flex; gap:12px; align-items:flex-start; }
        .plan-point-icon { font-size:1.3rem; color: var(--gold); flex-shrink:0; line-height:1.3; width:1.4em; text-align:center; }
        .plan-section-warn .plan-point-icon { color: #F0899D; }
        .plan-point-title { font-family:'Space Grotesk',sans-serif; font-size:0.9rem; font-weight:700; color: var(--text); margin-bottom:4px; }
        .plan-point-text { font-family:'Space Grotesk',sans-serif; font-size:0.85rem; color: var(--text-muted); line-height:1.5; }

        .plan-cta {
          margin-top:18px; width:100%; background: var(--coral); border:none; color: #1C1428;
          font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:0.95rem; padding:14px; border-radius:10px; cursor:pointer;
        }
        .plan-cta:hover { filter: brightness(1.08); }

        .plan-closing {
          margin-top:18px; text-align:center; font-family:'Fraunces',serif; font-size:1.2rem; font-weight:600;
          color: var(--gold); font-style:italic;
        }

        .plan-closing-steps { margin-top:20px; display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:10px 14px; }
        .plan-closing-step { display:flex; flex-direction:column; align-items:center; gap:6px; min-width:96px; }
        .plan-closing-emoji { font-size:2rem; line-height:1; }
        .plan-closing-label { font-family:'Space Grotesk',sans-serif; font-size:0.82rem; font-weight:700; color: var(--text); text-align:center; }
        .plan-closing-arrow { font-size:1.3rem; color: var(--gold); }
      `}</style>
    </div>
  );
}

/* ---------- App ---------- */

export default function App() {
  const [events, setEvents] = useState(null);
  const [settings, setSettings] = useState(null);
  const [view, setView] = useState("budget");
  const [month, setMonth] = useState("Settembre");
  const [activeEventId, setActiveEventId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    loadState()
      .then(({ events, settings }) => {
        setEvents(events); setSettings(settings); setLoading(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("fiver_plan_state_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: STATE_TABLE, filter: `id=eq.${STATE_ROW_ID}` },
        ({ new: row }) => {
          if (Array.isArray(row.events)) setEvents(row.events.map(migrateEvent));
          if (row.settings) setSettings(row.settings);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeEventId]);

  const updateEvent = useCallback((updated) => {
    setEvents((prev) => {
      const next = prev.map((e) => (e.id === updated.id ? updated : e));
      saveEvents(next);
      return next;
    });
  }, []);

  const deleteEvent = useCallback((id) => {
    setEvents((prev) => {
      const next = prev.filter((e) => e.id !== id);
      saveEvents(next);
      return next;
    });
    setActiveEventId((cur) => (cur === id ? null : cur));
  }, []);

  const addEvent = useCallback((m) => {
    const ne = newEvent(m, settings?.defaultCostLabels);
    setEvents((prev) => {
      const next = [...prev, ne];
      saveEvents(next);
      return next;
    });
    setActiveEventId(ne.id);
  }, [settings]);

  const updateSettings = useCallback((s) => { setSettings(s); saveSettings(s); }, []);

  const importData = useCallback((newEvents, newSettings) => {
    const migrated = newEvents.map(migrateEvent);
    setEvents(migrated);
    setSettings(newSettings);
    saveEvents(migrated);
    saveSettings(newSettings);
    setActiveEventId(null);
  }, []);

  const totals = useMemo(() => {
    if (!events) return null;
    let budgetMov = 0, actualMov = 0, budgetMar = 0, actualMar = 0;
    events.forEach((ev) => {
      budgetMov += revenueTotal(ev, "budget") || 0;
      const am = revenueTotal(ev, "actual");
      if (am !== null) actualMov += am;
      budgetMar += computeMargin(ev, "budget") || 0;
      const mm = computeMargin(ev, "actual");
      if (mm !== null) actualMar += mm;
    });
    return { budgetMov, actualMov, budgetMar, actualMar, totalEvents: events.length };
  }, [events]);

  const rcAggregate = useMemo(() => {
    if (!events) return [];
    let ticket = 0, bar = 0;
    events.forEach((ev) => {
      ticket += ev.revenues.ticket.actual ?? ev.revenues.ticket.budget ?? 0;
      bar += ev.revenues.bar.actual ?? ev.revenues.bar.budget ?? 0;
    });
    const total = ticket + bar || 1;
    return REVENUE_LINES.map((rl) => {
      const value = rl.key === "ticket" ? ticket : bar;
      return { ...rl, value, pct: Math.round((value / total) * 100) };
    });
  }, [events]);

  if (loadError) {
    return (
      <div style={{ minHeight: "100vh", background: "#1C1428", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "14px", color: "#F5EFE6", fontFamily: "sans-serif", padding: "20px", textAlign: "center" }}>
        <img src={logoFiver} alt="" style={{ width: 48, height: 48, objectFit: "contain" }} />
        <div>Impossibile caricare i dati condivisi.<br />Controlla la connessione e ricarica la pagina.</div>
      </div>
    );
  }

  if (loading || !events || !settings) {
    return (
      <div style={{ minHeight: "100vh", background: "#1C1428", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "14px", color: "#F5EFE6", fontFamily: "sans-serif" }}>
        <img src={logoFiver} alt="" style={{ width: 48, height: 48, objectFit: "contain" }} />
        Carico Fiver Plan…
      </div>
    );
  }

  const activeEvent = activeEventId ? events.find((e) => e.id === activeEventId) : null;
  const monthEvents = events.filter((e) => e.month === month);

  return (
    <div className="app">
      <style>{`
        ${FONT_IMPORT}
        :root {
          --bg: #1C1428; --surface: #241B33; --surface2: #2E2240;
          --text: #F5EFE6; --text-muted: #B8A9C9;
          --gold: #E8B84B; --coral: #FF6F59; --sage: #7FBC8C; --rose: #E1637A;
        }
        * { box-sizing: border-box; }
        .app { min-height:100vh; background: var(--bg); background-image: radial-gradient(circle at 15% 0%, rgba(232,184,75,0.06), transparent 40%), radial-gradient(circle at 85% 20%, rgba(255,111,89,0.05), transparent 45%); padding: 28px 16px 60px; }
        .view-tabs { max-width:880px; margin: 0 auto 24px; display:flex; gap:8px; background: var(--surface); border-radius:12px; padding:5px; }
        .view-tab {
          flex:1; font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:0.88rem; letter-spacing:0.02em;
          padding: 11px 14px; border-radius:9px; background: transparent; color: var(--text-muted);
          border: none; cursor:pointer;
        }
        .view-tab.active { background: linear-gradient(135deg, rgba(232,184,75,0.22), rgba(255,111,89,0.16)); color: var(--text); }
        .header { max-width: 880px; margin: 0 auto 24px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
        .h-brand { display:flex; align-items:center; gap:14px; }
        .h-logo { width:44px; height:44px; object-fit:contain; flex-shrink:0; }
        .h-title { font-family:'Fraunces',serif; font-size: clamp(1.6rem, 5vw, 2.3rem); font-weight:700; color: var(--text); letter-spacing:-0.01em; }
        .h-sub { font-family:'Space Grotesk',sans-serif; font-size:0.85rem; color: var(--text-muted); margin-top:4px; }
        .gear-btn { background: var(--surface); border:1px solid rgba(245,239,230,0.1); color: var(--text-muted); width:40px; height:40px; border-radius:10px; cursor:pointer; font-size:1.1rem; flex-shrink:0; }
        .gear-btn:hover { color: var(--text); }
        .kpi-strip { max-width:880px; margin: 0 auto 28px; background: var(--surface); border-radius:16px; padding:20px; display:flex; gap:28px; flex-wrap:wrap; }
        .rc-chart { max-width:880px; margin: 0 auto 28px; background: var(--surface); border-radius:16px; padding:20px; }
        .rc-chart-title { font-family:'Space Grotesk',sans-serif; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.08em; color: var(--text-muted); margin-bottom:14px; }
        .rc-bar { display:flex; height:14px; border-radius:8px; overflow:hidden; margin-bottom:14px; }
        .rc-seg { transition: width 0.6s ease; }
        .rc-chips { display:flex; gap:14px; flex-wrap:wrap; }
        .rc-chip { display:flex; align-items:center; gap:6px; font-family:'Space Grotesk',sans-serif; font-size:0.78rem; color: var(--text-muted); }
        .rc-chip-dot { width:8px; height:8px; border-radius:50%; }
        .rc-chip b { color: var(--text); }
        .month-tabs { max-width:880px; margin: 0 auto 20px; display:flex; gap:8px; overflow-x:auto; padding-bottom:4px; }
        .month-tab {
          font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:0.85rem; letter-spacing:0.03em;
          padding: 10px 18px; border-radius:10px; background: var(--surface); color: var(--text-muted);
          border: 1px solid transparent; cursor:pointer; white-space:nowrap; flex-shrink:0; position:relative;
        }
        .month-tab.active { background: linear-gradient(135deg, rgba(232,184,75,0.18), rgba(255,111,89,0.14)); color: var(--text); border-color: rgba(232,184,75,0.3); }
        .month-count { display:inline-block; margin-left:6px; font-size:0.7rem; color: var(--text-muted); }
        .grid-wrap { max-width:880px; margin: 0 auto; }
        .event-grid { display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; }
        .tile-add {
          background: transparent; border: 1.5px dashed rgba(245,239,230,0.25); border-radius:14px;
          display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px;
          min-height:118px; cursor:pointer; color: var(--text-muted); font-family:'Space Grotesk',sans-serif; font-size:0.8rem;
        }
        .tile-add:hover { border-color: var(--coral); color: var(--coral); }
        .tile-add-icon { font-family:'Fraunces',serif; font-size:1.8rem; line-height:1; }
        .empty-month { text-align:center; padding: 20px 0 16px; color: var(--text-muted); font-family:'Space Grotesk',sans-serif; font-size:0.85rem; }
        @media (max-width: 420px) {
          .event-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      {activeEvent ? (
        <EventDetail
          ev={activeEvent}
          onChange={updateEvent}
          onDelete={() => deleteEvent(activeEvent.id)}
          onBack={() => setActiveEventId(null)}
        />
      ) : (
        <>
          <div className="view-tabs">
            <button className={"view-tab" + (view === "plan" ? " active" : "")} onClick={() => setView("plan")}>Il Piano</button>
            <button className={"view-tab" + (view === "budget" ? " active" : "")} onClick={() => setView("budget")}>Budget 2026</button>
          </div>

          {view === "plan" ? (
            <PlanView onGoToBudget={() => setView("budget")} />
          ) : (
          <>
          <div className="header">
            <div className="h-brand">
              <img src={logoFiver} className="h-logo" alt="" />
              <div>
                <div className="h-title">Fiver Plan</div>
                <div className="h-sub">Settembre – Dicembre 2026 · previsto vs effettivo</div>
              </div>
            </div>
            <button className="gear-btn" onClick={() => setShowSettings(true)} aria-label="Modifica target">⚙</button>
          </div>

          <div className="kpi-strip">
            <ProgressStrip label="Movimentato" budgetTotal={totals.budgetMov} actualTotal={totals.actualMov} target={settings.targetMovimentato} colorBudget="var(--gold)" colorActual="var(--coral)" />
            <ProgressStrip label="Provvigioni" budgetTotal={totals.budgetMar} actualTotal={totals.actualMar} target={settings.targetMargine} colorBudget="var(--gold)" colorActual="var(--sage)" />
          </div>

          <div className="rc-chart">
            <div className="rc-chart-title">Composizione ricavi (tutti gli eventi)</div>
            <div className="rc-bar">
              {rcAggregate.map((rc) => (
                <div key={rc.key} className="rc-seg" style={{ width: rc.pct + "%", background: rc.color }} />
              ))}
            </div>
            <div className="rc-chips">
              {rcAggregate.map((rc) => (
                <div className="rc-chip" key={rc.key}>
                  <span className="rc-chip-dot" style={{ background: rc.color }} />
                  {rc.label} <b>{rc.pct}%</b>
                </div>
              ))}
            </div>
          </div>

          <div className="month-tabs">
            {MONTHS.map((m) => {
              const count = events.filter((e) => e.month === m).length;
              return (
                <button key={m} className={"month-tab" + (m === month ? " active" : "")} onClick={() => setMonth(m)}>
                  {m}<span className="month-count">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="grid-wrap">
            {monthEvents.length === 0 && <div className="empty-month">Nessun evento pianificato per {month} — aggiungine uno.</div>}
            <div className="event-grid">
              {monthEvents.map((ev) => (
                <EventTile key={ev.id} ev={ev} onOpen={() => setActiveEventId(ev.id)} />
              ))}
              <button className="tile-add" onClick={() => addEvent(month)}>
                <span className="tile-add-icon">+</span>
                <span>Nuovo evento</span>
              </button>
            </div>
          </div>
          </>
          )}
        </>
      )}

      {showSettings && <SettingsPanel settings={settings} events={events} onChange={updateSettings} onImportData={importData} onClose={() => setShowSettings(false)} />}
    </div>
  );
}
