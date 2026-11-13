"use client";

import { AnimatePresence, motion } from "motion/react";

export type BannerSpec = {
  id: number;
  title: string;
  sub?: string;
  /** accent colour for the title */
  tone: string;
  /** letterbox bars + drained colour: reserved for the big moments */
  cinema: boolean;
};

export function Banner({ spec }: { spec: BannerSpec | null }) {
  return (
    <AnimatePresence>
      {spec && (
        <motion.div key={spec.id} className="banner" data-cinema={spec.cinema} initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
          {spec.cinema && (
            <>
              <motion.div className="banner-bar" data-edge="top" initial={{ y: "-100%" }} animate={{ y: 0 }} exit={{ y: "-100%" }} transition={{ duration: 0.28, ease: "easeOut" }} />
              <motion.div className="banner-bar" data-edge="bottom" initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ duration: 0.28, ease: "easeOut" }} />
            </>
          )}
          <div className="banner-text">
            <motion.h2
              initial={{ opacity: 0, scale: 1.5, letterSpacing: "0.5em" }}
              animate={{ opacity: 1, scale: 1, letterSpacing: "0.12em" }}
              transition={{ duration: 0.42, ease: [0.2, 0.9, 0.2, 1] }}
              style={{ color: spec.tone, textShadow: `0 0 42px ${spec.tone}88, 0 4px 26px rgba(0,0,0,.95)` }}
            >
              {spec.title}
            </motion.h2>
            {spec.sub && (
              <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.3 }}>
                {spec.sub}
              </motion.p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
