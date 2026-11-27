// audius.js: a estação "Audius" do Radiola (etapa 2).
// O Audius é uma rede aberta de música: artistas independentes publicam lá
// e qualquer app pode buscar e tocar a música INTEIRA, de graça, sem chave.
// A API pede só um "app_name" (o nome do nosso app) em cada pedido.
(function (raiz) {
  'use strict';

  const BASE = 'https://api.audius.co/v1';
  const APP = 'radiola';

  // Transforma a resposta do Audius numa música da nossa fila (o mesmo formato das MP3 do aparelho,
  // só que no lugar do arquivo guarda o número da faixa, para tocar pela internet)
  function paraMusica(t) {
    const arte = t.artwork || {};
    return {
      id: 'au-' + t.id,
      fonte: 'audius',
      trackId: t.id,
      titulo: String(t.title || 'Sem nome').trim(),
      artista: String((t.user && t.user.name) || '').trim(),
      album: '',
      genero: t.genre || '',
      duracao: Number(t.duration) || 0,
      capaUrl: arte['480x480'] || arte['150x150'] || null,
      capaPequena: arte['150x150'] || arte['480x480'] || null,
      link: t.permalink ? 'https://audius.co' + t.permalink : 'https://audius.co',
      criado: Date.now(),
    };
  }

  // Só as faixas que o artista deixou tocar (algumas são exclusivas ou pagas)
  const tocaveis = lista => (Array.isArray(lista) ? lista : []).filter(t => t && t.id && t.is_streamable !== false && !t.is_delete);

  const url = (caminho, params) => {
    const q = new URLSearchParams(Object.assign({ app_name: APP }, params || {}));
    return BASE + caminho + '?' + q.toString();
  };

  // Endereço que o <audio> toca (o Audius redireciona para o servidor que tem o arquivo)
  const enderecoDoSom = trackId => url('/tracks/' + encodeURIComponent(trackId) + '/stream');

  async function pedir(caminho, params) {
    const ctrl = new AbortController();
    const tempo = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(url(caminho, params), { signal: ctrl.signal });
      if (!r.ok) throw new Error('O Audius respondeu com erro ' + r.status + '.');
      const j = await r.json();
      return tocaveis(j && j.data).map(paraMusica);
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('O Audius demorou demais. Tente de novo.');
      if (e instanceof TypeError) throw new Error('Sem internet (ou o Audius está fora do ar).');
      throw e;
    } finally { clearTimeout(tempo); }
  }

  const buscar = texto => pedir('/tracks/search', { query: String(texto || '').slice(0, 100) });
  const emAlta = () => pedir('/tracks/trending', { limit: 20 });

  const api = { paraMusica, tocaveis, enderecoDoSom, buscar, emAlta };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Audius = api;
})(this);
