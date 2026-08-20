# operator-protocol

## Focus Cycle — pomodoro timer

`pomodoro.html` is a standalone pomodoro timer built to be added to a phone
home screen. No build step, no dependencies, no accounts — one HTML file plus
a manifest, a service worker, and icons.

**Live:** https://bkinder4243-lang.github.io/operator-protocol/pomodoro.html
*(requires GitHub Pages to be enabled for this repo: Settings → Pages → deploy
from `main`, root)*

### Add it to your home screen

- **iPhone** — open the link in **Safari** (not Chrome), tap the Share button,
  then **Add to Home Screen**. It launches full screen with no browser chrome.
- **Android** — open the link in Chrome, tap the ⋮ menu, then **Install app**
  (or *Add to Home screen*).

After the first load it's cached by the service worker, so it works with no
signal.

### What it does

- 25 / 5 / 15 minute cycle by default, long break every 4th session
- Tap a phase chip to jump straight to focus, short break, or long break
- Start / pause / resume, skip, reset — spacebar toggles on desktop
- Chime + vibration when a block ends, auto-start of the next block
- Tracks sessions today, minutes focused, and a daily streak
- Every duration is editable under **Settings** and persists in `localStorage`
- Screen wake lock keeps the phone from sleeping mid-session

The countdown runs off a wall-clock deadline rather than an interval counter,
so locking the phone or backgrounding the tab doesn't make it drift.
