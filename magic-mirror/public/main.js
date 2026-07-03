/* Magic Mirror dashboard logic: fetch each module on its own interval. */

const REFRESH = {
  weather: 15 * 60 * 1000,
  news: 10 * 60 * 1000,
  calendar: 10 * 60 * 1000,
  headlineRotate: 10 * 1000,
};

async function getJSON(url) {
  const resp = await fetch(url);
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data;
}

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
loadTodos();
updateNews().then(rotateHeadline);

setInterval(updateWeather, REFRESH.weather);
setInterval(updateCalendar, REFRESH.calendar);
setInterval(updateNews, REFRESH.news);
setInterval(rotateHeadline, REFRESH.headlineRotate);
