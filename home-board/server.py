"""Home Board dashboard server.

A single-file server with no dependencies beyond the Python standard
library. It serves the dashboard page from ./public and provides small
JSON APIs for weather (Open-Meteo), news (RSS), calendar (iCal URL) and
a to-do list stored in todo.json.

Run with:  python server.py   (then open http://localhost:8480)
"""

import json
import re
import time
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
CONFIG_FILE = BASE_DIR / "config.json"
TODO_FILE = BASE_DIR / "todo.json"

CONFIG = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))

# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

_cache = {}  # url/key -> (expires_at, value)


def cached(key, ttl_seconds, producer):
    """Return a cached value, refreshing it with producer() when stale."""
    now = time.time()
    hit = _cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    value = producer()
    _cache[key] = (now + ttl_seconds, value)
    return value


def http_get(url, timeout=15):
    # Some news CDNs (e.g. Bloomberg's) reject requests without a
    # browser-like User-Agent, so send one.
    req = Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HomeBoard/1.0",
        "Accept": "*/*",
    })
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


# ---------------------------------------------------------------------------
# Weather (Open-Meteo, free, no API key)
# ---------------------------------------------------------------------------

WEATHER_CODES = {
    0: ("Clear sky", "☀️"), 1: ("Mostly clear", "🌤️"), 2: ("Partly cloudy", "⛅"),
    3: ("Overcast", "☁️"), 45: ("Fog", "🌫️"), 48: ("Icy fog", "🌫️"),
    51: ("Light drizzle", "🌦️"), 53: ("Drizzle", "🌦️"), 55: ("Heavy drizzle", "🌧️"),
    56: ("Freezing drizzle", "🌧️"), 57: ("Freezing drizzle", "🌧️"),
    61: ("Light rain", "🌦️"), 63: ("Rain", "🌧️"), 65: ("Heavy rain", "🌧️"),
    66: ("Freezing rain", "🌧️"), 67: ("Freezing rain", "🌧️"),
    71: ("Light snow", "🌨️"), 73: ("Snow", "🌨️"), 75: ("Heavy snow", "❄️"),
    77: ("Snow grains", "🌨️"), 80: ("Light showers", "🌦️"), 81: ("Showers", "🌧️"),
    82: ("Heavy showers", "🌧️"), 85: ("Snow showers", "🌨️"), 86: ("Snow showers", "❄️"),
    95: ("Thunderstorm", "⛈️"), 96: ("Thunderstorm + hail", "⛈️"),
    99: ("Thunderstorm + hail", "⛈️"),
}


def geocode_city(city):
    url = ("https://geocoding-api.open-meteo.com/v1/search?name="
           + quote(city) + "&count=1&language=en&format=json")
    data = json.loads(http_get(url))
    results = data.get("results") or []
    if not results:
        raise ValueError(f"City not found: {city!r} — check config.json")
    hit = results[0]
    label = ", ".join(p for p in [hit.get("name"), hit.get("country_code")] if p)
    return hit["latitude"], hit["longitude"], label


def get_weather():
    lat, lon = CONFIG.get("latitude"), CONFIG.get("longitude")
    label = CONFIG.get("city", "")
    if lat is None or lon is None:
        lat, lon, label = cached("geocode", 24 * 3600,
                                 lambda: geocode_city(CONFIG["city"]))
    imperial = CONFIG.get("units") == "imperial"
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lon}"
        "&current=temperature_2m,apparent_temperature,relative_humidity_2m,"
        "weather_code,wind_speed_10m"
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,"
        "precipitation_probability_max"
        "&forecast_days=5&timezone=auto"
        + ("&temperature_unit=fahrenheit&wind_speed_unit=mph" if imperial else "")
    )
    data = json.loads(http_get(url))
    cur = data["current"]
    desc, icon = WEATHER_CODES.get(cur["weather_code"], ("", "🌡️"))
    daily = data["daily"]
    forecast = []
    for i, day in enumerate(daily["time"]):
        d_desc, d_icon = WEATHER_CODES.get(daily["weather_code"][i], ("", ""))
        forecast.append({
            "date": day,
            "icon": d_icon,
            "description": d_desc,
            "max": round(daily["temperature_2m_max"][i]),
            "min": round(daily["temperature_2m_min"][i]),
            "rainChance": daily["precipitation_probability_max"][i],
        })
    return {
        "location": label,
        "unit": "°F" if imperial else "°C",
        "temperature": round(cur["temperature_2m"]),
        "feelsLike": round(cur["apparent_temperature"]),
        "humidity": cur["relative_humidity_2m"],
        "windSpeed": round(cur["wind_speed_10m"]),
        "windUnit": "mph" if imperial else "km/h",
        "description": desc,
        "icon": icon,
        "forecast": forecast,
    }


