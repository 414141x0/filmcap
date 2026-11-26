# FilmCap

The pages for the FilmCap iPhone app, served by GitHub Pages:

- `index.html`, `home.css`, `home.js`: the app's page. One day through FilmCap's viewfinder: a 360°
  scene around a phone whose screen shows the scene through a film; swipe for another film, tap the
  shutter to keep a photo, which hangs in the darkroom further down. No build step, no libraries.
- `privacy.html`: the privacy policy (App Store Connect's Privacy Policy URL), with `style.css`
- `support.html`: support (App Store Connect's Support URL), with `style.css`
- `get/`: where the QR code on FilmCap's photos leads (the App Store once FilmCap is listed)

## Images

- `img/films/`: each film of a new camera's roll as a 32³ colour table (256 × 128 PNG: 8 × 4 slices
  of blue, red across and green down each), baked from the app itself by `WebFilmsBake` in the app's
  tests (`TEST_RUNNER_NSC_BAKE_WEB_FILMS=<folder>`): colour and tone only, as FilmCap measures its
  films. `films.json` names them.
- `img/pano/`: the day's three scenes, 4096 × 2048 for the viewfinder and 1024 × 512 softened for the
  world around the phone. 360° photos by [Poly Haven](https://polyhaven.com) (CC0): Comfy Café,
  Bell Park Pier, Cobblestone Street Night.
- `img/views/`: the lake through each film (the film wall) and the night lane plain and through
  Lantern Night (the slider), made with the same tables.
- `img/photo-*.jpg`: photos by the developer, taken with FilmCap. The `*.webp`: the app's screens.

Set in Allo (`fonts/`, SIL Open Font License 1.1, `fonts/Allo-OFL.txt`); headlines in the system's
serif.
