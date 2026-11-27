// radio.js: a estação "Rádio" do Radiola (etapa 4).
// Rádios ao vivo do mundo todo (Radio Browser API), grátis e sem chave.
(function (raiz) {
  'use strict';

  const BASE = 'https://de1.api.radio-browser.info/json';

  // Limpa e formata uma rádio da API
  function paraEstacao(r) {
    const favicon = r.favicon && typeof r.favicon === 'string' && r.favicon.startsWith('https://') ? r.favicon : null;
    const generos = typeof r.tags === 'string'
      ? r.tags.split(',').map(t => t.trim()).filter(Boolean).slice(0, 3)
      : [];
    const codec = r.codec ? r.codec.toUpperCase() : '';
    const bitrate = r.bitrate ? r.bitrate + ' kbps' : '';
    const qualidade = [codec, bitrate].filter(Boolean).join(' ');

    return {
      id: 'ra-' + r.stationuuid,
      uuid: r.stationuuid,
      nome: String(r.name || 'Rádio').trim(),
      url: r.url_resolved,
      capaUrl: favicon,
      generos,
      pais: r.country || '',
      qualidade,
      criado: Date.now(),
    };
  }

  // Filtra: tem stationuuid, url_resolved começa com https://; tira repetidas pelo url_resolved; converte
  function tocaveis(lista) {
    if (!Array.isArray(lista)) return [];
    const vistas = new Set();
    const resultado = [];
    for (const r of lista) {
      if (!r || !r.stationuuid || !r.url_resolved || !r.url_resolved.startsWith('https://')) continue;
      if (vistas.has(r.url_resolved)) continue;
      vistas.add(r.url_resolved);
      resultado.push(paraEstacao(r));
    }
    return resultado;
  }

  const url = (caminho, params) => {
    const q = new URLSearchParams(params || {});
    const s = q.toString();
    return BASE + caminho + (s ? '?' + s : '');
  };

  async function pedir(caminho, params) {
    const ctrl = new AbortController();
    const tempo = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(url(caminho, params), { signal: ctrl.signal });
      if (!r.ok) throw new Error('A Rádio respondeu com erro ' + r.status + '.');
      const j = await r.json();
      return tocaveis(j);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('A Rádio demorou demais. Tente de novo.');
      if (e instanceof TypeError) throw new Error('Sem internet (ou o serviço de rádio está fora do ar).');
      throw e;
    } finally { clearTimeout(tempo); }
  }

  const maisOuvidasBrasil = () => pedir('/stations/search', { countrycode: 'BR', order: 'clickcount', reverse: 'true', limit: 40, hidebroken: 'true' });

  // Junta listas de rádios JÁ convertidas, sem repetir (mesmo endereço = mesma rádio)
  function juntar(...listas) {
    const vistas = new Set();
    const saida = [];
    for (const lista of listas) for (const e of lista || []) {
      if (!e || vistas.has(e.url)) continue;
      vistas.add(e.url);
      saida.push(e);
    }
    return saida;
  }

  // Busca pelo NOME e pelo ESTILO ao mesmo tempo ("samba" acha a "Rádio Samba" e as rádios de samba).
  // Se só uma das duas falhar, mostra a outra; se as duas falharem, avisa o motivo.
  async function buscar(texto) {
    const q = String(texto || '').trim().slice(0, 100);
    if (!q) return maisOuvidasBrasil();
    const params = extra => Object.assign({ order: 'clickcount', reverse: 'true', limit: 40, hidebroken: 'true' }, extra);
    const [porNome, porTag] = await Promise.allSettled([
      pedir('/stations/search', params({ name: q })),
      pedir('/stations/search', params({ tag: q.toLowerCase() })),
    ]);
    if (porNome.status === 'rejected' && porTag.status === 'rejected') throw porNome.reason;
    const ok = r => (r.status === 'fulfilled' ? r.value : []);
    return juntar(ok(porNome), ok(porTag)).slice(0, 40);
  }

  // Avisar que a rádio foi tocada (pedido do site, educação) sem esperar resposta
  function contarClique(uuid) {
    if (!uuid) return;
    fetch(BASE + '/url/' + encodeURIComponent(uuid)).catch(() => {});
  }

  const api = { paraEstacao, tocaveis, juntar, maisOuvidasBrasil, buscar, contarClique };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Radio = api;
})(this);