# ---------------------------------------------------------------------------
# News (RSS / Atom feeds)
# ---------------------------------------------------------------------------

def parse_feed(raw, limit):
    root = ET.fromstring(raw)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    items = []
    source = ""
    channel = root.find("channel")
    if channel is not None:  # RSS 2.0
        source = (channel.findtext("title") or "").strip()
        for item in channel.findall("item")[:limit]:
            title = (item.findtext("title") or "").strip()
            if title:
                items.append({"title": title, "source": source})
    else:  # Atom
        source = (root.findtext("atom:title", namespaces=ns) or "").strip()
        for entry in root.findall("atom:entry", ns)[:limit]:
            title = (entry.findtext("atom:title", namespaces=ns) or "").strip()
            if title:
                items.append({"title": title, "source": source})
    return items


def get_news():
    per_feed = CONFIG.get("headlinesPerFeed", 6)
    headlines = []
    errors = []
    for url in CONFIG.get("newsFeeds", []):
        try:
            headlines.extend(parse_feed(http_get(url), per_feed))
        except Exception as exc:  # a dead feed shouldn't kill the whole module
            errors.append(f"{url}: {exc}")
    return {"headlines": headlines, "errors": errors}


# ---------------------------------------------------------------------------
# Calendar (iCal / .ics URL, e.g. Google Calendar's secret iCal address)
# ---------------------------------------------------------------------------

