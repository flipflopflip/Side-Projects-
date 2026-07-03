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
  // Themed modes (e.g. Pip-Boy) supply their own fixed background.
  if (document.body.dataset.theme && document.body.dataset.theme !== "default") return;
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
    mascotState.weather = w;
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
    if (typeof mascotOnPlantsChange === "function") {
      mascotOnPlantsChange(mascotState.plantsDue, due.length);
    }
    mascotState.plantsDue = due.length;
    mascotState.plantNames = due.map((p) => p.name);
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
    mascotState.film = films.length ? films[0].title : null;
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
  const left = todos.filter((t) => !t.done).length;
  if (mascotState.todosLeft !== null && typeof mascotOnTodosChange === "function") {
    mascotOnTodosChange(mascotState.todosLeft, left);
  }
  mascotState.todosLeft = left;
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

/* ---------- Boardy the mascot ---------- */
/* A bobblehead with opinions. Lines are grouped by situation, chosen from
   whatever the modules last fetched, and he remembers what he said recently
   so he doesn't repeat himself. He gets sleepy late at night, celebrates a
   cleared list, and gets narky if you keep poking him. */

const mascotState = {
  weather: null, todosLeft: null, plantsDue: 0,
  plantNames: [], film: null,
};

const QUIPS = {
  morning: [
    "Mornin'. Kettle on?",
    "Up with it. The day won't start itself.",
    "First one up gets the good mug.",
    "I've been up all night. No eyelids.",
    "Porridge weather, I'd say.",
  ],
  day: [
    "Keeping an eye on things.",
    "All quiet on the western front.",
    "The lough's not going anywhere. Neither am I.",
    "Another busy day of standing here.",
    "If anyone asks, I'm working.",
    "All systems grand.",
  ],
  evening: [
    "Evenin'. All grand here.",
    "That's the day nearly put down.",
    "Feet up soon, I'd say.",
    "Any plans, or is it the couch? The couch. Good call.",
  ],
  night: [
    "Go to bed soon, yeah?",
    "Nothing good happens after midnight. Except me.",
    "I'll keep watch. It's not like I sleep.",
    "Turn off the big light on your way.",
  ],
  smallHours: [
    "You should be asleep.",
    "It's the small hours. Even the fridge is resting.",
    "Whatever it is, it'll keep till morning.",
  ],
  monday: ["Monday. We go again.", "Nobody likes Monday. Not even me, and I'm ornamental."],
  friday: ["Friday. We made it.", "It's Friday somewhere. Here, actually."],
  sunday: ["Sunday. Do nothing with pride.", "A roast would sort this day right out."],
  rain: [
    "Rain on the way. Coat with you.",
    "That sky means business.",
    "Soft day incoming. The good jacket, not the light one.",
    "Umbrella. Trust me, I live beside the forecast.",
  ],
  cold: [
    "Baltic out there. Wrap up.",
    "Two pairs of socks weather.",
    "The lough wind would skin ya today.",
  ],
  hot: [
    "Roasting today. Mind the sun.",
    "Factor 50 and a bit of shade.",
    "Grand drying out — get the washing on the line.",
  ],
  wind: [
    "Wild wind today. Mind the bins.",
    "The bins are in danger. Godspeed, bins.",
  ],
  grandDay: [
    "Grand day out there. Go and look at it.",
    "The weather's behaving itself for once.",
  ],
  todosNone: [
    "Nothing on the list. Suspicious, but well done.",
    "List's empty. Take the win.",
  ],
  todosOne: [
    "One thing left. You can taste victory.",
    "One job left. Go on, finish it.",
  ],
  todosMany: [
    (n) => `${n} things on the list. I believe in you. Mostly.`,
    () => "That list isn't getting shorter by itself.",
    (n) => `${n} left. Chip away at it.`,
  ],
  plants: [
    (name) => `${name} is gasping for water.`,
    () => "Water the plants or I start naming them after you.",
    (name) => `${name} has started giving me looks.`,
  ],
  film: [
    (t) => `${t} is on at the Omniplex.`,
    (t) => `Cinema's an option tonight: ${t}.`,
  ],
  rare: [
    "I've nodded four thousand times today. Who's counting. Me.",
    "Being a bobblehead is mostly cardio.",
    "I saw the mouse. I said nothing.",
    "Someday I'll see the sea. For now, the fridge.",
    "I'm the only one in this house who never loses the remote.",
    "I don't make the news. I just nod at it.",
  ],
  annoyed: [
    "Alright, alright.",
    "You'll wear out the spring.",
    "I'm a mascot, not a stress ball.",
    "Poke the plants instead. They need the attention.",
  ],
  allDone: [
    "That's the lot! Savage stuff.",
    "List cleared. Someone's flying it today.",
  ],
  watered: [
    "The plants thank you. Quietly.",
    "Good on ya. The basil lives to fight another day.",
  ],
};

/* Special dates trump everything else for the day */
function seasonalQuip() {
  const now = new Date();
  const m = now.getMonth() + 1, d = now.getDate();
  if (m === 12 && d >= 24 && d <= 26) return "Nollaig shona. Mind the selection boxes.";
  if (m === 12 && d === 31) return "Last day of the year. I'll nod it out.";
  if (m === 1 && d === 1) return "New year. Same me. Better you, maybe.";
  if (m === 3 && d === 17) return "Lá fhéile Pádraig! I'd wear green but I'm committed to amber.";
  if (m === 10 && d === 31) return "Spooky season. I'm going as a nodding robot.";
  return null;
}

