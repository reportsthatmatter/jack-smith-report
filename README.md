Jack Smith special counsel report

Through 2024, the special counsel prepared a two-volume final report: the first volume about the election obstruction case, and the second volume about the classified documents case.

Only the first volume has been published on Jan 7th 2025.

Archived from https://www.justice.gov/storage/Report-of-Special-Counsel-Smith-Volume-1-January-2025.pdf into `archive` folder

## Rebuilding the text

`full.md` is generated, never hand-edited. `ingest.ts` is the whole recipe —
which PDFs, in what order, with what metadata, and which pipeline passes.

```bash
pnpm install
pnpm exec tsx ../reportsthatmatter/scripts/ingest/cli.ts run jack-smith-vol1
```

Corrections to the text go in `corrections.yaml`, never into `full.md`. Each
must match exactly once or the build fails naming it. `baseline.json` is the
regression digest: if a pipeline change moves this report's output, it fails
until the baseline moves with it after the diff has been read.

The pipeline itself is [`@rtm/ingest`](https://github.com/reportsthatmatter/ingest),
pinned in `package.json` — improvements are adopted here deliberately, with a
diff, rather than arriving unannounced.
