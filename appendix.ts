import type { SourcePass } from "@rtm/ingest";

/**
 * The appendix "Key Filings in Significant Litigation" (PDF pp.146-154, printed 138-146) is a run of ruled tables,
 * one per case: ECF or docket number, date, and a description that wraps over two or three lines set either side
 * of the row's number line. Read as prose, each table became paragraphs that cut descriptions in half and fused
 * rows ("Time 15 8/7/2023 Government's Reply ..."), with the wrapped halves set as block quotations
 * (reportsthatmatter-05c; 115 of the report's 145 oversplit paragraphs). The pipeline has no table block, so each
 * row is written as one bulleted line, "ECF No. 12, 8/5/2023: Government's Opposition to Defendant's Motion for
 * Extension of Time", which the parser reads as a list item; a case's caption and the section titles stay as they
 * are.
 *
 * A row's description is centred on its number line: as many wrapped lines above it as below. So the description
 * lines between two number lines split at the point where the row above has as many below as it had above. The
 * column header ("ECF No. Date Document Description") goes into each item; repeated on a continued table's page with
 * its caption, both are dropped there. A page whose table does not parse into rows that use every line throws, so
 * a changed text layer cannot silently drop words.
 */

const FIRST = 146;
const LAST = 154;
/** Pages that continue the table on the page before under a repeat of its caption and header. */
const CONTINUED = new Set([147, 148, 149, 151, 153]);

/**
 * Number cells whose raised note marker the OCR layer set at the cell's size and ran into the number (PDF p.152,
 * the Perry warrant table: "41²⁷⁶" read as "41276"); written as the reference the scan shows. Checked against the
 * page image.
 */
const NUMBER_CELLS: Record<string, string> = {
  "41276": "41[^276]",
  "42 43 277": "42, 43[^277]",
  "44278": "44[^278]",
  "45279": "45[^279]",
  "Sealed 280": "Sealed[^280]",
};

const DATE = /\d{1,2}\/[\d/]{4,9}/;
const HEADER = /^\s*(ECF\s*No\.|Doc\.\s*No\.|Case\s*No\.)\s+(Date|Case)\b/;
const CAPTION = /\((?:D\.D\.C\.|U\.S\.|D\.\s?C\. Cir\.)\)\s*$/;
/** A footnote at the page foot ("268 Oral Argument ...", "28 -1 See ...", note 284 OCR'd), or the folio. */
const BELOW_TABLE = /^\s{0,2}(?:\d{3}\s+\S|28 -1\s|\d{3}\s*$)|^\s{20,}\d{3}\s*$/;

/** A section title set in capitals, centred ("PRESIDENTIAL IMlvfUNITY APPELLATE LITIGATION", OCR and all). */
const title = (l: string) => {
  if (!/^\s{10,}\S/.test(l)) return false;
  const upper = (l.match(/[A-Z]/g) ?? []).length;
  const lower = (l.match(/[a-z]/g) ?? []).length;
  return upper >= 6 && upper > 3 * lower;
};

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

type Cells = { num: string; date: string; desc: string };

/** Splits one line of a table into its number, date and description parts by the header's columns. */
function cells(line: string, dateCol: number, descCol: number): Cells {
  const date = line.match(DATE);
  if (date && date.index! >= dateCol - 6 && date.index! < descCol) {
    const num = line.slice(0, date.index).trim();
    return { num, date: date[0], desc: line.slice(date.index! + date[0].length).trim() };
  }
  // No date: a number-cell fragment ("2038999,", "(Att. 12)") and/or a description line.
  const indent = line.search(/\S/);
  if (indent >= descCol - 4) return { num: "", date: "", desc: line.trim() };
  const m = line.match(/^(\s*\S.*?)(?:\s{3,}(\S.*))?$/)!;
  return { num: m[1].trim(), date: "", desc: (m[2] ?? "").trim() };
}

