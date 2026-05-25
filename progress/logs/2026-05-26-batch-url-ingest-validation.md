# 2026-05-26 Batch URL Ingest Validation Log

## Summary

This round focused on end-to-end ingest validation rather than more lint work.
The selected direction was batch URL ingest for WeChat article links.

## What was completed

### 1. Batch URL ingest workflow shipped

Files involved:
- `src/core/ingest/types.ts`
- `src/core/ingest/pipeline.ts`
- `src/main/index.ts`
- `src/main/preload.ts`
- `src/main/preload.js`
- `src/renderer/pages/IngestPage.jsx`

Implemented behavior:
- accept a URL list
- process sequentially
- random delay between items
- retry on failure
- skip existing `source_url`
- skip duplicate URLs inside the same batch
- show progress and per-item results in the UI

### 2. Build blockers were fixed

Fixed issues:
- broken batch IPC insertion in `index.ts`
- broken newline split regex in `IngestPage.jsx`
- garbled summary separator in batch results

Build verification:
- `npm run build:core` passed
- `npm run build:main` passed
- `npx vite build` passed

### 3. Batch result explanation was improved

The result area now shows:
- `Success X | Skipped Y | Failed Z`
- `Requested N | Unique URLs M | Queued Q`
- `Skip detail: existing A | duplicate input B | invalid C`

This makes it clear whether skipped items came from:
- existing `source_url`
- duplicate input in the current batch
- invalid URLs

### 4. A real parameter passing bug was fixed

The batch UI had been calling the backend with an empty options object.
This meant the page controls were not actually applied.

Fixed parameters:
- `minDelaySeconds`
- `maxDelaySeconds`
- `retryCount`
- `skipExistingSourceUrls`

## Validation notes

Validation directory used by the user:
- `F:\Obsidian\wikiTest3`

Observed result:
- batch URL ingest works
- user completed actual runtime validation
- user manually ran `npx playwright install`

This resolved the missing Playwright browser binary issue for WeChat article fetching.

## Interpretation note

The test directory already contained multiple raw files sharing the same `source_url` from earlier test runs.
Because of that, seeing many skipped items in later re-runs is expected and does not mean the current batch statistics are wrong.

## Current status

This batch URL ingest round can be considered complete:
- workflow implemented
- build clean
- runtime validated by user
- result summary clarified

## Deferred follow-ups

Not done in this round:
- environment diagnostics panel
- friendlier Playwright dependency guidance in product UI
- environment auto-repair actions
