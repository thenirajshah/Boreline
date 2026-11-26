# Boreline Dimensions

Boreline is a static engineering reference for pipe dimensions by nominal pipe size and wall designation and flange dimensions by nominal pipe size and pressure class.

## Run and validate

```sh
python3 -m http.server 8000
node --test tests/engineering.test.cjs
node --check data.js
node --check engineering.js
node --check drawing.js
node --check lookup.js
```

Open the local server root for development. To reproduce the GitHub Pages mount, serve a parent directory with the site at `Boreline/` and open `/Boreline/`. The application uses same-directory asset paths and query parameters, so a shared link needs only the static index page. There is no compilation step or runtime dependency.

## Engineering records

- `data.js` is the upstream source dataset. Its checksum is pinned in the regression suite. `engineering.js` indexes its records, resolves aliases and dependent options, and formats the data for the UI and exports.
- A nominal pipe size or nominal bore identifies a record. Use the outside-diameter row for an actual outside dimension.
- Pipe values use the paired metric and U.S. customary figures from the source. Flange measurements in inches are converted from source millimetres at 25.4 mm per inch and displayed to three decimal places. CSV and complete-record copies include source values alongside display values.
- The pipe chart lists a 5.84 mm inside diameter for NPS 1/8 Extra Strong, Schedule 80, and Schedule 80S. The listed metric outside diameter and wall thickness yield 5.48 mm when calculated. The source value and discrepancy appear together.
- Seven flange records have no socket-depth value. The source also flags 22-inch flanges as outside ANSI B16.5 coverage. The application retains these records and their notes. The remaining records have no attributed standard edition in the dataset.
- Comparisons require matching component fields and source coverage. Schedule aliases for a physical wall record share one comparison slot. Missing values remain unavailable, and differences are evaluated before display conversion and rounding.

## Frontend

`lookup.js` manages lookup, comparison, saved records, and navigation. The app stores appearance, preferred units, favorites, and recently viewed records in the browser. The comparison shelf is session-local. Open quick navigation with Ctrl/Cmd + K.

The verified upstream repository contains no engineering drawings. `drawing.js` provides a raster viewer with zoom, pan, reset, and fullscreen preview. Approved drawings can be registered by physical record ID with their relative raster URL, intrinsic dimensions, and alternative text. The application shows drawing availability alongside the dimension record until those assets exist.

The review screenshots show the upstream and upgraded applications at 1440 px and 375 px. See [desktop before](docs/screenshots/before-desktop.webp), [desktop after](docs/screenshots/after-desktop.webp), [mobile before](docs/screenshots/before-mobile.webp), and [mobile after](docs/screenshots/after-mobile.webp).
