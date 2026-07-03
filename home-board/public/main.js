/* Home Board dashboard logic: fetch each module on its own interval. */

const REFRESH = {
  weather: 15 * 60 * 1000,
  news: 10 * 60 * 1000,
  calendar: 10 * 60 * 1000,
  cinema: 3 * 3600 * 1000,
  plants: 10 * 60 * 1000,
  todos: 5 * 1000, // picks up edits made from a phone via /todo
  headlineRotate: 10 * 1000,
  filmRotate: 5 * 1000,
};

async function getJSON(url) {
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/* ---------- Ambience (time-of-day background) ---------- */
/* The gradient and overall brightness drift through the day. Colours are
   keyframed by hour and linearly interpolated; the slow shift also keeps
   the pixels from being perfectly static, which helps an old LCD avoid
   image retention. Each stop: [hour, topRGB, bottomRGB, brightness]. */

const AMBIENCE_STOPS = [
  [0,  [8, 9, 15],   [2, 2, 5],    0.70],  // deep night
  [5,  [20, 14, 26], [30, 18, 16], 0.82],  // pre-dawn: plum with a warm base
  [7,  [36, 22, 30], [58, 34, 20], 0.95],  // dawn: amber glow, low
  [10, [16, 21, 34], [22, 28, 42], 1.00],  // morning
  [13, [14, 18, 26], [22, 29, 44], 1.00],  // midday: charcoal -> soft slate blue
  [17, [22, 17, 34], [34, 22, 44], 1.00],  // evening: indigo
  [20, [24, 16, 36], [30, 18, 40], 0.92],  // dusk: dusky purple
  [22, [12, 10, 20], [8, 7, 15],   0.80],  // late evening
  [24, [8, 9, 15],   [2, 2, 5],    0.70],  // wraps back to deep night
];

function lerp(a, b, t) { return a + (b - a) * t; }

function rgb(c) { return `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`; }

function updateAmbience() {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  let lo = AMBIENCE_STOPS[0], hi = AMBIENCE_STOPS[AMBIENCE_STOPS.length - 1];
  for (let i = 0; i < AMBIENCE_STOPS.length - 1; i++) {
    if (hour >= AMBIENCE_STOPS[i][0] && hour <= AMBIENCE_STOPS[i + 1][0]) {
      lo = AMBIENCE_STOPS[i];
      hi = AMBIENCE_STOPS[i + 1];
      break;
    }
  }
  const span = hi[0] - lo[0];
  const t = span > 0 ? (hour - lo[0]) / span : 0;
  const top = [0, 1, 2].map((k) => lerp(lo[1][k], hi[1][k], t));
  const bottom = [0, 1, 2].map((k) => lerp(lo[2][k], hi[2][k], t));
  const brightness = lerp(lo[3], hi[3], t);

  document.body.style.setProperty("--bg-top", rgb(top));
  document.body.style.setProperty("--bg-bottom", rgb(bottom));
  document.body.style.setProperty("--board-brightness", brightness.toFixed(3));
}
updateAmbience();
setInterval(updateAmbience, 60 * 1000);

/* ---------- Clock ---------- */

function updateClock() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  document.getElementById("clock-time").textContent =
    `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  document.getElementById("clock-seconds").textContent = pad(now.getSeconds());
  document.getElementById("clock-date").textContent = now.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}
setInterval(updateClock, 1000);
updateClock();

/* ---------- Weather ---------- */

async function updateWeather() {
  try {
    const w = await getJSON("/api/weather");
    document.getElementById("weather-location").textContent = w.location;
    document.getElementById("weather-icon").textContent = w.icon;
    document.getElementById("weather-temp").textContent = `${w.temperature}${w.unit}`;
    document.getElementById("weather-details").textContent =
      `${w.description} · feels like ${w.feelsLike}${w.unit} · wind ${w.windSpeed} ${w.windUnit}`;

    const rows = w.forecast.map((d, i) => {
      const name = i === 0 ? "Today"
        : new Date(d.date + "T00:00").toLocaleDateString(undefined, { weekday: "short" });
      const rain = d.rainChance != null && d.rainChance >= 20
        ? `<td class="rain">${d.rainChance}%</td>` : "<td></td>";
      return `<tr><td>${name}</td><td>${d.icon}</td>${rain}` +
             `<td>${d.max}°</td><td class="min">${d.min}°</td></tr>`;
    });
    document.getElementById("weather-forecast").innerHTML = rows.join("");
  } catch (err) {
    document.getElementById("weather-details").textContent = `Weather unavailable (${err.message})`;
  }
}

/* ---------- Calendar ---------- */

function dayLabel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const that = new Date(d); that.setHours(0, 0, 0, 0);
  const diff = Math.round((that - today) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

async function updateCalendar() {
  const el = document.getElementById("calendar-list");
  try {
    const cal = await getJSON("/api/calendar");
    if (!cal.configured) {
      el.textContent = "Add your calendar's iCal link in config.json";
      return;
    }
    if (!cal.events.length) {
      el.textContent = "No upcoming events";
      return;
    }
    let html = "", lastDay = "";
    for (const ev of cal.events) {
      const label = dayLabel(ev.start);
      if (label !== lastDay) {
        html += `<div class="cal-day">${label}</div>`;
        lastDay = label;
      }
      const time = ev.allDay ? "all day"
        : new Date(ev.start).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      html += `<div class="cal-event"><span class="cal-title">${escapeHtml(ev.title)}</span>` +
              `<span class="cal-time">${time}</span></div>`;
    }
    el.innerHTML = html;
    el.classList.remove("dimmed");
  } catch (err) {
    el.textContent = `Calendar unavailable (${err.message})`;
  }
}

/* ---------- Plants ---------- */

async function updatePlants() {
  const module = document.getElementById("plants-module");
  try {
    const data = await getJSON("/api/plants");
    const due = data.items.filter((p) => p.dueToday || p.overdue);
    if (!due.length) {
      module.hidden = true;
      return;
    }
    module.hidden = false;
    document.getElementById("plants-list").innerHTML = due.map((p) => {
      const status = p.overdue
        ? `${Math.abs(p.dueInDays)}d overdue`
        : "today";
      return `<li class="${p.overdue ? "overdue" : ""}" data-index="${p.index}">` +
        `<span class="plant-name">${escapeHtml(p.name)}</span>` +
        `<span class="plant-status">${status}</span></li>`;
    }).join("");
  } catch {
    module.hidden = true;
  }
}

document.getElementById("plants-list").addEventListener("click", async (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  await fetch("/api/plants/water", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ index: Number(li.dataset.index) }),
  });
  updatePlants();
});

/* ---------- News ---------- */

let headlines = [];
let headlineIndex = 0;

async function updateNews() {
  try {
    const news = await getJSON("/api/news");
    if (news.headlines.length) headlines = news.headlines;
  } catch (err) {
    headlines = [{ title: `News unavailable (${err.message})`, source: "" }];
  }
}

function rotateHeadline() {
  if (!headlines.length) return;
  const el = document.getElementById("news-headline");
  el.classList.add("fading");
  setTimeout(() => {
    const item = headlines[headlineIndex % headlines.length];
    headlineIndex += 1;
    el.textContent = item.title;
    document.getElementById("news-source").textContent = item.source;
    el.classList.remove("fading");
  }, 600);
}

/* ---------- Cinema ---------- */

let films = [];
let filmIndex = 0;

async function updateCinema() {
  const module = document.getElementById("cinema-module");
  try {
    const cinema = await getJSON("/api/cinema");
    if (!cinema.configured && !cinema.hint) {
      module.hidden = true; // provider "off"
      return;
    }
    module.hidden = false;
    document.getElementById("cinema-name").textContent = cinema.cinemaName || "Cinema";
    if (!cinema.configured) {
      films = [];
      document.getElementById("cinema-film").textContent = cinema.hint;
      document.getElementById("cinema-times").textContent = "";
      return;
    }
    films = cinema.films;
    if (!films.length) {
      document.getElementById("cinema-film").textContent = "No screenings today";
      document.getElementById("cinema-times").textContent = "";
    }
  } catch (err) {
    module.hidden = false;
    films = [];
    document.getElementById("cinema-film").textContent = "Listings unavailable";
    document.getElementById("cinema-times").textContent = err.message;
  }
}

function rotateFilm() {
  if (!films.length) return;
  const rotator = document.getElementById("cinema-rotator");
  rotator.classList.add("fading");
  setTimeout(() => {
    const film = films[filmIndex % films.length];
    filmIndex += 1;
    document.getElementById("cinema-film").textContent = film.title;
    document.getElementById("cinema-times").textContent = film.times.join("  ·  ");
    rotator.classList.remove("fading");
  }, 500);
}

/* ---------- To-do list ---------- */

let todos = [];

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderTodos() {
  const list = document.getElementById("todo-list");
  list.innerHTML = todos.map((t, i) =>
    `<li class="${t.done ? "done" : ""}" data-i="${i}">` +
    `<button title="Remove" data-remove="${i}">✕</button>` +
    `<span class="todo-text">${escapeHtml(t.text)}</span></li>`
  ).join("");
  document.getElementById("todo-empty").hidden = todos.length > 0;
}

async function saveTodos() {
  renderTodos();
  try {
    const resp = await fetch("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: todos }),
    });
    const data = await resp.json();
    if (data.items) {
      todos = data.items;
      renderTodos();
    }
  } catch { /* keep the local list; it will sync on the next change */ }
}

async function loadTodos() {
  try {
    const data = await getJSON("/api/todos");
    todos = data.items || [];
    renderTodos();
  } catch { /* server not ready yet; next interaction retries */ }
}

document.getElementById("todo-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = document.getElementById("todo-input");
  const text = input.value.trim();
  if (!text) return;
  todos.push({ text, done: false });
  input.value = "";
  saveTodos();
});

document.getElementById("todo-list").addEventListener("click", (e) => {
  const removeIndex = e.target.dataset.remove;
  if (removeIndex !== undefined) {
    todos.splice(Number(removeIndex), 1);
  } else {
    const li = e.target.closest("li");
    if (!li) return;
    todos[Number(li.dataset.i)].done = !todos[Number(li.dataset.i)].done;
  }
  saveTodos();
});

/* Show the cursor while the mouse is moving, hide it after a few idle seconds. */
let cursorTimer;
document.addEventListener("mousemove", () => {
  document.body.classList.add("interactive");
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => document.body.classList.remove("interactive"), 4000);
});

/* ---------- Kick everything off ---------- */

updateWeather();
updateCalendar();
updatePlants();
loadTodos();
updateNews().then(rotateHeadline);
updateCinema().then(rotateFilm);

setInterval(updateWeather, REFRESH.weather);
setInterval(updateCalendar, REFRESH.calendar);
setInterval(updatePlants, REFRESH.plants);
setInterval(loadTodos, REFRESH.todos);
setInterval(updateNews, REFRESH.news);
setInterval(updateCinema, REFRESH.cinema);
setInterval(rotateHeadline, REFRESH.headlineRotate);
setInterval(rotateFilm, REFRESH.filmRotate);