WEEKDAYS = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def unfold_ics(text):
    """Join continuation lines (lines starting with space/tab) per RFC 5545."""
    lines = []
    for raw in text.splitlines():
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def parse_ics_datetime(value, params=""):
    """Return (naive local datetime, all_day). TZID times are treated as local."""
    value = value.strip()
    if "VALUE=DATE" in params or re.fullmatch(r"\d{8}", value):
        return datetime.strptime(value[:8], "%Y%m%d"), True
    if value.endswith("Z"):
        dt = datetime.strptime(value, "%Y%m%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        return dt.astimezone().replace(tzinfo=None), False
    return datetime.strptime(value[:15], "%Y%m%dT%H%M%S"), False


def parse_ics_events(text):
    events = []
    current = None
    for line in unfold_ics(text):
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT":
            if current is not None and "DTSTART" in current:
                events.append(current)
            current = None
        elif current is not None and ":" in line:
            prop, value = line.split(":", 1)
            name, _, params = prop.partition(";")
            if name in ("SUMMARY", "LOCATION", "DTSTART", "DTEND", "RRULE"):
                current[name] = (value, params)
            elif name == "EXDATE":
                current.setdefault("EXDATE", []).append((value, params))
    return events


def parse_rrule(value):
    rule = {}
    for part in value.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            rule[k.upper()] = v
    return rule


def expand_event(event, win_start, win_end):
    """Yield {title, start, end, allDay} occurrences inside the window."""
    start, all_day = parse_ics_datetime(*event["DTSTART"])
    duration = timedelta(0)
    if "DTEND" in event:
        end, _ = parse_ics_datetime(*event["DTEND"])
        duration = end - start
    title = event.get("SUMMARY", ("(no title)", ""))[0]
    title = title.replace("\\,", ",").replace("\\;", ";").replace("\\n", " ")
    location = event.get("LOCATION", ("", ""))[0].replace("\\,", ",")

    exdates = set()
    for value, params in event.get("EXDATE", []):
        for chunk in value.split(","):
            try:
                ex_dt, _ = parse_ics_datetime(chunk, params)
                exdates.add(ex_dt.date())
            except ValueError:
                pass

    def emit(occ_start):
        occ_end = occ_start + duration
        if occ_start.date() in exdates:
            return None
        if occ_start <= win_end and occ_end >= win_start:
            return {
                "title": title,
                "location": location,
                "start": occ_start.isoformat(),
                "end": occ_end.isoformat(),
                "allDay": all_day,
            }
        return None

    if "RRULE" not in event:
        occ = emit(start)
        return [occ] if occ else []

    rule = parse_rrule(event["RRULE"][0])
    freq = rule.get("FREQ", "")
    interval = max(1, int(rule.get("INTERVAL", 1)))
    count = int(rule["COUNT"]) if rule.get("COUNT", "").isdigit() else None
    until = None
    if "UNTIL" in rule:
        try:
            until, _ = parse_ics_datetime(rule["UNTIL"])
        except ValueError:
            pass

    occurrences = []

    def take(candidates):
        n = 0
        for occ_start in candidates:
            if occ_start < start:
                continue
            n += 1
            if count is not None and n > count:
                return
            if until is not None and occ_start > until:
                return
            if occ_start > win_end:
                return
            occ = emit(occ_start)
            if occ:
                occurrences.append(occ)

    if freq == "DAILY":
        take(start + timedelta(days=i * interval) for i in range(20000))
    elif freq == "WEEKLY":
        bydays = sorted(WEEKDAYS[d] for d in rule.get("BYDAY", "").split(",")
                        if d in WEEKDAYS) or [start.weekday()]
        week0 = start - timedelta(days=start.weekday())
        take(week0 + timedelta(weeks=w * interval, days=wd)
             for w in range(3000) for wd in bydays)
    elif freq == "MONTHLY":
        def monthly():
            for i in range(0, 1200, interval):
                month0 = start.month - 1 + i
                year, month = start.year + month0 // 12, month0 % 12 + 1
                try:
                    yield start.replace(year=year, month=month)
                except ValueError:
                    continue  # e.g. Jan 31 in a 30-day month
        take(monthly())
    elif freq == "YEARLY":
        def yearly():
            for i in range(0, 100, interval):
                try:
                    yield start.replace(year=start.year + i)
                except ValueError:
                    continue  # Feb 29
        take(yearly())
    else:
        occ = emit(start)
        if occ:
            occurrences.append(occ)
    return occurrences


def get_calendar():
    url = CONFIG.get("calendarIcsUrl", "")
    if not url:
        return {"configured": False, "events": []}
    text = http_get(url, timeout=20).decode("utf-8", errors="replace")
    win_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    win_end = win_start + timedelta(days=CONFIG.get("maxCalendarDays", 14))
    occurrences = []
    for event in parse_ics_events(text):
        try:
            occurrences.extend(expand_event(event, win_start, win_end))
        except (ValueError, KeyError):
            continue  # skip anything this simple parser can't handle
    occurrences.sort(key=lambda e: e["start"])
    return {"configured": True, "events": occurrences[:25]}


# ---------------------------------------------------------------------------
# Cinema listings
# ---------------------------------------------------------------------------
# provider "cineworld": today's films + showtimes from Cineworld's public
#   listings API (works for cineworld.ie and cineworld.co.uk sites).
# provider "manual": read from cinema.json next to this file, so any cinema
#   can be shown by typing its listings in.

CINEWORLD = {
    "ie": ("https://www.cineworld.ie/ie", "10105"),
    "uk": ("https://www.cineworld.co.uk/uk", "10108"),
}

CINEMA_FILE = BASE_DIR / "cinema.json"


def cineworld_cinemas(region):
    base, tenant = CINEWORLD[region]
    until = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
    url = f"{base}/data-api-service/v1/quickbook/{tenant}/cinemas/with-event/until/{until}"
    data = json.loads(http_get(url, timeout=20))
    return [{"id": c["id"], "name": c["displayName"]}
            for c in data.get("body", {}).get("cinemas", [])]


def cineworld_listings(region, cinema_id):
    base, tenant = CINEWORLD[region]
    today = datetime.now().strftime("%Y-%m-%d")
    url = (f"{base}/data-api-service/v1/quickbook/{tenant}"
           f"/film-events/in-cinema/{cinema_id}/at-date/{today}")
    data = json.loads(http_get(url, timeout=20)).get("body", {})
    names = {f["id"]: f for f in data.get("films", [])}
    times = {}
    for event in data.get("events", []):
        stamp = event.get("eventDateTime", "")
        if "T" in stamp:
            times.setdefault(event.get("filmId"), []).append(stamp.split("T")[1][:5])
    films = []
    for film_id, showtimes in times.items():
        film = names.get(film_id, {})
        films.append({
            "title": film.get("name", "Unknown film"),
            "runtime": film.get("length"),
            "times": sorted(showtimes),
        })
    films.sort(key=lambda f: f["times"][0])
    return films


def omniplex_listings(venue):
    """Parse today's films from an omniplex.ie cinema page.

    The page embeds schema.org JSON-LD (ScreeningEvent) blocks for search
    engines; that is far more stable than scraping the visible HTML.
    """
    url = f"https://www.omniplex.ie/cinema/{venue}"
    html = http_get(url, timeout=20).decode("utf-8", errors="replace")
    today = datetime.now().date()
    films = {}
    for block in re.findall(
            r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>',
            html, re.S):
        try:
            data = json.loads(block.strip())
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else [data]
        for item in items:
            if not isinstance(item, dict):
                continue
            graph = item.get("@graph", [item])
            for node in graph:
                if not isinstance(node, dict):
                    continue
                if node.get("@type") not in ("ScreeningEvent", "Event"):
                    continue
                start = node.get("startDate", "")
                work = node.get("workPresented") or {}
                title = (work.get("name") if isinstance(work, dict)
                         else None) or node.get("name", "")
                if not (title and start[:10] == today.isoformat() and "T" in start):
                    continue
                films.setdefault(title, set()).add(start.split("T")[1][:5])
    result = [{"title": t, "times": sorted(ts)} for t, ts in films.items()]
    if not result:
        raise ValueError(
            "No listings found in the page — Omniplex may have blocked the "
            "request or changed their site; try provider \"manual\"")
    result.sort(key=lambda f: f["times"][0])
    return result


def get_cinema():
    cfg = CONFIG.get("cinema", {})
    provider = cfg.get("provider", "off")
    if provider == "off":
        return {"configured": False, "films": []}

    if provider == "omniplex":
        venue = cfg.get("venue", "")
        if not venue:
            return {"configured": False, "films": [],
                    "hint": 'Set cinema.venue, e.g. "limerick" for '
                            'omniplex.ie/cinema/limerick'}
        return {"configured": True,
                "cinemaName": cfg.get("displayName", f"Omniplex {venue.title()}"),
                "films": omniplex_listings(venue)}

    if provider == "manual":
        if not CINEMA_FILE.exists():
            return {"configured": False, "films": [],
                    "hint": "Create cinema.json — see the README"}
        data = json.loads(CINEMA_FILE.read_text(encoding="utf-8"))
        return {"configured": True,
                "cinemaName": data.get("cinemaName", "Cinema"),
                "films": data.get("films", [])}

    if provider == "cineworld":
        region = cfg.get("region", "ie")
        if region not in CINEWORLD:
            return {"configured": False, "films": [],
                    "hint": 'cinema.region must be "ie" or "uk"'}
        cinema_id = str(cfg.get("cinemaId", "") or "")
        if not cinema_id:
            # Help the user pick: return the list of cinemas and their ids.
            return {"configured": False, "films": [],
                    "hint": "Set cinema.cinemaId in config.json to one of these:",
                    "availableCinemas": cineworld_cinemas(region)}
        return {"configured": True,
                "cinemaName": cfg.get("displayName", "Cineworld"),
                "films": cineworld_listings(region, cinema_id)}

    return {"configured": False, "films": [],
            "hint": f"Unknown cinema provider {provider!r}"}


# ---------------------------------------------------------------------------
# To-do list (persisted to todo.json)
# ---------------------------------------------------------------------------

def get_todos():
    if not TODO_FILE.exists():
        return []
    try:
        items = json.loads(TODO_FILE.read_text(encoding="utf-8"))
        return items if isinstance(items, list) else []
    except json.JSONDecodeError:
        return []


def save_todos(items):
    clean = [{"text": str(i.get("text", ""))[:200], "done": bool(i.get("done"))}
             for i in items if isinstance(i, dict) and str(i.get("text", "")).strip()]
    TODO_FILE.write_text(json.dumps(clean, indent=2), encoding="utf-8")
    return clean


# ---------------------------------------------------------------------------
# Plant watering reminders (persisted to plants.json)
# ---------------------------------------------------------------------------

PLANTS_FILE = BASE_DIR / "plants.json"


def load_plants():
    if not PLANTS_FILE.exists():
        return []
    try:
        items = json.loads(PLANTS_FILE.read_text(encoding="utf-8"))
        return items if isinstance(items, list) else []
    except json.JSONDecodeError:
        return []


def save_plants(items):
    PLANTS_FILE.write_text(json.dumps(items, indent=2), encoding="utf-8")


def plant_status(plant):
    """Add daysUntilDue/overdue/dueToday, computed from the server's clock."""
    today = datetime.now().date()
    last = plant.get("lastWatered")
    if last:
        days_since = (today - datetime.strptime(last, "%Y-%m-%d").date()).days
        due_in = plant["intervalDays"] - days_since
    else:
        due_in = 0  # never watered -> due now
    return {**plant, "dueInDays": due_in, "overdue": due_in < 0, "dueToday": due_in == 0}


def get_plants():
    plants = [{"index": i, **plant_status(p)} for i, p in enumerate(load_plants())]
    plants.sort(key=lambda p: p["dueInDays"])
    return {"items": plants}


def add_plant(name, interval_days):
    name = str(name).strip()[:80]
    interval_days = max(1, min(365, int(interval_days)))
    if not name:
        raise ValueError("Plant name is required")
    plants = load_plants()
    plants.append({"name": name, "intervalDays": interval_days, "lastWatered": None})
    save_plants(plants)
    return get_plants()


def water_plant(index):
    plants = load_plants()
    if not (0 <= index < len(plants)):
        raise ValueError("No such plant")
    plants[index]["lastWatered"] = datetime.now().date().isoformat()
    save_plants(plants)
    return get_plants()


def remove_plant(index):
    plants = load_plants()
    if not (0 <= index < len(plants)):
        raise ValueError("No such plant")
    plants.pop(index)
    save_plants(plants)
    return get_plants()


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

class MirrorHandler(SimpleHTTPRequestHandler):

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def handle_api(self, producer, ttl):
        try:
            self.send_json(cached(self.path, ttl, producer))
        except Exception as exc:
            self.send_json({"error": str(exc)}, status=502)

    def do_GET(self):
        if self.path == "/api/weather":
            self.handle_api(get_weather, ttl=15 * 60)
        elif self.path == "/api/news":
            self.handle_api(get_news, ttl=10 * 60)
        elif self.path == "/api/calendar":
            self.handle_api(get_calendar, ttl=10 * 60)
        elif self.path == "/api/cinema":
            self.handle_api(get_cinema, ttl=3 * 3600)
        elif self.path == "/api/todos":
            self.send_json({"items": get_todos()})
        elif self.path == "/api/plants":
            self.send_json(get_plants())
        else:
            if self.path == "/todo":  # phone-friendly page
                self.path = "/todo.html"
            super().do_GET()

    def read_json_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length))

    def do_POST(self):
        if self.path == "/api/todos":
            try:
                data = self.read_json_body()
                self.send_json({"items": save_todos(data.get("items", []))})
            except Exception as exc:
                self.send_json({"error": str(exc)}, status=400)
        elif self.path == "/api/plants/add":
            try:
                data = self.read_json_body()
                self.send_json(add_plant(data.get("name", ""), data.get("intervalDays", 7)))
            except Exception as exc:
                self.send_json({"error": str(exc)}, status=400)
        elif self.path == "/api/plants/water":
            try:
                data = self.read_json_body()
                self.send_json(water_plant(int(data.get("index", -1))))
            except Exception as exc:
                self.send_json({"error": str(exc)}, status=400)
        elif self.path == "/api/plants/remove":
            try:
                data = self.read_json_body()
                self.send_json(remove_plant(int(data.get("index", -1))))
            except Exception as exc:
                self.send_json({"error": str(exc)}, status=400)
        else:
            self.send_json({"error": "not found"}, status=404)

    def log_message(self, fmt, *args):
        pass  # keep the console quiet


def lan_ip():
    """Best-effort LAN address of this machine (no traffic is actually sent)."""
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return None


def main():
    port = CONFIG.get("port", 8480)
    # lanAccess lets phones on the same Wi-Fi open the dashboard and the
    # /todo page. Set it to false in config.json to keep it laptop-only.
    host = "0.0.0.0" if CONFIG.get("lanAccess", True) else "127.0.0.1"
    handler = partial(MirrorHandler, directory=str(PUBLIC_DIR))
    server = ThreadingHTTPServer((host, port), handler)
    print(f"Home Board running at http://localhost:{port}  (Ctrl+C to stop)")
    if host == "0.0.0.0":
        ip = lan_ip()
        if ip:
            print(f"On your phone (same Wi-Fi): http://{ip}:{port}/todo")
    server.serve_forever()


if __name__ == "__main__":
    main()
