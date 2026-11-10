# MadeForAward UI

Free, open-source animated components for React: WebGL backgrounds, text animations, cursors and hover effects. Copy a component into your project and make it yours.

**Live previews with editable props:** [madeforaward.com/ui](https://www.madeforaward.com/ui)

If a component saves you time, a ⭐ on this repo helps more people find it.

## Use a component

Every component lives in its own folder:

```
ui/<slug>/
  meta.json   name, description, props, dependencies
  demo.tsx    the live preview on madeforaward.com/ui
  files/      the files to copy, laid out as they land in your project
              (components/mfa/…, public/mfa/<slug>/…)
```

1. Copy `ui/<slug>/files/` into the root of your project.
2. Install the dependencies listed in `meta.json` (for example `npm install gsap @gsap/react` or `npm install three`).
3. Import it: the `usage` field in `meta.json` has a ready-made example.

Components are React + TypeScript + Tailwind CSS v4 and are `'use client'` where they need the browser. A CLI (`npx madeforaward add <slug>`) is on the way.

## Components

### Backgrounds

| Component | What it does | Built with |
| --- | --- | --- |
| [Fluted Glass Background](https://www.madeforaward.com/ui/backgrounds/fluted-glass-background) | A soft, drifting mesh gradient seen through ribbed, fluted glass, with curved shading, edge highlights and a light that follows the cursor. | React only |
| [Isometric Key Grid](https://www.madeforaward.com/ui/backgrounds/isometric-key-grid) | An isometric field of soft keys that rise in a smooth dome under the cursor, light up in a flowing gradient and glow onto the floor, each with a small line icon. | three |
| [Particle Road Background](https://www.madeforaward.com/ui/backgrounds/dot-highway-background) | A road of dots streams out of a vanishing point under a low camera, curving up into the distance, with faint accent pulses running down the lanes. | three |
| [Silk Gradient Background](https://www.madeforaward.com/ui/backgrounds/silk-gradient-background) | Slow, silky folds with a soft sheen and a thin bright seam, from three colours. | React only |
| [Spiral Shader Background](https://www.madeforaward.com/ui/backgrounds/spiral-shader-background) | Glowing arms wind out from the centre in a three-colour gradient, with a soft halo and a fading rim. | React only |
| [Wireframe Sphere Background](https://www.madeforaward.com/ui/backgrounds/wire-sphere-background) | A dense mesh pushed in and out by flowing Perlin noise, lit as a rainbow heat map where it bulges, seen through a pincushion lens that folds it into rings and petals with a moiré shimmer. | three |

### Text animations

| Component | What it does | Built with |
| --- | --- | --- |
| [3D Cylinder Scroll Text](https://www.madeforaward.com/ui/text/cylinder-text) | Lines sit around a drum that the scroll turns, rising from below, facing you in the middle and tipping away over the top. | gsap |
| [Arc Poke Text](https://www.madeforaward.com/ui/text/arc-poke-text) | It rises out of per-letter clips in random order when it comes into view, then letters near the cursor lift, swell and lean away, springing back with an elastic wobble. | gsap |
| [Assemble Text](https://www.madeforaward.com/ui/text/assemble-text) | The block holds its final size from the start. | gsap |
| [Blur Rise Text](https://www.madeforaward.com/ui/text/blur-rise-text) | Characters rise out of a heavy blur and sharpen into place, staggered from the edges inward on a long expo ease. | gsap |
| [Liquid Distortion Text Hover](https://www.madeforaward.com/ui/text/flow-distort-text) | The cursor smears a big word like wet paint, dragging the letters along a fading flowmap and splitting them into red, green and blue fringes that run along and across the stroke, with motion blur on fast moves. | three |
| [Masked Line Reveal](https://www.madeforaward.com/ui/text/masked-line-reveal) | Each line of a heading or paragraph rises out of its own mask, one after another, when it scrolls into view. | gsap |
| [Masked Title Flip](https://www.madeforaward.com/ui/text/title-flip-reveal) | A big headline zooms up from 45% while its lines rise one by one out of masks, each sliding in from alternate sides on a sharp ease that settles slowly. | gsap |
| [Scramble Text](https://www.madeforaward.com/ui/text/scramble-text) | A band of random glyphs runs ahead of the text and resolves it left to right. | gsap |
| [Scroll Highlight Text](https://www.madeforaward.com/ui/text/scroll-highlight) | The words of a paragraph light up one by one as it scrolls through the viewport, scrubbed to the scroll, and dim again on the way back. | gsap |
| [Scroll Reading Text](https://www.madeforaward.com/ui/text/reading-fill-text) | A big paragraph fills word by word, left to right, from grey to colour as each line crosses the reading line, with inline icons that fill the same way. | React only |
| [Scroll Text Reveal](https://www.madeforaward.com/ui/text/scroll-steps-text) | In a pinned section, letters brighten one by one as you scroll, each flashing in an accent colour and settling to the text colour over a second, so a soft coloured wake trails the reading point; several paragraphs take turns, each rising in line by line. | gsap |
| [Wipe Reveal Text](https://www.madeforaward.com/ui/text/wipe-reveal-text) | Each line is uncovered by a solid bar that sweeps across it, its tail chasing after and the words emerging from behind, line after line on a slow-fast-slow custom ease. | gsap |

### Interactions

| Component | What it does | Built with |
| --- | --- | --- |
| [3D Lanyard Badge](https://www.madeforaward.com/ui/interactions/hanging-badge) | An event pass on a strap that you can grab, drag, throw and spin, with verlet rope physics and clearcoat lighting. | three |
| [3D Puffy Icon](https://www.madeforaward.com/ui/interactions/puffy-icon) | Turn any SVG icon into a soft, inflated 3D tile that leans toward the cursor. | three |
| [Carousel Wall Scroll](https://www.madeforaward.com/ui/interactions/paper-flow-hero) | A tilted carousel of image fins spins up as you scroll, then card by card the images slide off and fly onto a tilted wall while the camera zooms in, and the wall settles into a panel beside your content. | three |
| [Dot Swing Button](https://www.madeforaward.com/ui/interactions/dot-swing-button) | The dot rocks away round a pivot while three coloured dots swing in one after another like a little colour wheel, and the label tips back and lifts out as a copy swings up into its place, all on an elastic ease. | React only |
| [Drip Button](https://www.madeforaward.com/ui/interactions/drip-button) | It sags along the edge and runs down in a few uneven drips, the longest keep creeping and shedding drops, and it all climbs back up on mouse leave. | gsap |
| [Focus Carousel](https://www.madeforaward.com/ui/interactions/focus-carousel) | It's large and in colour, the rest shrink, grey, blur and fade away from it, with its title and caption underneath. | React only |
| [Focus Lens Image](https://www.madeforaward.com/ui/interactions/focus-lens-image) | Outside the lens it stays soft, inside it comes into focus, perfectly aligned. | React only |
| [Halftone Image Hover](https://www.madeforaward.com/ui/interactions/halftone-hover) | Turn any image into a halftone of dots that scatter around the cursor and drift back, in React. | React only |
| [Ink Blob Cursor](https://www.madeforaward.com/ui/interactions/ink-blob-cursor) | An ink blot trails the pointer, its edge torn into splashes and droplets by a drifting voronoi noise field, and text over it flips from dark to light with a difference blend wherever the ink passes. | React only |
| [Lens Image Field](https://www.madeforaward.com/ui/interactions/lens-image-field) | An endless grid of images drifts behind your content, hidden except around a lens that trails the pointer, where pictures bloom larger the closer they are. | React only |
| [Liquid Dock](https://www.madeforaward.com/ui/interactions/liquid-dock) | A gooey blob slides on a spring to the hovered icon, stretches toward the cursor and takes each item's colour, with magnifying icons, springy tooltips and an active state it flows back to. | motion |
| [Liquid Image Hover](https://www.madeforaward.com/ui/interactions/liquid-image-hover) | The picture turns to water under the cursor. | three |
| [Liquid Reveal Cursor](https://www.madeforaward.com/ui/interactions/liquid-reveal-cursor) | A liquid cursor for React that opens a window onto a dark version of the page beneath. | React only |
| [Liquid Smoke Cursor](https://www.madeforaward.com/ui/interactions/liquid-smoke-cursor) | A real GPU fluid simulation (velocity, pressure, vorticity) follows the pointer and fades out behind it. | React only |
| [Orbit Gallery](https://www.madeforaward.com/ui/interactions/orbit-gallery) | Photos ride a slowly turning ring, lift out on hover, spin with the wheel or a drag (with momentum), and open into the middle on click with a caption. | React only |
| [Pixel Trail Cursor](https://www.madeforaward.com/ui/interactions/pixel-trail-cursor) | Moving the mouse stirs a velocity field that is drawn as a grid of tiny dots, each cell lighting up to seven of them by how hard the cursor moved there, so a quick sweep leaves a dense, dithered streak that thins and breaks up as it fades. | React only |
| [Project Wheels](https://www.madeforaward.com/ui/interactions/project-wheels) | Two wheels of work turn against each other, project cards on one and their marks on the other; the one at the nip grows into focus while its title rolls in like an odometer. | three |
| [Rope Carousel](https://www.madeforaward.com/ui/interactions/rope-carousel) | Each card rides the catenary, leans with it and swings as its own pendulum, and the rope bounces when you throw it. | React only |
| [Scroll Card Fan](https://www.madeforaward.com/ui/interactions/card-fan-scroll) | A pinned section deals a hand of cards one by one into an arc as you scroll, each popping in on an elastic ease while the fan re-centres, then folds back into a stack. | gsap |
| [Scroll Window Zoom Reveal](https://www.madeforaward.com/ui/interactions/window-zoom-scroll) | Two offset windows cut into a wall show one photo; as you scroll they stretch level, merge into a single opening, and the wall zooms in until the photo fills the screen, then the heading turns in letter by letter and the text rises line by line. | gsap |
| [Silk Cursor Trail](https://www.madeforaward.com/ui/interactions/silk-cursor-trail) | A glowing ribbon that follows the pointer like a silk thread, bends through every turn, tapers from head to tail and gathers back when the pointer rests. | React only |
| [Skew Slide Button](https://www.madeforaward.com/ui/interactions/skew-slide-button) | The label swaps letter by letter, the resting copy leaning back and sliding out while a second copy slides in upright behind it, chevrons included; the plate swells on hover and squashes on press. | React only |
| [Spine Accordion](https://www.madeforaward.com/ui/interactions/spine-accordion) | The open one widens into a coloured panel, its artwork glides out of the spine and grows into place, and the plus turns into an autoplay progress ring. | motion |
| [Tear Ticket](https://www.madeforaward.com/ui/interactions/tear-ticket) | It swings about the far end of a cleanly cut perforation, each paper bridge stretches into fibres and snaps (nearest first), and the stub hangs from your hand, then falls with your throw. | React only |

## Contributing

Issues and pull requests are welcome: bug reports, browser quirks, accessibility fixes and performance improvements especially.

## License

[MIT](./LICENSE) © MadeForAward. Fonts and images used in demos belong to their owners (Google Fonts, Unsplash) and keep their own licences.
