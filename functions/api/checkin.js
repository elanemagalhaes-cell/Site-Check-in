// functions/api/checkin.js
// Cloudflare Pages Functions (runtime edge)

const toRad = (deg) => (deg * Math.PI) / 180;
const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });

export const onRequestOptions = async () => json({}, 204);

export const onRequestPost = async ({ request, env }) => {
  try {
    // --- ENV obrigatórias ---
    const SUPABASE_URL = env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;

    // Coordenadas do HUB (Maps) e raio
    const LAT_BASE = parseFloat(env.LAT_BASE ?? "-22.79999");     // HUB lat
    const LNG_BASE = parseFloat(env.LNG_BASE ?? "-43.35049");     // HUB lng
    const RADIUS_KM = parseFloat(env.RADIUS_KM ?? "2");           // 2 km
    const MIN_ACCURACY_OK = parseFloat(env.MIN_ACCURACY_OK ?? "60"); // em metros

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return json({ ok: false, msg: "Config do servidor ausente." }, 500);
    }

    // --- corpo da requisição ---
    const { id, lat, lng, acc, deviceId, ua } = await request.json().catch(() => ({}));

    if (!id) return json({ ok: false, msg: "ID não informado." }, 400);
    if (typeof lat !== "number" || typeof lng !== "number") {
      return json({ ok: false, msg: "Localização inválida." }, 400);
    }

    // Precisão do GPS
    if (typeof acc === "number" && acc > MIN_ACCURACY_OK) {
      return json(
        { ok: false, msg: "Sinal de GPS fraco. Vá para área aberta." },
        400
      );
    }

    // Distância até o HUB
    const distKm = haversineKm(lat, lng, LAT_BASE, LNG_BASE);
    const dentro = distKm <= RADIUS_KM;

    if (!dentro) {
      return json(
        {
          ok: false,
          msg: `Fora do perímetro (dist=${distKm.toFixed(3)} km, limite=${RADIUS_KM} km).`,
        },
        403
      );
    }

    // (opcional) Bloquear check-in repetido no mesmo dia
    // Busca mínima (pode adaptar ao seu schema)
    const hoje0 = new Date();
    hoje0.setHours(0, 0, 0, 0);
    const fromISO = hoje0.toISOString();

    const qDup = new URL(`${SUPABASE_URL}/rest/v1/checkins`);
    qDup.searchParams.set("select", "id");
    qDup.searchParams.set("id", `eq.${id}`);
    qDup.searchParams.set("created_at", `gte.${fromISO}`);

    const dupResp = await fetch(qDup, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "content-type": "application/json",
        prefer: "count=exact",
      },
    });

    if (!dupResp.ok) {
      // apenas log
      console.warn("dupResp fail", dupResp.status);
    } else {
      const items = await dupResp.json();
      if (Array.isArray(items) && items.length > 0) {
        return json({ ok: false, msg: "Este ID já realizou check-in hoje." }, 403);
      }
    }

    // Inserção no Supabase via REST
    const insertResp = await fetch(`${SUPABASE_URL}/rest/v1/checkins`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify([
        {
          id,
          lat,
          lng,
          acc,
          device_id: deviceId ?? null,
          user_agent: ua ?? null,
          distance_km: distKm,
          created_at: new Date().toISOString(),
        },
      ]),
    });

    const body = await insertResp.json().catch(() => ({}));
    if (!insertResp.ok) {
      return json(
        { ok: false, msg: "Erro ao gravar no banco.", detail: body },
        500
      );
    }

    return json({
      ok: true,
      msg: "Check-in registrado com sucesso!",
      dist_km: Number(distKm.toFixed(3)),
    });
  } catch (err) {
    return json({ ok: false, msg: String(err?.message || err) }, 500);
  }
};