/** One table's lines (after its header) as bulleted rows; throws if a line is left over. */
function rows(lines: string[], header: string, at: number): string[] {
  const label = /^\s*ECF/.test(header) ? "ECF No." : "Doc. No.";
  const dateCol = header.search(/\bDate\b/);
  const descCol = header.search(/\bDocument\b/);
  const parts = lines.map((l) => cells(l, dateCol, descCol));
  const anchors = parts.flatMap((p, i) => (p.date ? [i] : []));
  if (!anchors.length) throw new Error(`appendixFilings: no dated row on PDF p.${at}`);
  const owner: number[] = parts.map(() => -1);
  anchors.forEach((a) => (owner[a] = a));
  // Description lines either side of each number line, as many below as above.
  let i = 0;
  anchors.forEach((a, k) => {
    const above = a - i;
    for (let j = i; j < a; j++) owner[j] = a;
    const next = k + 1 < anchors.length ? anchors[k + 1] : lines.length;
    const below = Math.min(above, next - a - 1);
    for (let j = a + 1; j <= a + below; j++) owner[j] = a;
    i = a + below + 1;
  });
  if (i < lines.length) throw new Error(`appendixFilings: PDF p.${at} line ${JSON.stringify(lines[i])} belongs to no row`);
  return anchors.map((a) => {
    const mine = parts.filter((_, j) => owner[j] === a);
    let num = squash(mine.map((p) => p.num).filter((n) => n && n !== "'").join(" "));
    num = NUMBER_CELLS[num] ?? num;
    // A word broken at a hyphen over two lines ("Non-" / "Disclosure") is joined without the space.
    const desc = squash(mine.map((p) => p.desc).join(" ")).replace(/(\w-) (?=[A-Z])/g, "$1");
    const date = parts[a].date;
    // "---" in the number column: a filing with no docket number (an oral argument). A word there ("Sealed") stands alone.
    if (!num || num === "---") return `• ${date}: ${desc}`;
    return /^\d/.test(num) ? `• ${label} ${num}, ${date}: ${desc}` : `• ${num}, ${date}: ${desc}`;
  });
}

export const appendixFilings: SourcePass = {
  name: "appendixFilings",
  stage: "source",
  run(lines, at) {
    if (at.volume !== 1 || at.pdfIndex < FIRST || at.pdfIndex > LAST) return lines;
    const out: string[] = [];
    let i = 0;
    let firstCaption = CONTINUED.has(at.pdfIndex);
    while (i < lines.length) {
      const line = lines[i];
      if (firstCaption && CAPTION.test(line)) {
        // The continued table's caption, repeated from the page before.
        firstCaption = false;
        i++;
        continue;
      }
      if (title(line) || CAPTION.test(line)) {
        // A section title or a case's caption, a block of its own: a title ran into the caption under it, and both
        // read as a block quotation. Its second line, "(Partially Unsealed)", is set more deeply indented and read as a
        // quotation of its own: it goes on the caption's line.
        const more = /^\s{10,}\(Partially Unseale/i.test(lines[i + 1] ?? "") ? [lines[i + 1]] : [];
        out.push("", "", [line.trimEnd(), ...more.map((m) => m.trim())].join(" "), "", "");
        i += 1 + more.length;
        continue;
      }
      if (!HEADER.test(line)) {
        out.push(line);
        i++;
        continue;
      }
      // A table: from its header to the next caption, section title, footnote or folio.
      const header = line;
      let end = i + 1;
      while (end < lines.length) {
        const l = lines[end];
        if (!l.trim()) break;
        if (CAPTION.test(l) || HEADER.test(l) || (!DATE.test(l) && BELOW_TABLE.test(l)) || title(l)) break;
        end++;
      }
      const body = lines.slice(i + 1, end);
      const items = /^\s*Case\s*No\./.test(header)
        ? body.map((l) => {
            const [num, name] = l.trim().split(/\s{2,}/);
            if (!name) throw new Error(`appendixFilings: PDF p.${at.pdfIndex} case line ${JSON.stringify(l)} has no name`);
            return `• ${num}: ${name}`;
          })
        : rows(body, header, at.pdfIndex);
      // Two blank lines round each item: the page reads as double-spaced, where one blank is only line spacing
      // (`collapseDoubleSpacing`) and the caption above would run into the first row.
      out.push("", "", ...items.flatMap((item) => [item, "", ""]));
      i = end;
    }
    return out;
  },
};
