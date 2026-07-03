# Home Board (for an old Windows laptop)

A lightweight, MagicMirror²-inspired always-on dashboard:
a fullscreen black page showing the **time, your calendar, the weather, a
to-do list, and rotating news headlines**. It starts automatically when the
laptop boots.

It's a single Python file (standard library only — nothing to `pip install`)
plus a plain HTML/CSS/JS page, so it runs happily on old hardware.

| Module | Where the data comes from |
|---|---|
| Weather | [Open-Meteo](https://open-meteo.com) — free, **no API key or sign-up needed** |
| News | RSS feeds — RTÉ News, The Economist and Bloomberg by default |
| Calendar | Any iCal (`.ics`) link — Google Calendar, Outlook or iCloud |
| To-do list | Stored on the laptop in `todo.json`; add tasks right on the display |
| Cinema | Today's films & showtimes at your local cinema (Omniplex Limerick by default), one film at a time, rotating every 5 seconds |
| Plant watering | A "Water Today" reminder for any plants that are due or overdue; manage the list and tap to mark watered from your phone |

---

## ⚙️ Configuration — everything is in ONE file: `config.json`

You never need to touch the code. **Every setting lives in
`home-board/config.json`.** Open it by right-clicking the file →
*Open with* → *Notepad*. It looks like this:

```json
{
  "port": 8480,
  "city": "London",
  "latitude": null,
  "longitude": null,
  "units": "metric",
  "newsFeeds": [
    "https://www.rte.ie/feeds/rss/?index=/news/",
    "https://www.economist.com/latest/rss.xml",
    "https://feeds.bloomberg.com/markets/news.rss"
  ],
  "headlinesPerFeed": 6,
  "calendarIcsUrl": "",
  "maxCalendarDays": 14,
  "cinema": {
    "provider": "omniplex",
    "venue": "limerick",
    "displayName": "Omniplex Limerick"
  }
}
```

| Setting | What it does | What to put there |
|---|---|---|
| `city` | Weather location | Your city in quotes, e.g. `"Dublin"`. If the wrong city is picked, set `latitude`/`longitude` instead (find them on Google Maps) and the city name is ignored. |
| `units` | Temperature & wind units | `"metric"` (°C, km/h) or `"imperial"` (°F, mph) |
| `newsFeeds` | Headline sources | A list of RSS feed URLs — see [News feeds](#-news-feeds) below |
| `headlinesPerFeed` | How many headlines to rotate per feed | A number, e.g. `6` |
| `calendarIcsUrl` | Your calendar | Your calendar's secret iCal link — see [Calendar](#-connecting-your-google-calendar) below |
| `maxCalendarDays` | How far ahead the calendar looks | A number of days, e.g. `14` |
| `cinema` | Local cinema listings | See [Cinema listings](#-cinema-listings) below |
| `port` | Local address of the dashboard | Leave as `8480` unless something else uses it |
| `lanAccess` | Phone access on home Wi-Fi | `true` (default) or `false` — see [phone access](#-updating-the-to-do-list-from-your-phone) |

⚠️ **JSON is picky.** Keep the quotes, and note the commas: every line has a
comma after it *except the last one inside each `{ }` or `[ ]`*. If the
display won't start after an edit, you've probably lost a comma or a quote —
paste the file into <https://jsonlint.com> to see exactly where.

After changing `config.json`, restart Home Board (`stop_home_board.bat`, then
`start_home_board.bat`).

---

## 📅 Connecting your Google Calendar

You need your calendar's **"Secret address in iCal format"** — a private URL
that lets it read your events without any login or API key.

1. Open [calendar.google.com](https://calendar.google.com) in a browser
   **on a computer** (the phone app doesn't show this setting).
2. Click the **gear icon** (top right) → **Settings**.
3. In the left sidebar, under **"Settings for my calendars"**, click your
   calendar (usually your name or email address).
4. Scroll down to the **"Integrate calendar"** section.
5. Find **"Secret address in iCal format"**. Click the **copy icon** next to
   it. The URL looks like:
   `https://calendar.google.com/calendar/ical/yourname%40gmail.com/private-abc123.../basic.ics`
6. Paste it into `config.json` as `calendarIcsUrl`, **inside the quotes**:

   ```json
   "calendarIcsUrl": "https://calendar.google.com/calendar/ical/yourname%40gmail.com/private-abc123/basic.ics",
   ```

7. Restart it. Your next two weeks of events appear under the clock.

🔒 **Keep that URL private** — anyone who has it can read your calendar.
(If it ever leaks, the same Google settings page has a "Reset" button that
invalidates the old link.) Don't push a `config.json` containing it to a
public GitHub repo.

**Not on Google?** Any iCal link works the same way:
- **Outlook.com**: Settings → Calendar → *Shared calendars* → publish a
  calendar → copy the **ICS** link.
- **iCloud**: Calendar app → share icon next to the calendar → *Public
  Calendar* → copy the link, and change `webcal://` at the start to `https://`.

---

## 📰 News feeds

`newsFeeds` is a list of RSS feed URLs. It grabs the top headlines
from each and rotates through them at the bottom of the screen. The defaults
are RTÉ News, The Economist and Bloomberg Markets. Other feeds you can
copy-paste in:

| Source | Feed URL |
|---|---|
| RTÉ News (default) | `https://www.rte.ie/feeds/rss/?index=/news/` |
| The Economist — latest (default) | `https://www.economist.com/latest/rss.xml` |
| Bloomberg Markets (default) | `https://feeds.bloomberg.com/markets/news.rss` |
| Bloomberg Politics | `https://feeds.bloomberg.com/politics/news.rss` |
| Bloomberg Technology | `https://feeds.bloomberg.com/technology/news.rss` |
| The Economist — Finance & economics | `https://www.economist.com/finance-and-economics/rss.xml` |
| BreakingNews.ie | `https://feeds.breakingnews.ie/bntopstories` |
| BBC World | `https://feeds.bbci.co.uk/news/world/rss.xml` |
| New York Times | `https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml` |

Most news sites publish RSS — search "*site name* RSS feed" and paste the URL
into the list. **To check a feed works**, open its URL in a browser: you
should see a page of raw XML mentioning the latest headlines. If a feed dies,
it keeps working and just skips it (the failing URL is reported in
the `errors` field of <http://localhost:8480/api/news>).

Remember the JSON comma rule — commas *between* the URLs, none after the
last one:

```json
"newsFeeds": [
  "https://www.rte.ie/feeds/rss/?index=/news/",
  "https://feeds.bloomberg.com/technology/news.rss"
],
```

---

## 📱 Updating the to-do list (and plants) from your phone

Home Board serves a phone-friendly page to every device on your home
Wi-Fi, with both the to-do list and the plant watering list on it. Anything
you tick off or add on your phone appears on the display within a few
seconds (and vice versa).

1. Start Home Board. The server prints the address to use, e.g.
   `On your phone (same Wi-Fi): http://192.168.1.23:8480/todo`
   (You can also find the laptop's address with `ipconfig` in Command
   Prompt — use the "IPv4 Address" of the Wi-Fi adapter.)
2. **The first time the server runs, Windows Firewall pops up a dialog** —
   tick **"Private networks"** and click **Allow access**, or phones won't
   be able to connect.
3. Open that address in your phone's browser. Tap a task to mark it done,
   ✕ to remove it, and use the box at the bottom to add one.
4. To make it feel like an app: in Safari/Chrome on the phone, use
   **Share → Add to Home Screen**. One tap from then on.

### Plants

Scroll down on the same phone page to **Plants**. Type a plant's name and
how often it needs water (in days), and tap ＋. The display's "Water Today"
module (under the calendar) only shows plants that are due or overdue today
— tap a plant there, or on the phone, to mark it watered, which resets its
clock. Nothing shows on the display until a plant is actually due, so an
empty watering list won't clutter the screen.

Give the laptop a **fixed IP** (or use its computer name, e.g.
`http://my-laptop:8480/todo`) so the address never changes — most routers
let you "reserve" an address for a device.

Notes:
- This only works at home, on the same Wi-Fi — which also means nothing is
  exposed to the internet. If you want *anywhere* access, the clean options
  are a free [Tailscale](https://tailscale.com) network (the phone address
  then works from anywhere) or switching the list to a to-do app with an
  API like Todoist.
- Set `"lanAccess": false` in `config.json` to make it
  laptop-only again.

---

## 🎬 Cinema listings

Home Board shows **today's films at your cinema, one at a time, rotating
every 5 seconds** with the showtimes underneath. Three providers, chosen by
`cinema.provider` in `config.json`:

**`"omniplex"` (default)** — reads the listings from an omniplex.ie cinema
page. `venue` is the last part of the cinema's web address: for
`omniplex.ie/cinema/limerick` it's `"limerick"`. `displayName` is just the
heading shown on the display.

**`"cineworld"`** — for Cineworld cinemas (Ireland & UK). Set
`"region": "ie"` or `"uk"` and a `cinemaId`. Don't know the id? Leave
`cinemaId` empty, start it, and open
<http://localhost:8480/api/cinema> — it lists every cinema with its id.

```json
"cinema": { "provider": "cineworld", "region": "ie", "cinemaId": "8112" }
```

**`"manual"`** — works for any cinema: create a file called `cinema.json`
next to `server.py` and type in what's on:

```json
{
  "cinemaName": "My Local Cinema",
  "films": [
    { "title": "Dune: Part Three", "times": ["14:20", "17:40", "21:00"] },
    { "title": "The Grand Tour", "times": ["16:10", "19:30"] }
  ]
}
```

Set `"provider": "off"` to hide the module entirely.

⚠️ *Heads-up:* the Omniplex website sometimes blocks automated requests. If
it says "Listings unavailable", open
<http://localhost:8480/api/cinema> to see the exact error — and worst case,
switch to `"manual"` mode.

---

## 🚀 Setup on the laptop (one time, ~10 minutes)

### 1. Install Python

Get it from [python.org/downloads](https://www.python.org/downloads/) and
**tick "Add Python to PATH"** in the installer. (Windows 10/11, any Python
3.9+ works.)

### 2. Configure

Edit `config.json` as described above — at minimum set your `city` and paste
in your calendar link.

### 3. Try it

Double-click **`start_home_board.bat`**. After a couple of seconds the
dashboard opens fullscreen in Edge. To get out: press **Alt+F4**, or run
`stop_home_board.bat`.

You can also just run `python server.py` and open
<http://localhost:8480> in any browser.

### 4. Make it start when the laptop boots

1. Press **Win+R**, type `shell:startup`, press Enter — a folder opens.
2. Right-click `start_home_board.bat` → *Show more options* → **Create shortcut**,
   and move the shortcut into that folder.
3. (Recommended) Set Windows to log in automatically, or Home Board will wait
   at the login screen.

### 5. Keep the screen awake

In an **admin** Command Prompt:

```bat
powercfg /change monitor-timeout-ac 0
powercfg /change standby-timeout-ac 0
```

(Leave the laptop plugged in; also check *Settings → System → Power* that
closing the lid doesn't sleep the machine if you'll use an external monitor.)

---

## Using it

- The **to-do list** has a small input box — click it, type a task, press
  Enter. Click a task to mark it done; hover and click ✕ to remove it.
  The mouse cursor hides itself after a few seconds of no movement.
- Weather refreshes every 15 min; news and calendar every 10 min; headlines
  rotate every 10 seconds.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Won't start after editing config | Broken JSON — check it at <https://jsonlint.com> |
| "Weather unavailable" | Check the laptop is online; check `city` spelling |
| "Calendar unavailable" / no events | Open the `calendarIcsUrl` in a browser — it should download a `.ics` file. If not, re-copy the secret address. |
| One news source never appears | Open the feed URL in a browser — if it's not XML, replace it |
| Blank screen in Edge | Is the server running? Open <http://localhost:8480> manually to see the error |

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
