"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ClientState } from "@/lib/ludo/types";
import { PALETTE } from "@/lib/ludo/render";

const QUICK = ["Good luck ❤️", "Nooo 😭", "Your turn!", "That was rude 😤", "Nice one 👏", "One more?"];

export function Chat({
  state,
  onSend,
}: {
  state: ClientState;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.chat.length]);

  const submit = (value: string) => {
    const t = value.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };

  return (
    <div className="panel" style={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <div style={{ padding: "12px 14px 8px" }}>
        <span className="eyebrow">Table talk</span>
      </div>

      <div
        ref={listRef}
        className="scroll-thin"
        style={{ flex: 1, minHeight: 120, overflowY: "auto", padding: "0 14px", display: "flex", flexDirection: "column", gap: 8 }}
      >
        <AnimatePresence initial={false}>
          {state.chat.length === 0 && (
            <p style={{ color: "var(--text-faint)", fontSize: 13, margin: "8px 0" }}>
              Say something. It is a long way between here and there.
            </p>
          )}
          {state.chat.map((m) => {
            const tint = m.color ? PALETTE[m.color] : null;
            return (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                style={{
                  padding: "7px 10px",
                  borderRadius: 10,
                  background: "rgba(0,0,0,.32)",
                  borderLeft: `2px solid ${tint?.base ?? "var(--brass)"}`,
                }}
              >
                <div style={{ fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", color: tint?.light ?? "var(--text-mute)" }}>
                  {m.name}
                </div>
                <div style={{ fontSize: 14, color: "var(--text)", wordBreak: "break-word" }}>{m.text}</div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div style={{ padding: "10px 14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {QUICK.map((q) => (
            <button
              key={q}
              className="btn btn-ghost"
              style={{ padding: "5px 9px", fontSize: 11, borderRadius: 8 }}
              onClick={() => submit(q)}
            >
              {q}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(text);
          }}
          style={{ display: "flex", gap: 7 }}
        >
          <input
            className="field"
            value={text}
            maxLength={240}
            placeholder="Message…"
            onChange={(e) => setText(e.target.value)}
            style={{ padding: "9px 12px", fontSize: 14 }}
          />
          <button className="btn" type="submit" disabled={!text.trim()} style={{ padding: "9px 14px" }}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
