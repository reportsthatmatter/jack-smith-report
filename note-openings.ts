import type { SourcePass } from "@rtm/ingest";

/**
 * Footnotes whose own number the OCR misread at the page foot, so the note had no number to be collected by and its
 * text was read into the note above it, or into the body (note 129, "119 See ECF No. 252 at 142", PDF p.39, stood as a
 * body paragraph); with no note to link to, the raised marker in the text stayed a bare number too
 * (reportsthatmatter-4yp, -npg3). Each is written as the number the scan prints, checked against the page image and
 * against its neighbours (the note before and after it on the page). Matched by the whole opening of its line; a
 * line not found exactly once throws, so a changed text layer cannot silently misnumber a note.
 */
const OPENINGS: ReadonlyArray<{ pdfIndex: number; from: RegExp; to: string; joinNext?: boolean }> = [
  // Between 70 and 72 (printed p.18).
  { pdfIndex: 26, from: /^11 Id\.\s*$/, to: "71 Id." },
  // After 81 ("81See ECF No. 252 at 65"), before 83 (printed p.20).
  { pdfIndex: 28, from: /^81 See,\s*$/, to: "82 See," },
  // Between 128 and 130 (printed p.31).
  { pdfIndex: 39, from: /^119 See ECF No\. 252 at 142 /, to: "129 See ECF No. 252 at 142 " },
  // Between 209 and 211 (printed p.77): "210" read as "21   °", its text on the line below.
  { pdfIndex: 85, from: /^21\s+°\s*$/, to: "210", joinNext: true },
  // Between 213 and 215 (printed p.78).
  { pdfIndex: 86, from: /^rn SCO-04949418 /, to: "214 SCO-04949418 " },
  // Between 223 and 225 (printed p.79).
  { pdfIndex: 87, from: /^m SCO-12876218 /, to: "224 SCO-12876218 " },
  // The Blanche letter's own note 10, between 9 and 11 (letter p.9).
  { pdfIndex: 167, from: /^1° Compare /, to: "10 Compare " },
  // Between 283 and 285 (printed p.146).
  { pdfIndex: 154, from: /^28 -1 See In re Sealed Case/, to: "284 See In re Sealed Case" },
];

export const noteOpenings: SourcePass = {
  name: "noteOpenings",
  stage: "source",
  run(lines, at) {
    if (at.volume !== 1) return lines;
    let out = lines;
    for (const o of OPENINGS.filter((x) => x.pdfIndex === at.pdfIndex)) {
      const hits = out.flatMap((line, i) => (o.from.test(line) ? [i] : []));
      if (hits.length !== 1) throw new Error(`noteOpenings: ${o.from} found ${hits.length} times on PDF p.${at.pdfIndex}`);
      const i = hits[0];
      const line = out[i].replace(o.from, o.to);
      if (o.joinNext) {
        const next = out.findIndex((l, j) => j > i && l.trim());
        out = [...out.slice(0, i), `${line} ${out[next].trim()}`, ...out.slice(next + 1)];
      } else {
        out = out.map((l, j) => (j === i ? line : l));
      }
    }
    return out;
  },
};
