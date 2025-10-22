// Cloudflare Pages Functions - /api/checkin (POST)
const makeCors = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });

export const onRequestOptions = async () => makeCors({}, 204);

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // m
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const normId = (v) =>
  String(v ?? "")
    .replace(/[^\dA-Za-z]/g, "")
    .trim();

export const onRequestPost = async ({ request, env }) => {
  // ======= CONFIG DO HUB (fixa no código) =======
  const LAT_BASE = -22.79999;
  const LNG_BASE = -43.35049;
  const MAX_DIST_METERS = 2000; // 2 km
  const MIN_ACCURACY_OK = parseFloat(env.MIN_ACCURACY_OK ?? "60"); // m (pode ajustar em Variáveis do Pages)

  // ======= SUPABASE (opcional, mas recomendado) =======
  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_KEY;

  // valida config mínima
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    // continua validando, só não vai salvar no DB
    console.warn("[checkin] SUPABASE não configurado. Apenas validando geofence.");
  }

  let json;
  try {
    json = await request.json();
  } catch {
    return makeCors({ ok: false, msg: "JSON inválido." }, 400);
  }

  const id = normId(json.id);
  const lat = parseFloat(json.lat);
  const lng = parseFloat(json.lng);
  const acc = parseFloat(String(json.acc ?? "").replace("m", "")); // vem '13.2m' às vezes
  const deviceId = String(json.deviceId ?? "");
  const ua = String(json.ua ?? "");

  if (!id) return makeCors({ ok: false, msg: "ID não informado." }, 400);
  if (!Number.isFinite(lat) || !Number.isFinite(lng))
    return makeCors({ ok: false, msg: "Localização inválida." }, 400);

  // valida precisão
  if (Number.isFinite(acc) && acc > MIN_ACCURACY_OK) {
    return makeCors(
      { ok: false, msg: "Sinal de GPS fraco. Vá para área aberta." },
      400
    );
  }

  // distancia até a base
  const distance = Math.round(haversineMeters(lat, lng, LAT_BASE, LNG_BASE));
  const inside = distance <= MAX_DIST_METERS;

  if (!inside) {
    return makeCors(
      {
        ok: false,
        msg: `Fora do perímetro (distância ${distance}m > ${MAX_DIST_METERS}m).`,
        distance,
      },
      403
    );
  }

  // --- opcional: grava no Supabase e impede duplicidade diária ---
  let saved = false;
  try {
    if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/checkins`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          id,
          lat,
          lng,
          acc,
          distance_m: distance,
          inside,
          device_id: deviceId || null,
          user_agent: ua || null,
          created_at: new Date().toISOString(),
        }),
      });

      if (!resp.ok) {
        // Se você configurou RLS para impedir 2 check-ins/dia por id, pode cair aqui com 403/409
        const err = await resp.text();
        console.error("[Supabase insert ERRO]", resp.status, err);
        if (resp.status === 409 || resp.status === 403) {
          return makeCors(
            { ok: false, msg: "Este ID já realizou check-in hoje." },
            403
          );
        }
        throw new Error(`Supabase falhou: ${resp.status}`);
      }
      saved = true;
    }
  } catch (e) {
    console.error("[checkin] falha ao gravar:", e);
    // Não bloqueia se só quer validar perímetro; comente a linha abaixo se preferir seguir mesmo sem DB
    // return makeCors({ ok: false, msg: "Falha ao salvar o check-in." }, 500);
  }

  return makeCors({
    ok: true,
    msg: "Check-in registrado com sucesso!",
    id,
    distance,
    saved,
  });
};
