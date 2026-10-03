import { layoutPageJoins, quoteListRunOns, pageBreakContinuations, pageHeadFolios, foliosInStep, pipeline } from "@rtm/ingest";

/**
 * How this report is built. Owned by the report: every decision that shaped
 * its text is named here, and the passes it composes are library code, so a
 * fix to a shared pass reaches every report that calls it.
 */
export default pipeline({
  id: "jack-smith-vol1",
  title: "Report of Special Counsel Jack Smith, Volume One: The Election Case",
  authors: "Jack Smith, Special Counsel, U.S. Department of Justice",
  published_at: "January 2025",
  source_url: "https://www.justice.gov/storage/Report-of-Special-Counsel-Smith-Volume-1-January-2025.pdf",
  repo: ".",
  // Order is semantic: footnote numbering and page indices run continuously
  // across volumes, so reordering changes the output.
  volumes: [
    { path: "archive/Report-of-Special-Counsel-Smith-Volume-1-January-2025.pdf", sha256: "d0d26b1ff6fbe96e5280623c6467e70d867c306af768f9dd02556c87892d1e5c" },
  ],
  passes: [
    // A paragraph run over a page break that opens on a capital, a digit or a
    // quotation mark (or follows a full stop on a justified page) joins when the
    // layout says it runs on: no first-line indent, same face (reportsthatmatter-38s.10).
    // A scan: its OCR layer sizes consecutive lines a point apart.
    layoutPageJoins({ scanned: true }),
    // A quotation running over a page arrives as two (reportsthatmatter-38s.9).
    quoteListRunOns(),
    // The scan is skewed: pdftotext insets some pages' first lines, so the
    // rest of a sentence from the page before reads as a block quotation, and
    // a paragraph that fills a whole page left its continuation on the next
    // unjoined (jack-smith-report#1; reportsthatmatter-ca3, -kb4).
    pageBreakContinuations(),
    // The Blanche letter appended after the report numbers its own pages with a running head, "January 6, 2025" over
    // "Page 2": read as the folio, and the head taken off (reportsthatmatter-ssfk).
    pageHeadFolios({ above: /^\s*January 6, 2025\s*$/ }),
    // The contents page's folio, roman "ii", is OCR'd as "11": out of step with the pages round it, so dropped.
    foliosInStep(),
  ],
});
