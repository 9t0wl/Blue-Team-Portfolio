# 9t0wl — Blue Team Portfolio

SOC / Blue Team portfolio — built with React + Vite, deployed to GitHub Pages. Sibling site to [HTB-Portfolio](https://github.com/9t0wl/HTB-Portfolio) (red team) and the [BLUE//TEAM Cheatsheet](https://github.com/9t0wl/blue-team-cheatsheet) (live reference tool).

## Setup

```bash
npm install
npm run dev       # dev server at localhost:5173
npm run build     # production build → dist/
```

## Deploying

Push to `main` — GitHub Actions auto-builds and deploys.

**One-time setup (new repo):**
1. Go to repo Settings → Pages → Source: **GitHub Actions**
2. That's it. Push and it deploys.

## Adding a New Case File

Drop `yourcase.md` into `src/writeups/`, then open `src/data/cases.js` and add an entry to the `cases` array:

```js
{
  id: 'roomname',          // URL slug — kebab-case, unique
  name: 'Room Name',       // display name
  platform: 'THM',         // 'THM' | 'HTB'
  category: 'DFIR / Log Analysis',
  diff: 'hard',             // 'easy' | 'medium' | 'hard' | 'insane'
  tags: ['Elastic', 'Mimikatz'],  // techniques used
  date: '2026-09',          // YYYY-MM completed
  writeup: () => import('../writeups/roomname.md?raw'),
},
```

Push to main → auto-deploys. Card and writeup page generate automatically.

## Updating Certs

Edit `src/data/certs.js` — update `status`, `progress`, or add new entries. Colors: `green` (achieved), `amber` (in progress / exam pending), `purple`, `pink`.

## Project Structure

```
src/
├── data/
│   ├── cases.js        ← add case files here
│   └── certs.js        ← update certs here
├── components/
│   ├── Nav.jsx / .module.css
│   ├── CaseCard.jsx / .module.css
│   ├── CertCard.jsx / .module.css
│   ├── OwlSVG.jsx       ← unused here (kept for parity with HTB-Portfolio)
│   └── useReveal.js
├── pages/
│   ├── Home.jsx / .module.css
│   └── WriteupPage.jsx / .module.css
├── assets/
│   └── dig-detect-defend.png  ← hero emblem (badger badge)
└── styles/
    └── global.css        ← color tokens: blue/cyan/green/amber (vs. HTB-Portfolio's purple/pink/green)
```
