# PropPolish

**Declutter and finish your property listing photos with AI.**

Upload messy, occupied-property photos. PropPolish removes clutter and personal
items and applies professional finishing (exposure, white balance, brightening,
a natural real-estate colour grade) using Google's Nano Banana Pro model via
[fal.ai](https://fal.ai). Review each result with a before/after slider, then
**Download** the finished image or **Retry with a note** (e.g. _"also remove the
rug"_, _"less warm"_).

It is a single-user tool. There is no database, no login, and no cloud storage —
just your browser, one serverless route, and your own FAL API key. Nothing is
stored on a server; images live only in your browser session.

---

## What it does

- Drag-and-drop multi-file upload (JPEG / PNG / WEBP). Handles a batch (~30 at a time).
- **Resizes every photo in your browser** so the longest edge is 2048px before it
  ever uploads — this keeps requests small and fast and fits the model's input cap.
- Per-image **Interior** (default) or **Exterior / aerial** mode (swaps the prompt).
- Before/after slider, one-click **Download**, **Retry with a note**, and **Download all** as a zip.
- The finishing prompts are written to be **truthful**: they declutter movable
  belongings and fix lighting, but never remove permanent defects, alter the
  structure, or touch neighbouring property. See _Editing policy_ below.

> HEIC (iPhone `.heic`) is **not supported in v1** — browsers can't reliably
> decode it. Export or convert to JPEG first.

---

## Prerequisites

- **Node.js 18 or newer** (`node --version`).
- A **FAL API key** (see next section).

## Get a FAL API key

1. Go to [fal.ai](https://fal.ai) and sign in / sign up.
2. Open the **Dashboard → Keys** page.
3. Create a key and copy it. It looks like a long token, sometimes in the form
   `key_id:key_secret`.
4. Add credit to your FAL account so generations can run.

Your key is used **server-side only** and is never exposed to the browser.

---

## Run it locally

```bash
# 1. Install dependencies
npm install

# 2. Add your key
cp .env.example .env.local
#    then edit .env.local and set:  FAL_KEY=your_fal_key_here

# 3. Start the dev server
npm run dev
```

Open <http://localhost:3000>, drag in some photos, and go.

---

## Deploy to Vercel

1. Push this repo to GitHub (or GitLab/Bitbucket).
2. In [Vercel](https://vercel.com), **Add New → Project** and import the repo.
   Framework preset auto-detects as **Next.js** — no build settings to change.
3. Under **Settings → Environment Variables**, add:
   - **Key:** `FAL_KEY`  **Value:** _your FAL key_  (Production, Preview, Development).
4. **Deploy.** That's it.

If you ever see `401 Unauthorized` on the deployed URL, turn off **Deployment
Protection** under Project → Settings → Deployment Protection.

---

## Cost per image

Billing is per generation, charged by FAL to your account. **A retry costs the
same as a first generation** (it's another model call).

| Resolution tier | `MAX_EDGE` | Approx. cost / image |
| --------------- | ---------- | -------------------- |
| **2K (default)** | 2048       | **~$0.15**           |
| 4K              | 4096       | ~$0.30               |

There are no other costs — no database, no storage, no per-seat fees.

---

## Changing resolution and swapping the model

Everything tunable lives in [`src/lib/config.ts`](src/lib/config.ts):

- **`MAX_EDGE`** — set to `2048` for the $0.15 2K tier (default) or `4096` for the
  $0.30 4K tier. This controls both the in-browser resize AND the resolution tier
  requested from FAL.
- **`FAL_MODEL`** — the model id. Default is `fal-ai/nano-banana-pro/edit`
  ($0.15 at 2K / $0.30 at 4K). For a cheaper, weaker alternative swap it to
  `fal-ai/nano-banana-2/edit` (~$0.08 per image).
- **`APP_NAME` / `APP_TAGLINE`** — change these two constants to rebrand the whole
  app (title, header, zip filename all follow).

The prompts themselves live in [`src/lib/prompts.ts`](src/lib/prompts.ts).

---

## Editing policy

The prompts are deliberately conservative because a listing photo is a legal
representation of a property. The tool **will**:

- remove the occupant's **movable** clutter and personal items (laundry, dishes,
  toys, fridge magnets, personal photos, stray chairs, bins, cords, yard clutter,
  cars/boats/bins on exteriors);
- neaten beds and soft furnishings; tidy and green a patchy lawn;
- correct exposure, white balance, brightness and colour, and straighten verticals.

The tool is written to **never**:

- change, add or remove walls, windows, doors, floors, ceilings or built-in fixtures;
- change room dimensions, layout or the building's footprint;
- remove or conceal a **permanent defect** (cracks, damp, mould, water stains, damage);
- replace the sky or change the weather / time of day;
- alter or remove **neighbouring** buildings, fences, power lines or structures.

Keep it that way. If you edit `src/lib/prompts.ts`, do not soften the
"ABSOLUTELY DO NOT" clauses.

> **Caveat:** Exterior shots occasionally get re-composed by the model — always
> eyeball exteriors and hit Retry if the framing changed.

---

## Project layout

```
src/
  app/
    layout.tsx            App shell + metadata
    page.tsx              Upload UI, batch orchestration, results grid
    globals.css           Tailwind + slider styles
    api/process/route.ts  Server route: builds prompt, calls FAL, returns image URL
  components/
    JobCard.tsx           Per-image card: status, slider, download, retry
    BeforeAfterSlider.tsx Draggable before/after comparison
  lib/
    config.ts             Branding, model, MAX_EDGE, cost  (edit this to tune)
    prompts.ts            Interior + exterior prompts (legally load-bearing)
    fal.ts                Server-side FAL client (reads FAL_KEY)
    image.ts              Client-side downscale + download helpers
    zip.ts                Dependency-free "Download all" zip writer
    types.ts              Shared Job type
```

## Notes

- Only one runtime dependency exists: **your FAL key**. No other external service.
- The app is stateless. Refreshing the page clears the session.
- Outputs are AI-edited images.
