import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, Sparkles, Shirt, X } from "lucide-react";
import { toast } from "sonner";
import { sellerAPI } from "@store/api";
import { aiImageCost } from "./aiImageCost";

const POLL_MS = 2000;
const GIVE_UP_MS = 3 * 60 * 1000;

const COPY = {
  enhance: {
    title: "Enhance photo",
    blurb: "Makes a clean studio version of this photo: white background, better light, sharper. Your product stays exactly as it is.",
    action: "Enhance (uses 1 image)",
  },
  mannequin: {
    title: "Mannequin shots",
    blurb: "Shows this product on a mannequin from 3 angles. Works best for clothing.",
    action: "Make 3 shots (uses 3 images)",
  },
};

const errorMessage = (e, fallback) => e?.response?.data?.message || e?.message || fallback;

/**
 * Enhance a product photo, or draw it on a mannequin, with the store's AI.
 *
 * `prepareSource()` resolves the photo's server URL (uploading it first if it is
 * still only on the device). `onUse({ replace, urls })` hands back the chosen
 * images: `replace` swaps the source photo for the enhanced one.
 */
export default function AiImageStudioDialog({ kind, sourcePreview, prepareSource, roomLeft, status, onUse, onClose, onUsageChange }) {
  const [style, setStyle] = useState("mannequin");
  const [phase, setPhase] = useState("choose"); // choose | working | results | failed
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(new Set());
  const [error, setError] = useState("");
  const cancelled = useRef(false);

  useEffect(() => () => { cancelled.current = true; }, []);

  if (!kind) return null;
  const copy = COPY[kind];
  const needs = kind === "mannequin" ? status?.mannequinCount || 3 : 1;
  const left = status?.remainingToday;
  const cost = aiImageCost(status, needs);
  const outOfToday = left !== null && left !== undefined && left < needs;
  const outOfImages = outOfToday || cost.blocked;

  const generate = async () => {
    setPhase("working");
    setError("");
    try {
      const imageUrl = await prepareSource();
      const res = await sellerAPI.startAiImageJob({ kind, style: kind === "mannequin" ? style : undefined, imageUrl });
      let job = res?.data?.data?.job;
      onUsageChange?.();
      const startedAt = Date.now();
      while (job?.status === "running") {
        if (cancelled.current) return;
        if (Date.now() - startedAt > GIVE_UP_MS) throw new Error("This is taking too long. Please try again.");
        await new Promise((r) => setTimeout(r, POLL_MS));
        job = (await sellerAPI.getAiImageJob(job.id))?.data?.data?.job;
      }
      if (cancelled.current) return;
      onUsageChange?.();
      if (job?.status !== "done" || !job.results?.length) {
        setError(job?.error || "The images could not be made this time. Please try again.");
        setPhase("failed");
        return;
      }
      setResults(job.results);
      setPicked(new Set(job.results.slice(0, Math.max(roomLeft, 0))));
      setPhase("results");
    } catch (e) {
      if (cancelled.current) return;
      setError(errorMessage(e, "The images could not be made this time. Please try again."));
      setPhase("failed");
    }
  };

  const toggle = (url) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else if (next.size < roomLeft) next.add(url);
      else toast.error(`Only ${roomLeft} more photo${roomLeft === 1 ? "" : "s"} fit on this item`);
      return next;
    });
  };

  const close = () => {
    if (phase === "working" && !window.confirm("The images are still being made. Close anyway? They will still count towards today's limit and this month's bill.")) return;
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={copy.title}
          className="w-full md:max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-t-2xl md:rounded-2xl p-5"
          initial={{ y: 40 }}
          animate={{ y: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              {kind === "enhance" ? <Sparkles className="w-5 h-5 text-violet-600" /> : <Shirt className="w-5 h-5 text-violet-600" />}
              <h2 className="text-lg font-bold text-gray-900">{copy.title}</h2>
            </div>
            <button onClick={close} aria-label="Close" className="p-1 rounded-full hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {(phase === "choose" || phase === "failed") && (
            <>
              <div className="flex gap-3 mb-4">
                <img src={sourcePreview} alt="Your photo" className="w-20 h-24 object-cover rounded-lg border border-gray-200" />
                <p className="text-sm text-gray-600">{copy.blurb}</p>
              </div>

              {kind === "mannequin" && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Style</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(status?.styles || []).map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setStyle(s.key)}
                        className={`px-2 py-2 rounded-lg border text-xs font-semibold ${style === s.key ? "border-violet-600 bg-violet-50 text-violet-700" : "border-gray-200 text-gray-700"}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {phase === "failed" && <p className="mb-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}

              <p className={`text-sm mb-2 rounded-lg px-3 py-2 ${cost.blocked ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-violet-50 text-violet-800"}`}>{cost.text}</p>
              {left !== null && left !== undefined && (
                <p className="text-xs text-gray-500 mb-3">{left} of {status.dailyCap} AI images left today.</p>
              )}

              <button
                onClick={generate}
                disabled={outOfImages}
                className="w-full py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                {cost.blocked ? "Monthly AI image limit reached" : outOfToday ? "Not enough AI images left today" : phase === "failed" ? "Try again" : copy.action}
              </button>
            </>
          )}

          {phase === "working" && (
            <div className="py-10 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-violet-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-800">Making your {kind === "enhance" ? "photo" : "shots"}…</p>
              <p className="text-xs text-gray-500 mt-1">This usually takes 10–40 seconds.</p>
            </div>
          )}

          {phase === "results" && kind === "enhance" && (
            <>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <figure>
                  <img src={sourcePreview} alt="Before" className="w-full aspect-[3/4] object-cover rounded-lg border border-gray-200" />
                  <figcaption className="text-xs text-gray-500 text-center mt-1">Before</figcaption>
                </figure>
                <figure>
                  <img src={results[0]} alt="Enhanced" className="w-full aspect-[3/4] object-cover rounded-lg border border-violet-300" />
                  <figcaption className="text-xs text-gray-500 text-center mt-1">Enhanced</figcaption>
                </figure>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button onClick={() => onUse({ replace: true, urls: [results[0]] })} className="py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold">Use it instead of this photo</button>
                {roomLeft > 0 && (
                  <button onClick={() => onUse({ replace: false, urls: [results[0]] })} className="py-3 rounded-xl border border-gray-300 text-gray-800 text-sm font-semibold">Add as an extra photo</button>
                )}
                <button onClick={onClose} className="py-2 text-sm text-gray-500">Discard</button>
              </div>
            </>
          )}

          {phase === "results" && kind === "mannequin" && (
            <>
              <p className="text-xs text-gray-500 mb-2">Tap the shots to add. {roomLeft} more photo{roomLeft === 1 ? "" : "s"} fit on this item.</p>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {results.map((url) => (
                  <button key={url} onClick={() => toggle(url)} className={`relative rounded-lg overflow-hidden border-2 ${picked.has(url) ? "border-violet-600" : "border-transparent"}`}>
                    <img src={url} alt="Mannequin shot" className="w-full aspect-[3/4] object-cover" />
                    {picked.has(url) && (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={() => onUse({ replace: false, urls: results.filter((u) => picked.has(u)) })}
                disabled={picked.size === 0}
                className="w-full py-3 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-50"
              >
                Add {picked.size} photo{picked.size === 1 ? "" : "s"}
              </button>
              <button onClick={onClose} className="w-full py-2 mt-1 text-sm text-gray-500">Discard all</button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
