// vitrine.js: estações Vitrine (YouTube, Spotify, Deezer, SoundCloud e Apple Music) do Radiola.
// A pessoa cola um link e o player OFICIAL deles toca dentro da Radiola (o som vem deles).
// Segurança: o endereço do player é montado só com o código já conferido, nunca com o texto colado.
(function (raiz) {
  'use strict';

  const tiposPt = {
    video: 'vídeo',
    playlist: 'playlist',
    track: 'música',
    song: 'música',
    album: 'álbum',
    artist: 'artista',
    episode: 'episódio',
    show: 'podcast'
  };

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

      if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

      // Deezer short link
      // link curto do Deezer (deezer.page.link): não dá para saber a música sem abrir o link.
      // Devolve null e o app explica como copiar o link completo.
      if (host === 'deezer.page.link' || host === 'www.deezer.page.link') return null;

      if (host === 'deezer.com' || host === 'www.deezer.com') {
        const segs = path.split('/').filter(Boolean);
        let pais = null;
        let tipoIdx = 0;
        if (segs.length >= 2 && /^[a-z]{2}$/i.test(segs[0])) {
          pais = segs[0].toLowerCase();
          tipoIdx = 1;
        }
        if (segs.length >= tipoIdx + 2) {
          const tipo = segs[tipoIdx].toLowerCase();
          const codigo = segs[tipoIdx + 1];
          const tiposValidos = ['track', 'album', 'playlist', 'artist', 'episode', 'show'];
          if (tiposValidos.includes(tipo) && /^\d{1,20}$/.test(codigo)) {
            return { fonte: 'deezer', tipo, codigo, lista: null, ...(pais ? { pais } : {}) };
          }
        }
      }

      if (host === 'soundcloud.com' || host === 'www.soundcloud.com' || host === 'm.soundcloud.com') {
        const segs = path.split('/').filter(Boolean);
        if (segs.length === 2 || (segs.length === 3 && segs[1].toLowerCase() === 'sets')) {
          const validoPartes = segs.every(s => /^[A-Za-z0-9_-]{1,100}$/.test(s));
          if (validoPartes) {
            const tipo = segs.length === 3 ? 'playlist' : 'track';
            const codigo = segs.join('/');
            return { fonte: 'soundcloud', tipo, codigo, lista: null };
          }
        }
      }

      if (host === 'music.apple.com') {
        const segs = path.split('/').filter(Boolean);
        if (segs.length >= 4 && /^[a-z]{2}$/i.test(segs[0])) {
          const pais = segs[0].toLowerCase();
          const tipoRaw = segs[1].toLowerCase();
          const tipo = tipoRaw === 'song' ? 'song' : tipoRaw === 'album' ? 'album' : tipoRaw === 'playlist' ? 'playlist' : null;
          const id = segs[3];
          if (tipo && /^[A-Za-z0-9._-]{1,60}$/.test(id)) {
            const iParam = url.searchParams.get('i');
            const lista = iParam && /^\d+$/.test(iParam) ? iParam : null;
            return { fonte: 'apple', tipo, codigo: id, lista, pais };
          }
        }
      }

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
    const lista = item.lista == null || /^[A-Za-z0-9_-]{10,64}$/.test(item.lista) || /^\d+$/.test(item.lista);
    const pais = item.pais == null || /^[a-z]{2}$/.test(item.pais);
    if (!pais || !lista) return false;

    if (item.fonte === 'youtube') {
      if (item.tipo === 'video') return /^[A-Za-z0-9_-]{11}$/.test(item.codigo);
      if (item.tipo === 'playlist') return /^[A-Za-z0-9_-]{10,64}$/.test(item.codigo);
      return false;
    }
    if (item.fonte === 'spotify') {
      return ['track', 'album', 'playlist', 'artist', 'episode', 'show'].includes(item.tipo) && /^[A-Za-z0-9]{22}$/.test(item.codigo);
    }
    if (item.fonte === 'deezer') {
      return ['track', 'album', 'playlist', 'artist', 'episode', 'show'].includes(item.tipo) && /^\d{1,20}$/.test(item.codigo);
    }
    if (item.fonte === 'soundcloud') {
      if (!['track', 'playlist'].includes(item.tipo) || typeof item.codigo !== 'string') return false;
      const partes = item.codigo.split('/');
      if (partes.length !== 2 && partes.length !== 3) return false;
      if (partes.length === 3 && partes[1].toLowerCase() !== 'sets') return false;
      return partes.every(p => /^[A-Za-z0-9_-]{1,100}$/.test(p));
    }
    if (item.fonte === 'apple') {
      return ['song', 'album', 'playlist'].includes(item.tipo) && /^[A-Za-z0-9._-]{1,60}$/.test(item.codigo);
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
    if (item.fonte === 'deezer') {
      return 'https://widget.deezer.com/widget/dark/' + item.tipo + '/' + item.codigo;
    }
    if (item.fonte === 'soundcloud') {
      return 'https://w.soundcloud.com/player/?url=' + encodeURIComponent('https://soundcloud.com/' + item.codigo) + '&visual=false&show_comments=false';
    }
    if (item.fonte === 'apple') {
      return 'https://embed.music.apple.com/' + (item.pais || 'us') + '/' + item.tipo + '/' + item.codigo + (item.lista ? '?i=' + item.lista : '');
    }
    return '';
  }

  // Define a altura do player conforme a fonte e o tipo
  function alturaDoPlayer(item) {
    if (item.fonte === 'spotify') {
      if (item.tipo === 'track' || item.tipo === 'episode') return 152;
      return 352;
    }
    if (item.fonte === 'deezer') {
      if (item.tipo === 'track' || item.tipo === 'episode') return 150;
      return 380;
    }
    if (item.fonte === 'soundcloud') {
      if (item.tipo === 'track') return 166;
      return 400;
    }
    if (item.fonte === 'apple') {
      if (item.tipo === 'song' || item.lista) return 175;
      return 450;
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
    } else if (item.fonte === 'soundcloud') {
      urlNormal = 'https://soundcloud.com/' + item.codigo;
    } else if (item.fonte === 'deezer') {
      return { titulo: 'Deezer: ' + (tiposPt[item.tipo] || item.tipo), autor: '', capa: null };
    } else if (item.fonte === 'apple') {
      // álbum com ?i= é UMA música daquele álbum
      return { titulo: 'Apple Music: ' + (item.lista ? 'música' : (tiposPt[item.tipo] || item.tipo)), autor: '', capa: null };
    } else {
      return { titulo: 'Outro app', autor: '', capa: null };
    }

    const oembedUrl = (item.fonte === 'youtube' ? 'https://www.youtube.com/oembed?format=json&url=' : item.fonte === 'soundcloud' ? 'https://soundcloud.com/oembed?format=json&url=' : 'https://open.spotify.com/oembed?url=') + encodeURIComponent(urlNormal);

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
        titulo: dados.title || (item.fonte === 'youtube' ? 'Vídeo do YouTube' : item.fonte === 'soundcloud' ? 'SoundCloud' : 'Spotify'),
        autor: dados.author_name || '',
        capa
      };
    } catch {
      const prefixo = item.fonte === 'youtube' ? 'YouTube' : item.fonte === 'soundcloud' ? 'SoundCloud' : 'Spotify';
      return {
        titulo: prefixo + ': ' + (tiposPt[item.tipo] || item.tipo),
        autor: '',
        capa: null
      };
    }
  }

  // Cria o objeto para guardar na lista de itens recentes
  function paraItem(link, info) {
    const id = 'vi-' + link.fonte + '-' + link.tipo + '-' + link.codigo + (link.lista ? '-' + link.lista : '') + (link.pais ? '-' + link.pais : '');
    return {
      id,
      fonte: link.fonte,
      tipo: link.tipo,
      codigo: link.codigo,
      lista: link.lista,
      ...(link.pais ? { pais: link.pais } : {}),
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