const recentQuips = [];
function pickFrom(pool, arg) {
  const resolved = pool.map((q) => (typeof q === "function" ? q(arg) : q));
  const fresh = resolved.filter((q) => !recentQuips.includes(q));
  const choice = (fresh.length ? fresh : resolved)[
    Math.floor(Math.random() * (fresh.length ? fresh.length : resolved.length))];
  recentQuips.push(choice);
  if (recentQuips.length > 5) recentQuips.shift();
  return choice;
}

function chooseQuip() {
  const seasonal = seasonalQuip();
  if (seasonal && Math.random() < 0.35) return seasonal;
  if (Math.random() < 0.10) return pickFrom(QUIPS.rare);

  // Gather every pool that applies right now, pick one pool, then one line.
  const pools = [];
  const now = new Date();
  const hour = now.getHours(), day = now.getDay();
  if (hour < 6) pools.push([QUIPS.smallHours]);
  else if (hour < 10) pools.push([QUIPS.morning]);
  else if (hour < 17) pools.push([QUIPS.day]);
  else if (hour < 22) pools.push([QUIPS.evening]);
  else pools.push([QUIPS.night]);
  if (day === 1 && hour < 12) pools.push([QUIPS.monday]);
  if (day === 5 && hour >= 12) pools.push([QUIPS.friday]);
  if (day === 0) pools.push([QUIPS.sunday]);

  const w = mascotState.weather;
  if (w) {
    const today = w.forecast && w.forecast[0];
    if (today && today.rainChance >= 60) pools.push([QUIPS.rain]);
    if (w.temperature <= 3) pools.push([QUIPS.cold]);
    if (w.temperature >= 23) pools.push([QUIPS.hot]);
    if (w.windSpeed >= 40) pools.push([QUIPS.wind]);
    if (today && today.rainChance < 30 && w.temperature >= 15 && w.temperature < 23) {
      pools.push([QUIPS.grandDay]);
    }
  }
  if (mascotState.todosLeft === 0) pools.push([QUIPS.todosNone]);
  else if (mascotState.todosLeft === 1) pools.push([QUIPS.todosOne]);
  else if (mascotState.todosLeft >= 2) pools.push([QUIPS.todosMany, mascotState.todosLeft]);
  if (mascotState.plantsDue > 0) pools.push([QUIPS.plants, mascotState.plantNames[0] || "A plant"]);
  if (mascotState.film && hour >= 12) pools.push([QUIPS.film, mascotState.film]);

  const [pool, arg] = pools[Math.floor(Math.random() * pools.length)];
  return pickFrom(pool, arg);
}

function mascotSay(text, excitement = 1700) {
  const mascot = document.getElementById("mascot");
  if (mascot.hidden) return;
  const bubble = document.getElementById("mascot-bubble");
  bubble.textContent = text;
  bubble.classList.add("show");
  mascot.classList.add("excited");
  clearTimeout(mascotSay.hideTimer);
  clearTimeout(mascotSay.calmTimer);
  mascotSay.calmTimer = setTimeout(() => mascot.classList.remove("excited"), excitement);
  const readTime = Math.min(14000, 7000 + text.length * 60);
  mascotSay.hideTimer = setTimeout(() => bubble.classList.remove("show"), readTime);
}

function mascotSpeak() { mascotSay(chooseQuip()); }

/* Celebrations: react the moment the list is cleared or plants are watered */
function mascotOnTodosChange(before, after) {
  if (before > 0 && after === 0) mascotSay(pickFrom(QUIPS.allDone), 3500);
}
function mascotOnPlantsChange(before, after) {
  if (before > 0 && after === 0) mascotSay(pickFrom(QUIPS.watered), 3000);
}

/* Sleepy after 11pm: droopy lids and a slower, deeper nod */
function mascotMood() {
  const hour = new Date().getHours();
  document.getElementById("mascot").classList.toggle("sleepy", hour >= 23 || hour < 6);
}
mascotMood();
setInterval(mascotMood, 60 * 1000);

/* Poke him too much and he lets you know */
let pokes = [];
document.getElementById("mascot").addEventListener("click", () => {
  const now = Date.now();
  pokes = pokes.filter((t) => now - t < 6000);
  pokes.push(now);
  if (pokes.length >= 3) mascotSay(pickFrom(QUIPS.annoyed), 600);
  else mascotSpeak();
});

setTimeout(mascotSpeak, 5 * 1000);       // first hello shortly after load
setInterval(mascotSpeak, 50 * 1000);     // then a fresh quip just under the minute

/* ---------- Display mode ---------- */
/* Applies server-side presentation settings: hides the "add a task" box when
   the board is read-only (changes come from the phone), and switches theme. */
async function applyDisplayMode() {
  try {
    const cfg = await getJSON("/api/config");
    if (cfg.displayEditable === false) {
      const form = document.getElementById("todo-form");
      if (form) form.hidden = true;
    }
    document.body.dataset.theme = cfg.theme || "default";
    document.getElementById("mascot").hidden = cfg.mascot === false;
  } catch { /* default to showing the input */ }
}
setInterval(applyDisplayMode, 30 * 1000); // picks up theme changes from Settings

/* ---------- Kick everything off ---------- */

applyDisplayMode();
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
