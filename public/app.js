// public/app.js
console.log("✅ app.js carregado com sucesso");

// cria/pega um deviceId persistente para identificar o aparelho
function getDeviceId() {
  const KEY = "checkin_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "web-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(KEY, id);
  }
  return id;
}

function $(sel) { return document.querySelector(sel); }

function ensureStatusElement() {
  let el = $("#statusMsg");
  if (!el) {
    el = document.createElement("div");
    el.id = "statusMsg";
    el.style.marginTop = "12px";
    el.style.fontSize = "14px";
    const card = document.querySelector("form, main, .card, .box, body");
    (card || document.body).appendChild(el);
  }
  return el;
}

async function doCheckin() {
  const btn    = document.querySelector('button[type="submit"], button, #btnCheckin');
  const input  = document.querySelector('input[type="text"], input[type="number"], input');
  const status = ensureStatusElement();

  if (!input) {
    alert("Campo de ID não encontrado na página.");
    return;
  }
  const id = (input.value || "").trim();
  if (!id) {
    status.textContent = "Informe o seu ID.";
    status.style.color = "red";
    return;
  }

  // trava o botão
  if (btn) btn.disabled = true;
  status.textContent = "Obtendo localização…";
  status.style.color = "#444";

  // pega a posição
  const getPosition = () =>
    new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve(pos),
        err => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

  try {
    const pos = await getPosition();
    const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
    console.log("📍 Localização:", { lat, lng, acc });

    status.textContent = "Enviando…";

    const resp = await fetch("/api/checkin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id,
        lat,
        lng,
        acc: Math.round(acc ?? 9999),
        deviceId: getDeviceId(),
        ua: navigator.userAgent
      })
    });

    const json = await resp.json().catch(() => ({}));
    console.log("📦 /api/checkin =>", resp.status, json);

    if (!resp.ok || json?.ok === false) {
      // mensagem do servidor (ex.: fora do perímetro, já registrou hoje, etc.)
      throw new Error(json?.msg || `Falha no envio (HTTP ${resp.status})`);
    }

    status.textContent = "✅ Check-in realizado com sucesso!";
    status.style.color = "green";
  } catch (err) {
    console.error("❌ Erro:", err);
    status.textContent = err?.message || "Falha ao obter localização ou enviar.";
    status.style.color = "red";
  } finally {
    if (btn) btn.disabled = false;
  }
}

// liga o botão automaticamente (qualquer botão da tela)
(function wireUp() {
  const btn = document.querySelector('button[type="submit"], button, #btnCheckin');
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      doCheckin();
    });
  } else {
    console.warn("⚠️ Não achei botão na página.");
  }
})();

// também expõe para teste manual no console:
// __doCheckin()
window.__doCheckin = doCheckin;
