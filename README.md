# FilmCap

The pages for the FilmCap iPhone app, served by GitHub Pages:

- `index.html`, `home.css`, `home.js`: the app's page. One day through FilmCap's viewfinder: a 360°
  scene around FilmCap's own camera screen in an iPhone frame, the scene through a film in its
  viewfinder; its histogram, level and focus live; swipe for another film, tap the shutter to keep
  a photo, which hangs in the darkroom further down. No build step, no libraries.
- `privacy.html`: the privacy policy (App Store Connect's Privacy Policy URL), with `style.css`
- `support.html`: support (App Store Connect's Support URL), with `style.css`
- `get/`: where the QR code on FilmCap's photos leads (the App Store once FilmCap is listed)

## Images

- `img/films/`: each film of a new camera's roll as a 32³ colour table (256 × 128 PNG: 8 × 4 slices
  of blue, red across and green down each), baked from the app itself by `WebFilmsBake` in the app's
  tests (`TEST_RUNNER_NSC_BAKE_WEB_FILMS=<folder>`): colour and tone only, as FilmCap measures its
  films. `films.json` names them.
- `img/pano/`: the day's three scenes: 1024 × 512 softened for the world around the phone, then
  2048 × 1024 (`-mid`) and 4096 × 2048 for the viewfinder, which waits for a sharp one. 360° photos by [Poly Haven](https://polyhaven.com) (CC0): Comfy Café,
  Bell Park Pier, Cobblestone Street Night.
- `img/views/`: the lake through each film (the film wall) and the night lane plain and through
  Lantern Night (the slider), made with the same tables.
- `img/ui/photo.webp`, `video.webp`: FilmCap's camera screen, photo and video, captured on the iPhone Air
  simulator over a black and a white picture and matted (each pixel's colour and opacity), so the
  page's live picture shows through the viewfinder and under the glass. The shutter's histogram
  face and the film pill's words are cleared: the page draws them live.
- `img/ui/air.svg`: an iPhone Air front drawn from its dimensional drawing (case, corner profile,
  glass, buttons) around the 420 × 912 pt screen, which is a hole. An approximation of the hardware.
- `img/video/lake.mp4`: “Sunset in Lake Toba” by Nafisathallah (Wikimedia Commons, CC BY 4.0), cut to
  a seamless 8 s loop and played through the films live.
- `img/widgets/`: FilmCap's widgets, cut from Home Screen captures.
- `img/photo-*.jpg`: photos by the developer, taken with FilmCap. `stickers.webp`, `camera.webp`:
  the app's screens (the second is the viewfinder's picture where WebGL is missing).

Set in Allo (`fonts/`, SIL Open Font License 1.1, `fonts/Allo-OFL.txt`); headlines in the system's
serif.
