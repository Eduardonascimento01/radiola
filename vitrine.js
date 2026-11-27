// vitrine.js: estações Vitrine (YouTube e Spotify) do Radiola (etapa 5).
// A pessoa cola um link e o player OFICIAL deles toca dentro da Radiola (o som vem deles).
// Segurança: o endereço do player é montado só com o código já conferido, nunca com o texto colado.
(function (raiz) {
  'use strict';

  // Recebe um link colado e devolve os dados se for válido, ou null
  function lerLink(texto) {
    if (!texto || typeof texto !== 'string') return null;
    texto = texto.trim();
    if (!texto) return null;

    // Spotify URI (spotify:tipo:id)
    const uriMatch = texto.match(/^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]{22})$/i);
    if (uriMatch) {
      return { fonte: 'spotify', tipo: uriMatch[1].toLowerCase(), codigo: uriMatch[2], lista: null };
    }

    try {
      const url = new URL(texto);
      const host = url.hostname.toLowerCase();
      const path = url.pathname;

      // endereço EXATO: "youtube.com.site-falso.net" não passa
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
      if (host === 'youtu.be' || host === 'www.youtu.be') {
        const codigo = path.slice(1);
        if (/^[A-Za-z0-9_-]{11}$/.test(codigo)) {
          return { fonte: 'youtube', tipo: 'video', codigo, lista: null };
        }
      }

      if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
        const v = url.searchParams.get('v');
        const list = url.searchParams.get('list');
        const lista = list && /^[A-Za-z0-9_-]{10,64}$/.test(list) ? list : null;

        if (path === '/watch' && v && /^[A-Za-z0-9_-]{11}$/.test(v)) {
          return { fonte: 'youtube', tipo: 'video', codigo: v, lista };
        }
        if (path === '/playlist') {
          const codigo = url.searchParams.get('list');
          if (codigo && /^[A-Za-z0-9_-]{10,64}$/.test(codigo)) {
            return { fonte: 'youtube', tipo: 'playlist', codigo, lista: null };
          }
        }
        if (path.startsWith('/shorts/') || path.startsWith('/embed/')) {
          const codigo = path.split('/')[2];
          if (codigo && /^[A-Za-z0-9_-]{11}$/.test(codigo)) {
            return { fonte: 'youtube', tipo: 'video', codigo, lista };
          }
        }
      }

      if (host === 'open.spotify.com') {
        const segmentos = path.split('/').filter(Boolean);
        if (segmentos[0] && segmentos[0].startsWith('intl-')) {
          segmentos.shift();
        }
        if (segmentos.length >= 2) {
          const tipo = segmentos[0].toLowerCase();
          const codigo = segmentos[1];
          const tiposValidos = ['track', 'album', 'playlist', 'artist', 'episode', 'show'];
          if (tiposValidos.includes(tipo) && /^[A-Za-z0-9]{22}$/.test(codigo)) {
            return { fonte: 'spotify', tipo, codigo, lista: null };
          }
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  // Confere um item guardado no aparelho antes de usar (código e tipo no formato certo)
  function valido(item) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string') return false;
    const lista = item.lista == null || /^[A-Za-z0-9_-]{10,64}$/.test(item.lista);
    if (item.fonte === 'youtube') {
      if (item.tipo === 'video') return /^[A-Za-z0-9_-]{11}$/.test(item.codigo) && lista;
      if (item.tipo === 'playlist') return /^[A-Za-z0-9_-]{10,64}$/.test(item.codigo);
      return false;
    }
    if (item.fonte === 'spotify') {
      return ['track', 'album', 'playlist', 'artist', 'episode', 'show'].includes(item.tipo) && /^[A-Za-z0-9]{22}$/.test(item.codigo);
    }
    return false;
  }

  // Monta o endereço do iframe para o player oficial
  function enderecoDoPlayer(item) {
    if (item.fonte === 'youtube') {
      if (item.tipo === 'playlist') {
        return 'https://www.youtube-nocookie.com/embed/videoseries?list=' + item.codigo;
      }
      return 'https://www.youtube-nocookie.com/embed/' + item.codigo + (item.lista ? '?list=' + item.lista : '');
    }
    if (item.fonte === 'spotify') {
      return 'https://open.spotify.com/embed/' + item.tipo + '/' + item.codigo;
    }
    return '';
  }

  // Define a altura do player conforme a fonte e o tipo
  function alturaDoPlayer(item) {
    if (item.fonte === 'spotify') {
      if (item.tipo === 'track' || item.tipo === 'episode') return 152;
      return 352;
    }
    return null; // YouTube usa o CSS com proporção 16:9
  }

  // Busca o título, autor e capa usando oEmbed (com limite de tempo de 10 s)
  async function buscarInfo(item) {
    let urlNormal = '';
    if (item.fonte === 'youtube') {
      if (item.tipo === 'playlist') {
        urlNormal = 'https://www.youtube.com/playlist?list=' + item.codigo;
      } else {
        urlNormal = 'https://www.youtube.com/watch?v=' + item.codigo + (item.lista ? '&list=' + item.lista : '');
      }
    } else if (item.fonte === 'spotify') {
      urlNormal = 'https://open.spotify.com/' + item.tipo + '/' + item.codigo;
    } else {
      return { titulo: item.fonte === 'youtube' ? 'Vídeo do YouTube' : 'Spotify', autor: '', capa: null };
    }

    const oembedUrl = (item.fonte === 'youtube' ? 'https://www.youtube.com/oembed?format=json&url=' : 'https://open.spotify.com/oembed?url=') + encodeURIComponent(urlNormal);

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const res = await fetch(oembedUrl, { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error();
      const dados = await res.json();
      let capa = dados.thumbnail_url;
      if (!capa || typeof capa !== 'string' || !capa.startsWith('https://')) capa = null;
      return {
        titulo: dados.title || (item.fonte === 'youtube' ? 'Vídeo do YouTube' : 'Spotify'),
        autor: dados.author_name || '',
        capa
      };
    } catch {
      return {
        titulo: item.fonte === 'youtube' ? 'Vídeo do YouTube' : 'Spotify',
        autor: '',
        capa: null
      };
    }
  }

  // Cria o objeto para guardar na lista de itens recentes
  function paraItem(link, info) {
    const id = 'vi-' + link.fonte + '-' + link.codigo + (link.lista ? '-' + link.lista : '');
    return {
      id,
      fonte: link.fonte,
      tipo: link.tipo,
      codigo: link.codigo,
      lista: link.lista,
      titulo: info.titulo,
      autor: info.autor,
      capa: info.capa,
      criado: Date.now()
    };
  }

  const api = {
    lerLink,
    valido,
    enderecoDoPlayer,
    alturaDoPlayer,
    buscarInfo,
    paraItem
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Vitrine = api;
})(typeof window !== 'undefined' ? window : global);
