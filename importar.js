// importar.js: importar listas de outros apps (Spotify, YouTube, CSV, Texto) no Radiola (etapa 6).
// Lê a lista, procura cada música no Audius (onde toca inteira) e diz o que achou.
(function (raiz) {
  'use strict';

  const Vitrine = raiz.Vitrine || (typeof require !== 'undefined' ? require('./vitrine.js') : null);
  const Audius = raiz.Audius || (typeof require !== 'undefined' ? require('./audius.js') : null);

  // Normaliza texto para comparações (minúsculas, sem acentos, só letras, números e espaços)
  function normalizar(t) {
    if (!t || typeof t !== 'string') return '';
    return t
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Tira lixo comum de títulos de música
  function limparTitulo(t) {
    if (!t || typeof t !== 'string') return '';
    return t
      .replace(/\s*-\s*(Remastered.*|Remaster.*|Live.*|Radio Edit.*|Original Mix.*)/gi, '')
      .replace(/\s*[\(\[].*?(official|video|audio|lyrics|lyric|remaster|live|ao vivo|version|feat|ft\.|\b4k\b).*?[\]\)]/gi, '')
      .replace(/\s*ft\..*/gi, '')
      .replace(/\s*feat\..*/gi, '')
      .replace(/\s*\|.*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Separa artista e título de vídeos do YouTube
  function separarYoutube(titulo, canal) {
    titulo = String(titulo || '').trim();
    canal = String(canal || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();

    let artista = '';
    let musica = titulo;

    musica = limparTitulo(musica);

    if (musica.includes(' - ')) {
      const partes = musica.split(' - ');
      artista = partes[0].trim();
      musica = partes.slice(1).join(' - ').trim();
    } else if (canal) {
      artista = canal;
    }

    return { artista, musica };
  }

  // Calcula quão parecido dois textos são (0 a 1)
  function parecido(a, b) {
    const normA = normalizar(a);
    const normB = normalizar(b);
    if (!normA || !normB) return 0;
    if (normA === normB) return 1;

    const palavrasA = new Set(normA.split(' ').filter(p => p.length > 1));
    const palavrasB = new Set(normB.split(' ').filter(p => p.length > 1));
    if (palavrasA.size === 0 || palavrasB.size === 0) return 0;

    let comun = 0;
    for (const p of palavrasA) {
      if (palavrasB.has(p)) comun++;
    }
    const total = new Set([...palavrasA, ...palavrasB]).size;
    return total === 0 ? 0 : comun / total;
  }

  // Escolhe a melhor música entre os candidatos do Audius
  function escolher(procurado, candidatos) {
    if (!procurado || !Array.isArray(candidatos) || !candidatos.length) return null;
    const procTitulo = limparTitulo(procurado.titulo || '');
    const procArtista = normalizar(procurado.artista || '');

    let melhor = null;
    let maiorNota = 0;

    for (const c of candidatos) {
      const cTitulo = limparTitulo(c.titulo || '');
      const cArtista = normalizar(c.artista || '');

      const notaTitulo = parecido(procTitulo, cTitulo);
      let nota = notaTitulo;

      if (procArtista) {
        const notaArtista = parecido(procArtista, cArtista);
        nota = 0.7 * notaTitulo + 0.3 * notaArtista;
      }

      if (nota > maiorNota) {
        maiorNota = nota;
        melhor = c;
      }
    }

    return maiorNota >= 0.6 ? melhor : null;
  }

  // Colunas do CSV reconhecidas pelo nome exato (sem acento, minúsculas).
  // "Artist URI(s)" do Exportify NÃO é o artista: por isso não dá para aceitar "qualquer coluna que contém artist".
  const COL_TITULO = ['track name', 'name', 'title', 'song', 'nome', 'musica', 'titulo'];
  const COL_ARTISTA = ['artist name(s)', 'artist names', 'artist name', 'artist', 'artists', 'artista', 'artistas'];
  const nomeColuna = c => String(c || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  // Lê a entrada (texto colado ou CSV) e devolve itens e avisos
  function lerEntrada(texto) {
    const itens = [];
    const avisos = [];
    if (!texto || typeof texto !== 'string') return { itens, avisos };

    const linhas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (!linhas.length) return { itens, avisos };

    let ehCsv = false;
    let colunas = [];

    const primeiraLinha = linhas[0];
    if (primeiraLinha.includes(',')) {
      const cabecalhos = parseCsvLinha(primeiraLinha).map(nomeColuna);
      const temCol = cabecalhos.some(c => COL_TITULO.includes(c));
      if (temCol) {
        ehCsv = true;
        colunas = cabecalhos;
        linhas.shift();
      }
    }

    let avisoPlaylistSpotifyDado = false;
    const linksVistos = new Set();

    for (const linha of linhas) {
      if (itens.length >= 200) {
        avisos.push('Limite de 200 itens atingido.');
        break;
      }

      if (ehCsv) {
        const valores = parseCsvLinha(linha);
        // a coluna que aparece primeiro na lista de nomes aceitos ganha (ex: "track name" antes de "name")
        const pegar = nomes => { for (const n of nomes) { const i = colunas.indexOf(n); if (i >= 0 && valores[i]) return valores[i]; } return ''; };
        const titulo = pegar(COL_TITULO);
        // o nome inteiro: banda pode ter vírgula no nome ("Earth, Wind & Fire")
        const artista = pegar(COL_ARTISTA);
        if (titulo || artista) {
          itens.push({ origem: 'csv', link: null, titulo, artista });
        }
        continue;
      }

      const link = Vitrine && Vitrine.lerLink ? Vitrine.lerLink(linha) : null;
      if (link) {
        if (link.fonte === 'spotify' && link.tipo !== 'track') {
          if (!avisoPlaylistSpotifyDado) {
            avisos.push('Link de playlist inteira não dá: abra a playlist no app do Spotify, selecione as músicas (Ctrl+A), copie (Ctrl+C) e cole aqui.');
            avisoPlaylistSpotifyDado = true;
          }
          continue;
        }

        const chaveUnica = link.fonte + '-' + link.codigo + (link.lista ? '-' + link.lista : '');
        if (linksVistos.has(chaveUnica)) continue;
        linksVistos.add(chaveUnica);

        itens.push({ origem: link.fonte, link, titulo: '', artista: '' });
        continue;
      }

      if (linha.includes(' - ')) {
        const partes = linha.split(' - ');
        const artista = partes[0].trim();
        const titulo = partes.slice(1).join(' - ').trim();
        if (titulo) {
          itens.push({ origem: 'texto', link: null, titulo, artista });
        }
      } else {
        itens.push({ origem: 'texto', link: null, titulo: linha, artista: '' });
      }
    }

    return { itens, avisos };
  }

  // Auxiliar para parsear linha CSV respeitando aspas
  function parseCsvLinha(linha) {
    const res = [];
    let atual = '';
    let dentroAspas = false;
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i];
      if (c === '"') {
        if (dentroAspas && linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          dentroAspas = !dentroAspas;
        }
      } else if (c === ',' && !dentroAspas) {
        res.push(atual.trim());
        atual = '';
      } else {
        atual += c;
      }
    }
    res.push(atual.trim());
    return res;
  }

  // Completa as informações do item usando internet (Vitrine.buscarInfo)
  async function completar(item) {
    if (!item.link || !Vitrine || !Vitrine.buscarInfo) return;
    try {
      const info = await Vitrine.buscarInfo(item.link);
      if (item.link.fonte === 'spotify') {
        item.titulo = limparTitulo(info.titulo);
        item.capa = info.capa;
      } else if (item.link.fonte === 'youtube') {
        const sep = separarYoutube(info.titulo, info.autor);
        item.titulo = sep.musica;
        item.artista = sep.artista;
        item.capa = info.capa;
      }
    } catch {}
  }

  // Procura no Audius
  async function procurarNoAudius(item) {
    if (!Audius || !Audius.buscar) return null;
    try {
      const q = (item.titulo + ' ' + (item.artista || '')).trim();
      const candidatos = await Audius.buscar(q);
      return escolher(item, candidatos);
    } catch {
      return null;
    }
  }

  const api = {
    normalizar,
    limparTitulo,
    separarYoutube,
    parecido,
    escolher,
    lerEntrada,
    completar,
    procurarNoAudius
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Importar = api;
})(typeof window !== 'undefined' ? window : global);
