// archive.js: a estação "Archive" do Radiola (etapa 8).
// O Internet Archive (archive.org) é uma biblioteca enorme e legal de música livre.
// Toca a música inteira, sem anúncio e sem chave.
(function (raiz) {
  'use strict';

  function montarBusca(texto) {
    // tira os sinais especiais da busca do Archive ( ) [ ] { } : " \ ^ ~ * ? ! / + -: "( samba" quebraria a busca
    const limpo = String(texto || '').replace(/[()[\]{}:"\\^~*?!/+-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
    const q = limpo || 'brasil OR samba OR bossa';
    const query = `(${q}) AND mediatype:audio AND collection:(netlabels OR etree OR audio_music OR opensource_audio OR 78rpm OR georgeblood)`;
    const params = new URLSearchParams();
    params.append('q', query);
    params.append('fl[]', 'identifier');
    params.append('fl[]', 'title');
    params.append('fl[]', 'creator');
    params.append('fl[]', 'year');
    params.append('sort[]', 'downloads desc');
    params.append('rows', '30');
    params.append('output', 'json');
    return 'https://archive.org/advancedsearch.php?' + params.toString();
  }

  function paraAlbum(doc) {
    const t = doc.title;
    const titulo = Array.isArray(t) ? (t[0] || 'Sem título') : (t || 'Sem título');
    const c = doc.creator;
    const artista = Array.isArray(c) ? (c[0] || '') : (c || '');
    const identifier = doc.identifier || '';
    return {
      id: 'ia-' + identifier,
      identifier,
      titulo: String(titulo).trim(),
      artista: String(artista).trim(),
      ano: doc.year || '',
      capaUrl: identifier ? 'https://archive.org/services/img/' + identifier : null,
    };
  }

  function converterDuracao(len) {
    if (!len) return 0;
    if (typeof len === 'number') return Math.round(len);
    const str = String(len).trim();
    if (str.includes(':')) {
      const partes = str.split(':');
      if (partes.length === 2) {
        const m = parseInt(partes[0], 10) || 0;
        const s = parseInt(partes[1], 10) || 0;
        return m * 60 + s;
      }
      if (partes.length === 3) {
        const h = parseInt(partes[0], 10) || 0;
        const m = parseInt(partes[1], 10) || 0;
        const s = parseInt(partes[2], 10) || 0;
        return h * 3600 + m * 60 + s;
      }
    }
    const n = Number(str);
    return isNaN(n) ? 0 : Math.round(n);
  }

  function nomeSemExtensao(nome) {
    return String(nome || '').replace(/\.[^/.]+$/, '');
  }

  function musicasDoAlbum(meta, album) {
    const files = (meta && Array.isArray(meta.files)) ? meta.files : [];
    const validos = files.filter(f => {
      if (!f || !f.name) return false;
      const nome = f.name;
      if (nome.includes('_spectrogram') || nome.includes('_sample')) return false;
      const fmt = String(f.format || '').toLowerCase();
      const ext = nome.split('.').pop().toLowerCase();
      const ehMp3 = fmt.includes('mp3') || ext === 'mp3';
      const ehOgg = fmt.includes('ogg') || ext === 'ogg';
      const ehAudio = ehMp3 || ehOgg || fmt.includes('audio') || ['wav', 'flac', 'm4a', 'aac', 'opus'].includes(ext);
      return ehAudio;
    });

    const temMp3 = validos.some(f => {
      const fmt = String(f.format || '').toLowerCase();
      const ext = f.name.split('.').pop().toLowerCase();
      return fmt.includes('mp3') || ext === 'mp3';
    });

    let filtrados = validos.filter(f => {
      const fmt = String(f.format || '').toLowerCase();
      const ext = f.name.split('.').pop().toLowerCase();
      const ehMp3 = fmt.includes('mp3') || ext === 'mp3';
      const ehOgg = fmt.includes('ogg') || ext === 'ogg';
      if (temMp3) return ehMp3;
      return ehOgg || !ehMp3;
    });
    // O Archive costuma guardar a MESMA música em vários MP3 ("01 Abertura.mp3" em "VBR MP3" e
    // "01 Abertura_64kb.mp3" em "64Kbps MP3"). Juntamos pelo nome sem o "_64kb"/"_vbr" e sem a extensão,
    // e fica só a versão de melhor qualidade de cada música (senão cada uma aparece repetida).
    // Músicas DIFERENTES em formatos diferentes continuam todas.
    const ORDEM = ['vbr mp3', '320kbps mp3', '256kbps mp3', '192kbps mp3', '160kbps mp3', '128kbps mp3', 'mp3', '96kbps mp3', '64kbps mp3', '32kbps mp3'];
    const nota = f => { const i = ORDEM.indexOf(String(f.format || '').toLowerCase()); return i < 0 ? 50 : i; };
    const chave = f => nomeSemExtensao(f.name).replace(/_(\d+kb|vbr|sample)$/i, '').toLowerCase();
    const melhorDe = new Map();
    for (const f of filtrados) {
      const k = chave(f), ja = melhorDe.get(k);
      if (!ja || nota(f) < nota(ja)) melhorDe.set(k, f);
    }
    filtrados = [...melhorDe.values()];

    filtrados.sort((a, b) => {
      const ta = parseInt(a.track, 10) || 9999;
      const tb = parseInt(b.track, 10) || 9999;
      if (ta !== tb) return ta - tb;
      return String(a.name).localeCompare(String(b.name));
    });

    return filtrados.map(f => {
      const titulo = String(f.title || nomeSemExtensao(f.name)).trim();
      const artista = String(f.creator || f.artist || album.artista || '').trim();
      const duracao = converterDuracao(f.length);
      return {
        id: 'ia-' + album.identifier + '-' + f.name,
        fonte: 'archive',
        identifier: album.identifier,
        arquivo: f.name,
        titulo: titulo || 'Sem título',
        artista,
        album: album.titulo,
        duracao,
        capaUrl: album.capaUrl,
        capaPequena: album.capaUrl,
        link: 'https://archive.org/details/' + album.identifier,
        criado: Date.now(),
      };
    });
  }

  function enderecoDoSom(m) {
    return 'https://archive.org/download/' + encodeURIComponent(m.identifier) + '/' + encodeURIComponent(m.arquivo);
  }

  async function pedir(url) {
    const ctrl = new AbortController();
    const tempo = setTimeout(() => ctrl.abort(), 12000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error('O Internet Archive respondeu com erro ' + r.status + '.');
      return await r.json();
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('O Internet Archive demorou demais. Tente de novo.');
      if (e instanceof TypeError) throw new Error('Sem internet (ou o Internet Archive está fora do ar).');
      throw e;
    } finally { clearTimeout(tempo); }
  }

  async function buscarAlbuns(texto) {
    const j = await pedir(montarBusca(texto));
    const docs = (j && j.response && Array.isArray(j.response.docs)) ? j.response.docs : [];
    return docs.map(paraAlbum);
  }

  async function abrirAlbum(album) {
    const j = await pedir('https://archive.org/metadata/' + encodeURIComponent(album.identifier));
    return musicasDoAlbum(j, album);
  }

  const api = { montarBusca, paraAlbum, musicasDoAlbum, enderecoDoSom, buscarAlbuns, abrirAlbum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Archive = api;
})(this);
