// public/app.js
console.log("✅ app.js carregado");

(() => {
  // ==== Configurações do HUB ====
  const HUB = {
    lat: -22.79999,
    lng: -43.35049,
    radiusKm: 2.0,   // raio permitido
    minAcc: 50       // precisão mínima (m)
  };

  // ==== Seletores ====
  const input = document.querySelector("#driverId");
  const btn = document.querySelector("#btn");
  const statusMsg = document.querySelector("#status");

  if (!input || !btn || !statusMsg) {
    console.warn("⚠️ Elementos #driverId, #btn ou #status não encontrados.");
    return;
  }

  // ==== Utils ====
  const setStatus = (msg, color = "#555") => {
    statusMsg.textContent = msg;
    statusMsg.style.color = color;
  };

  // Haversine
  function distanceKm(lat1, lon1, lat2, lon2) {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  async function getPosition() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  }

  async function doCheckin() {
    const id = (input.value || "").trim();
    if (!id) {
      setStatus("Informe o Driver ID.", "red");
      input.focus();
      return;
    }

    btn.disabled = true;
    setStatus("Solicitando GPS…", "#555");

    let coords;
    try {
      const pos = await getPosition();
      coords = pos.coords;
    } catch (err) {
      console.error("Erro geolocalização:", err);
      setStatus("❌ Permita o acesso à localização e tente novamente.", "red");
      btn.disabled = false;
      return;
    }

    const { latitude: lat, longitude: lng, accuracy: acc } = coords;
    console.log("📍 Local:", { lat, lng, acc });

    if (typeof acc === "number" && acc > HUB.minAcc) {
      setStatus(`Sinal de GPS fraco (${Math.round(acc)}m). Vá para área aberta.`, "red");
      btn.disabled = false;
      return;
    }

    const dist = distanceKm(lat, lng, HUB.lat, HUB.lng);
    console.log("📏 Distância até HUB (km):", dist.toFixed(3));

    if (dist > HUB.radiusKm) {
      setStatus(
        `Fora do perímetro: ${dist.toFixed(2)} km (limite ${HUB.radiusKm} km).`,
        "red"
      );
      btn.disabled = false;
      return;
    }

    setStatus("Enviando check-in…");

    try {
      const resp = await fetch("/api/checkin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id,
          lat,
          lng,
          acc,
          deviceId: "web",
          ua: navigator.userAgent
        })
      });

      let json = {};
      try { json = await resp.json(); } catch {}

      console.log("🔁 /api/checkin =>", resp.status, json);

      if (!resp.ok) {
        // mensagens típicas do seu backend
        const msg = json.msg || `Falha no envio (${resp.status}).`;
        setStatus(`❌ ${msg}`, "red");
      } else {
        setStatus("✅ Check-in realizado com sucesso!", "green");
      }
    } catch (e) {
      console.error(e);
      setStatus("❌ Erro de rede ao enviar.", "red");
    } finally {
      btn.disabled = false;
    }
  }

  // Clique no botão
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    doCheckin();
  });

  // Utilitário para você testar manual no console
  window.__doCheckin = doCheckin;
})();
