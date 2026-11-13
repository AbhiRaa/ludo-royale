"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { FATE_MAX, ROLES, WAGER_MAX } from "@/lib/ludo/types";
import { ROLE_INFO } from "@/lib/ludo/court";
import { FateGem, RoleGlyph } from "./glyphs";

function Sheet({ title, onClose, children, side = "left" }: { title: string; onClose: () => void; children: React.ReactNode; side?: "left" | "right" | "center" }) {
  return (
    <motion.div
      className="sheet panel"
      data-side={side}
      initial={{ opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.98 }}
      transition={{ duration: 0.22 }}
    >
      <div className="sheet-head">
        <span className="eyebrow">{title}</span>
        <button className="sheet-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      {children}
    </motion.div>
  );
}

/** The four characters and the one resource, each in a sentence. */
export function CourtPanel({ royale, onClose }: { royale: boolean; onClose: () => void }) {
  return (
    <Sheet title={royale ? "The Court" : "House rules"} onClose={onClose}>
      {royale ? (
        <>
          <p className="sheet-lede">Your four pawns are not alike. Each one bends a single rule.</p>
          <ul className="court-list">
            {ROLES.map((role) => (
              <li key={role}>
                <span className="court-icon"><RoleGlyph role={role} size={18} /></span>
                <div>
                  <strong>{ROLE_INFO[role].name}</strong> <em>{ROLE_INFO[role].tag}</em>
                  <p>{ROLE_INFO[role].rule}</p>
                </div>
              </li>
            ))}
            <li>
              <span className="court-icon"><FateGem on size={16} /></span>
              <div>
                <strong>Fate</strong> <em>bad luck, banked</em>
                <p>
                  Earn one when a pawn of yours is captured, when a throw cannot be played, or when you land on a
                  star. Spend it after throwing to shift the die up or down by one per gem. You can hold {FATE_MAX}.
                </p>
              </div>
            </li>
          </ul>
          <p className="sheet-foot">Only a six you actually throw earns another throw — a nudged six frees a pawn, nothing more.</p>
        </>
      ) : (
        <ul className="rules-list">
          <li>A six frees a pawn and earns another throw.</li>
          <li>Land on an opponent to send it home, and throw again.</li>
          <li>Starred squares and entry squares are sanctuary.</li>
          <li>Three sixes in a row forfeits the turn.</li>
          <li>An exact count is needed to come home.</li>
        </ul>
      )}
    </Sheet>
  );
}

export function WagerSheet({ current, locked, onSave, onClose }: { current: string | null; locked: boolean; onSave: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState(current ?? "");
  useEffect(() => setText(current ?? ""), [current]);
  return (
    <Sheet title="Your wager" onClose={onClose} side="center">
      <p className="sheet-lede">
        If you win, what do they owe you? It stays sealed — they will see that you wrote something, never what —
        until the game is decided.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(text.trim());
          onClose();
        }}
      >
        <label className="eyebrow" htmlFor="wager-text">If I win, you owe me…</label>
        <textarea
          id="wager-text"
          className="field"
          rows={2}
          maxLength={WAGER_MAX}
          value={text}
          disabled={locked}
          placeholder="a handwritten letter · the next movie pick · breakfast in bed"
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="sheet-actions">
          <span className="mono" style={{ fontSize: 10, color: "var(--text-faint)" }}>{text.length}/{WAGER_MAX}</span>
          {locked ? (
            <span style={{ fontSize: 12, color: "var(--text-mute)" }}>Sealed — a pawn is already home.</span>
          ) : (
            <button className="btn btn-primary" type="submit">{text.trim() ? "Seal it" : "Clear wager"}</button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

export type Prefs = { sound: boolean; music: boolean; film: boolean; flat: boolean };

export function SettingsMenu({ prefs, canFlat, onChange, onResetCamera, onClose }: { prefs: Prefs; canFlat: boolean; onChange: (p: Partial<Prefs>) => void; onResetCamera: () => void; onClose: () => void }) {
  const Row = ({ label, note, value, onToggle }: { label: string; note: string; value: boolean; onToggle: () => void }) => (
    <button className="menu-row" onClick={onToggle} role="switch" aria-checked={value}>
      <span>
        <strong>{label}</strong>
        <small>{note}</small>
      </span>
      <i data-on={value} />
    </button>
  );
  return (
    <Sheet title="Table settings" onClose={onClose} side="right">
      <Row label="Sound" note="Dice, pawns, captures" value={prefs.sound} onToggle={() => onChange({ sound: !prefs.sound })} />
      <Row label="Score" note="Music that follows the game" value={prefs.music} onToggle={() => onChange({ music: !prefs.music })} />
      <Row label="Cinematics" note="Close-ups and slow motion" value={prefs.film} onToggle={() => onChange({ film: !prefs.film })} />
      {canFlat && <Row label="Flat board" note="The classic top-down view" value={prefs.flat} onToggle={() => onChange({ flat: !prefs.flat })} />}
      {!prefs.flat && (
        <button className="btn btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={onResetCamera}>
          Reset camera
        </button>
      )}
      <p className="sheet-foot">Drag to orbit the table. Scroll or pinch to zoom.</p>
    </Sheet>
  );
}
