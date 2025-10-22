(function () {
  const $ = (sel, ctx = document) => ctx.querySelector(sel);

  const form = $('#checkin-form');
  const input = $('#driver-id');
  const btn   = $('#btn-submit');
  const statusEl = $('#status');

  const setStatus = (msg, kind = '') => {
    statusEl.textContent = msg || '';
    statusEl.className = `status ${kind}`;
  };

  // ---- Geolocalização com timeout + fallback
  function getPosition(opts = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não suportada'));
        return;
      }
      const onOk = p => resolve({
        lat:  +p.coords.latitude.toFixed(6),
        lng:  +p.coords.longitude.toFixed(6),
        acc:  Math.round(p.coords.accuracy)
      });
      const onErr = e => reject(e);

      navigator.geolocation.getCurrentPosition(onOk, onErr, {
        enableHighAccuracy: true,
        timeout: opts.timeout ?? 15000,
        maximumAge: opts.maximumAge ?? 0
      });
    });
  }

  async function locate() {
    // 1) veja permissão para mensagens melhores
    try {
      const perm = await navigator.permissions?.query({ name: 'geolocation' });
      if (perm && perm.state === 'denied') {
        throw new Error('Permissão de localização negada no navegador');
      }
    } catch { /* ignora se Permissions API não existir */ }

    // 2) tenta atual
    try {
      return await getPosition({ timeout: 15000, maximumAge: 0 });
    } catch (e1) {
      // 3) fallback para posição em cache recente (até 5 minutos)
      try {
        return await getPosition({ timeout: 5000, maximumAge: 5 * 60 * 1000 });
      } catch (e2) {
        throw e1; // mantém o erro original (mais explicativo)
      }
    }
  }

  async function doCheckin() {
    const id = (input.value || '').trim();
    if (!id) {
      setStatus('Informe seu ID.', 'err');
      input.focus();
      return;
    }

    btn.disabled = true;
    setStatus('Capturando localização…');

    let pos;
    try {
      pos = await locate();
      // Mostra no rodapé para o usuário saber que veio coordenada
      setStatus(`Localização: lat ${pos.lat}, lng ${pos.lng}, precisão ${pos.acc}m`);
    } catch (err) {
      setStatus('Falha ao obter localização. Verifique o GPS/permissão e tente novamente.', 'err');
      btn.disabled = false;
      return;
    }

    // Envia para a Function
    try {
      const resp = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id,
          lat: pos.lat,
          lng: pos.lng,
          acc: pos.acc,
          deviceId: 'web',
          ua: navigator.userAgent
        })
      });

      // Tenta decodificar JSON mesmo com 4xx para exibir a razão
      let json = null;
      try { json = await resp.json(); } catch {}

      if (!resp.ok || !json?.ok) {
        // Mensagem vinda do servidor (ex.: já fez check-in)
        const reason = json?.msg || `Falha no envio (${resp.status})`;
        throw new Error(reason);
      }

      setStatus('✅ Check-in realizado com sucesso!', 'ok');
      input.value = '';
    } catch (err) {
      setStatus(String(err.message || err), 'err');
    } finally {
      btn.disabled = false;
    }
  }

  // Garante que os listeners sejam ligados com o DOM pronto
  document.addEventListener('DOMContentLoaded', () => {
    // pequena proteção: só liga se os elementos existirem
    if (!form || !input || !btn || !statusEl) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      doCheckin();
    });

    // expõe função debug no console, caso precise testar manualmente
    window.__doCheckin = doCheckin;
    console.log('🔧 front-end pronto — clique em “Registrar” ou rode __doCheckin()');
  });
})();
