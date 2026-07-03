# Magic Mirror (for an old Windows laptop)

A lightweight [MagicMirror²](https://magicmirror.builders/)-style dashboard:
a fullscreen black page showing the **time, your calendar, the weather, a
to-do list, and rotating news headlines**. It starts automatically when the
laptop boots.

It's a single Python file (standard library only — nothing to `pip install`)
plus a plain HTML/CSS/JS page, so it runs happily on old hardware.

- **Weather** — [Open-Meteo](https://open-meteo.com) (free, no API key needed)
- **News** — any RSS feeds (BBC World + NYT by default)
- **Calendar** — any iCal (`.ics`) URL, e.g. Google Calendar's secret iCal address
- **To-do list** — stored locally in `todo.json`; add tasks right on the mirror

## Setup (one time, ~10 minutes)

### 1. Install Python

Get it from [python.org/downloads](https://www.python.org/downloads/) and
**tick "Add Python to PATH"** in the installer. (Windows 10/11, any Python
3.9+ works.)

### 2. Configure it — edit `config.json`

| Setting | What to put there |
|---|---|
| `city` | Your city, e.g. `"Manchester"` — used for the weather |
| `units` | `"metric"` (°C, km/h) or `"imperial"` (°F, mph) |
| `newsFeeds` | Any RSS feed URLs you like |
| `calendarIcsUrl` | Your calendar's iCal link (see below) |

**Getting your Google Calendar link:** open
[Google Calendar](https://calendar.google.com) in a browser → gear icon →
*Settings* → click your calendar on the left → *Integrate calendar* →
copy the **"Secret address in iCal format"** and paste it as
`calendarIcsUrl`. (Keep that URL private — anyone with it can read your
calendar.)

### 3. Try it

Double-click **`start_mirror.bat`**. After a couple of seconds the mirror
opens fullscreen in Edge. To get out: press **Alt+F4**, or run
`stop_mirror.bat`.

You can also just run `python server.py` and open
<http://localhost:8480> in any browser.

### 4. Make it start when the laptop boots

1. Press **Win+R**, type `shell:startup`, press Enter — a folder opens.
2. Right-click `start_mirror.bat` → *Show more options* → **Create shortcut**,
   and move the shortcut into that folder.
3. (Recommended) Set Windows to log in automatically, or the mirror will wait
   at the login screen.

### 5. Keep the screen awake

In an **admin** Command Prompt:

```bat
powercfg /change monitor-timeout-ac 0
powercfg /change standby-timeout-ac 0
```

(Leave the laptop plugged in; also check *Settings → System → Power* that
closing the lid doesn't sleep the machine if you'll use an external monitor.)

## Using the mirror

- The **to-do list** has a small input box — click it, type a task, press
  Enter. Click a task to mark it done; hover and click ✕ to remove it.
  The mouse cursor hides itself after a few seconds of no movement.
- Weather refreshes every 15 min; news and calendar every 10 min; headlines
  rotate every 10 seconds.

## Customising

- **Layout / colours / sizes** — everything visual is in `public/style.css`.
- **Refresh timings & modules** — top of `public/main.js`.
- **Data fetching** — `server.py` (each module is a small, separate function).

## Limitations

The calendar parser handles normal and recurring events (daily / weekly /
monthly / yearly, including `UNTIL`, `COUNT` and excluded dates), which covers
the vast majority of real calendars, but it is deliberately simple — exotic
recurrence rules (e.g. "second Tuesday of the month") show up on the anchor
day instead. Times with explicit time zones are shown in the laptop's local
time zone.
