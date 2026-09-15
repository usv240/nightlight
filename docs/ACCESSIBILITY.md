# Accessibility and quality audit

Measured, not asserted. Lighthouse 13.4.1 against the deployed site at https://d28hskpupjctiz.cloudfront.net, headless Chrome, default mobile throttling.

## Results

| Category | Score |
|---|---|
| Accessibility | 100 |
| Best practices | 100 |
| SEO | 100 |
| Performance | 98 |

Reproduce:

```
npx lighthouse https://d28hskpupjctiz.cloudfront.net/ \
  --only-categories=accessibility,performance,best-practices,seo \
  --chrome-flags="--headless=new"
```

## What the first run found, and what we changed

The first run scored 98 on accessibility and 96 on best practices. Both gaps were real and both are fixed.

**No `main` landmark.** The page went straight from the nav to a series of sections, so a screen-reader user had no way to skip navigation and jump to content, and `landmark-one-main` failed. The page content is now wrapped in `<main id="main">`.

**A 404 on every page load.** No favicon existed at any conventional path, so every visit logged a console error and the browser tab showed a blank icon. Both sites now ship an `icon.svg`.

## What was already right

These were not changed, and are worth stating because they were deliberate rather than lucky:

- Colour is never the only carrier of meaning. Incident states carry text labels, not just status colours.
- Light and dark themes are both real themes with independently checked contrast, driven by design tokens rather than a filter, with a three-state control (light, dark, system).
- Every interactive control is keyboard reachable with a visible focus ring.
- The info buttons are real buttons with accessible names, not hover-only tooltips, so the explanation of each feature is reachable by keyboard and by screen reader.

## Known limit

Lighthouse checks what can be checked automatically, which is a minority of WCAG. It does not verify that our reading order makes sense, that our labels are meaningful rather than merely present, or that the product is usable by someone at 3am. No assistive-technology user has tested this build. That is the honest boundary of this result, and a claim of "accessible" on the strength of a Lighthouse score alone would be an overclaim.
