// app.js: a tela do Radiola (etapa 1: tocar as músicas do seu aparelho).
// As contas ficam no nucleo.js e a gaveta das músicas no banco.js.
(function () {
  'use strict';

  const N = window.Nucleo, B = window.Banco;
  const $ = id => document.getElementById(id);
  const ler = (k, padrao) => { try { const v = localStorage.getItem('radiola:' + k); return v === null ? padrao : JSON.parse(v); } catch { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem('radiola:' + k, JSON.stringify(v)); } catch { } };

  // ---------- estado ----------
  // musicas = a fila na ordem que aparece na tela
  // ordem   = a ordem de tocar (igual à da tela, ou embaralhada no aleatório)
  // pos     = em que lugar da "ordem" estamos
  let musicas = [];
  let ordem = [];
  let pos = -1;
  let repetir = ler('repetir', 'nao');     // 'nao' | 'todas' | 'uma'
  let aleatorio = ler('aleatorio', false);
  let urlTocando = null;
  const capas = new Map();                  // id -> endereço temporário da imagem da capa

  const audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = ler('volume', 1);

  const atual = () => (pos >= 0 && pos < ordem.length ? musicas[ordem[pos]] : null);
  const aviso = texto => { $('aviso').textContent = texto || ''; };

  function urlDaCapa(m) {
    if (!m || !m.capa) return null;
    if (!capas.has(m.id)) capas.set(m.id, URL.createObjectURL(m.capa));
    return capas.get(m.id);
  }

  // ---------- desenhar ----------
  function desenharFila() {
    const lista = $('lista');
    lista.textContent = '';
    const tocandoId = atual() && atual().id;
    musicas.forEach((m, i) => {
      const li = document.createElement('li');
      li.className = 'faixa' + (m.id === tocandoId ? ' atual' : '');

      const capa = document.createElement('button');
      capa.type = 'button';
      capa.className = 'faixa-capa';
      capa.setAttribute('aria-label', 'Tocar ' + m.titulo);
      const url = urlDaCapa(m);
      if (url) { const img = document.createElement('img'); img.src = url; img.alt = ''; capa.append(img); }
      else capa.textContent = (m.titulo || '?').trim().charAt(0).toUpperCase();
      capa.onclick = () => tocarDaTela(i);

      // textContent (e não innerHTML): o nome do arquivo nunca vira código na página
      const texto = document.createElement('button');
      texto.type = 'button';
      texto.className = 'faixa-texto';
      const t = document.createElement('strong'); t.textContent = m.titulo;
      const a = document.createElement('span'); a.textContent = m.artista || 'Artista desconhecido';
      texto.append(t, a);
      texto.onclick = () => tocarDaTela(i);

      const tempo = document.createElement('span');
      tempo.className = 'faixa-tempo';
      tempo.textContent = m.duracao ? N.formatarTempo(m.duracao) : '';

      const tirar = document.createElement('button');
      tirar.type = 'button';
      tirar.className = 'botao-icone faixa-tirar';
      tirar.title = 'Tirar da fila';
      tirar.setAttribute('aria-label', 'Tirar ' + m.titulo + ' da fila');
      tirar.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
      tirar.onclick = () => tirarDaFila(i);

      li.append(capa, texto, tempo, tirar);
      lista.append(li);
    });
    $('vazio').hidden = musicas.length > 0;
    $('contagem').textContent = musicas.length ? `(${musicas.length})` : '';
  }

  function desenharTocando() {
    const m = atual();
    $('titulo').textContent = m ? m.titulo : 'Nenhuma música tocando';
    $('artista').textContent = m ? (m.artista || 'Artista desconhecido') + (m.album ? ' · ' + m.album : '')
      : 'Adicione músicas do seu aparelho para começar';
    const url = urlDaCapa(m);
    $('capa').hidden = !url;
    if (url) $('capa').src = url; else $('capa').removeAttribute('src');
    document.title = m ? `${m.titulo} · Radiola` : 'Radiola';
    marcarAtual();
    contarAoCelular(m, url);
  }

  function marcarAtual() {
    const id = atual() && atual().id;
    [...$('lista').children].forEach((li, i) => li.classList.toggle('atual', musicas[i] && musicas[i].id === id));
  }

  function desenharBotoes() {
    $('aleatorio').setAttribute('aria-pressed', String(aleatorio));
    const r = $('repetir');
    r.dataset.modo = repetir;
    r.classList.toggle('ligado', repetir !== 'nao');
    const nomes = { nao: 'desligado', todas: 'a fila toda', uma: 'esta música' };
    r.setAttribute('aria-label', 'Repetir: ' + nomes[repetir]);
    r.title = 'Repetir: ' + nomes[repetir];
  }

  const encher = el => { const max = +el.max || 0; el.style.setProperty('--cheio', (max ? (el.value / max) * 100 : 0) + '%'); };

  function desenharTempo() {
    const p = $('progresso');
    const dur = isFinite(audio.duration) ? audio.duration : 0;
    if (!arrastando) { p.max = dur; p.value = audio.currentTime || 0; }
    encher(p);
    $('tempoAtual').textContent = N.formatarTempo(arrastando ? +p.value : audio.currentTime);
    $('tempoTotal').textContent = N.formatarTempo(dur);
  }

  // ---------- tela de bloqueio do celular e teclas de mídia (Media Session) ----------
  function contarAoCelular(m, urlCapa) {
    if (!('mediaSession' in navigator)) return;
    if (!m) { navigator.mediaSession.metadata = null; return; }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: m.titulo, artist: m.artista || '', album: m.album || 'Radiola',
        artwork: urlCapa ? [{ src: urlCapa, sizes: '512x512', type: m.capa.type || 'image/jpeg' }]
          : [{ src: 'icone-512.png', sizes: '512x512', type: 'image/png' }],
      });
    } catch { }
  }
  if ('mediaSession' in navigator) {
    const acao = (nome, fn) => { try { navigator.mediaSession.setActionHandler(nome, fn); } catch { } };
    acao('play', () => tocarOuPausar(true));
    acao('pause', () => audio.pause());
    acao('previoustrack', anterior);
    acao('nexttrack', () => proxima(true));
    acao('seekto', e => { if (e.seekTime != null) audio.currentTime = e.seekTime; });
    acao('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
    acao('seekforward', () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10); });
  }

  // ---------- tocar ----------
  // Põe a música do lugar "p" da ordem no aparelho. tocarJa=false só deixa pronta.
  function carregar(p, tocarJa = true, comecarEm = 0) {
    if (p < 0 || p >= ordem.length) return;
    pos = p;
    const m = atual();
    if (urlTocando) URL.revokeObjectURL(urlTocando);   // devolve a memória da música anterior
    urlTocando = URL.createObjectURL(m.blob);
    audio.src = urlTocando;
    if (comecarEm > 0) audio.addEventListener('loadedmetadata', () => { audio.currentTime = comecarEm; }, { once: true });
    gravar('atual', m.id);
    gravar('tempo', comecarEm);
    desenharTocando();
    if (tocarJa) audio.play().catch(() => { });
  }

  // Clicou numa música da lista (lugar i na tela)
  function tocarDaTela(i) {
    const p = ordem.indexOf(i);
    if (p === pos && audio.src) { tocarOuPausar(); return; }
    carregar(p);
  }

  function tocarOuPausar(forcarTocar) {
    if (!musicas.length) { $('arquivos').click(); return; }
    if (!audio.src) { carregar(pos >= 0 ? pos : 0); return; }
    if (audio.paused || forcarTocar) audio.play().catch(() => { });
    else audio.pause();
  }

  function proxima(manual) {
    const p = N.avancar(pos, ordem.length, repetir, manual);
    if (p < 0) {            // acabou a fila: volta para o começo, parado
      audio.pause();
      if (ordem.length) carregar(0, false);
      return;
    }
    if (p === pos && !manual) { audio.currentTime = 0; audio.play().catch(() => { }); return; }
    carregar(p);
  }

  function anterior() {
    // igual aos aparelhos de som: com mais de 3 s tocados, "anterior" volta ao começo da música
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    carregar(N.voltar(pos, ordem.length, repetir), !audio.paused || !audio.src);
  }

  function montarOrdem() {
    const tocando = pos >= 0 ? ordem[pos] : -1;
    ordem = aleatorio ? N.embaralhar(musicas.length, tocando) : musicas.map((_, i) => i);
    pos = tocando >= 0 ? ordem.indexOf(tocando) : -1;
  }

  // ---------- fila: adicionar e tirar ----------
  const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // Lê só o começo do arquivo (a etiqueta ID3), sem carregar a música inteira
  async function lerEtiqueta(arquivo) {
    try {
      const cab = new Uint8Array(await arquivo.slice(0, 10).arrayBuffer());
      const tam = N.tamanhoID3(cab);
      if (!tam) return null;
      return N.lerID3(new Uint8Array(await arquivo.slice(0, Math.min(tam, 8 * 1024 * 1024)).arrayBuffer()));
    } catch { return null; }
  }

  // Duração: o navegador abre o arquivo "de leve" (só os dados) e conta
  function lerDuracao(arquivo) {
    return new Promise(ok => {
      const a = new Audio();
      const url = URL.createObjectURL(arquivo);
      const fim = d => { URL.revokeObjectURL(url); a.removeAttribute('src'); ok(d); };
      const tempo = setTimeout(() => fim(0), 8000);
      a.preload = 'metadata';
      a.onloadedmetadata = () => { clearTimeout(tempo); fim(isFinite(a.duration) ? a.duration : 0); };
      a.onerror = () => { clearTimeout(tempo); fim(-1); };   // -1 = este navegador não toca esse formato
      a.src = url;
    });
  }

  async function adicionar(lista) {
    const arquivos = [...lista].filter(f => N.ehAudio(f.name, f.type));
    const pulados = lista.length - arquivos.length;
    if (!arquivos.length) { aviso(pulados ? 'Nenhum desses arquivos é de música.' : ''); return; }
    B.pedirParaGuardar();
    let feitos = 0, naoToca = 0;
    for (const f of arquivos) {
      aviso(`Adicionando ${feitos + 1} de ${arquivos.length}: ${f.name}`);
      const [tag, duracao] = await Promise.all([lerEtiqueta(f), lerDuracao(f)]);
      if (duracao < 0) { naoToca++; feitos++; continue; }
      const doNome = N.lerNome(f.name);
      const m = {
        id: novoId(),
        nome: f.name,
        titulo: (tag && tag.titulo) || doNome.titulo,
        artista: (tag && tag.artista) || doNome.artista,
        album: (tag && tag.album) || '',
        duracao,
        blob: f,
        capa: tag && tag.capa ? new Blob([tag.capa.dados], { type: tag.capa.tipo }) : null,
        criado: Date.now(),
      };
      try { await B.salvar(m); }
      catch (e) {
        aviso('O navegador não deixou guardar mais músicas (espaço cheio?). Parei em ' + f.name + '.');
        break;
      }
      musicas.push(m);
      ordem.push(musicas.length - 1);
      feitos++;
      desenharFila();
    }
    guardarFila();
    const partes = [`Pronto: ${feitos - naoToca} música(s) na fila.`];
    if (naoToca) partes.push(`${naoToca} em formato que este navegador não toca.`);
    if (pulados) partes.push(`${pulados} arquivo(s) não eram de música.`);
    aviso(partes.join(' '));
    if (pos < 0 && musicas.length) carregar(0, false);
  }

  async function tirarDaFila(i) {
    const m = musicas[i];
    const eraAtual = atual() && atual().id === m.id;
    const tocava = eraAtual && !audio.paused;
    if (eraAtual) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
    try { await B.apagar(m.id); } catch { }
    if (capas.has(m.id)) { URL.revokeObjectURL(capas.get(m.id)); capas.delete(m.id); }
    const lugarNaOrdem = ordem.indexOf(i);
    musicas.splice(i, 1);
    ordem = ordem.filter(x => x !== i).map(x => (x > i ? x - 1 : x));
    if (lugarNaOrdem < pos) pos--;
    guardarFila();
    desenharFila();
    if (eraAtual) {
      if (!ordem.length) { pos = -1; desenharTocando(); desenharTempo(); }
      else carregar(Math.min(pos, ordem.length - 1), tocava);
    }
    aviso(`"${m.titulo}" saiu da fila.`);
  }

  const guardarFila = () => gravar('fila', musicas.map(m => m.id));

  // ---------- botões ----------
  $('tocar').onclick = () => tocarOuPausar();
  $('proxima').onclick = () => proxima(true);
  $('anterior').onclick = anterior;
  $('aleatorio').onclick = () => { aleatorio = !aleatorio; gravar('aleatorio', aleatorio); montarOrdem(); desenharBotoes(); };
  $('repetir').onclick = () => {
    repetir = { nao: 'todas', todas: 'uma', uma: 'nao' }[repetir];
    gravar('repetir', repetir); desenharBotoes();
  };
  $('arquivos').onchange = e => { adicionar(e.target.files); e.target.value = ''; };

  // barra da música: enquanto arrasta, só mostra o tempo; ao soltar, pula
  let arrastando = false;
  const prog = $('progresso');
  prog.addEventListener('input', () => { arrastando = true; desenharTempo(); });
  prog.addEventListener('change', () => { audio.currentTime = +prog.value; arrastando = false; desenharTempo(); });

  const vol = $('volume');
  vol.value = audio.volume; encher(vol);
  vol.addEventListener('input', () => { audio.volume = +vol.value; encher(vol); gravar('volume', audio.volume); });

  // tema: automático (segue o aparelho) -> claro -> escuro
  $('tema').onclick = () => {
    const raiz = document.documentElement;
    const prox = { '': 'claro', claro: 'escuro', escuro: '' }[raiz.dataset.tema || ''];
    if (prox) raiz.dataset.tema = prox; else delete raiz.dataset.tema;
    try { if (!prox) localStorage.removeItem('radiola:tema'); else localStorage.setItem('radiola:tema', prox); } catch { }
    aviso({ '': 'Tema automático (igual ao do aparelho).', claro: 'Tema claro.', escuro: 'Tema escuro.' }[prox]);
  };

  // ---------- o "aparelho" avisa o que está acontecendo ----------
  let ultimoGravado = 0;
  audio.addEventListener('timeupdate', () => {
    desenharTempo();
    if (Date.now() - ultimoGravado > 4000) { ultimoGravado = Date.now(); gravar('tempo', audio.currentTime); }
  });
  audio.addEventListener('loadedmetadata', desenharTempo);
  audio.addEventListener('play', () => { document.body.classList.add('tocando'); $('tocar').setAttribute('aria-label', 'Pausar'); });
  audio.addEventListener('pause', () => { document.body.classList.remove('tocando'); $('tocar').setAttribute('aria-label', 'Tocar'); gravar('tempo', audio.currentTime); });
  audio.addEventListener('ended', () => proxima(false));
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    const m = atual();
    aviso(`Não consegui tocar "${m ? m.titulo : 'esta música'}". Pulei para a próxima.`);
    if (ordem.length > 1) setTimeout(() => proxima(true), 800);
  });

  // teclado (no computador): espaço = tocar/pausar; setas = 5 s; Shift+setas = trocar de música
  document.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea, select') && e.target.type !== 'range') return;
    if (e.code === 'Space' && !e.target.closest('button')) { e.preventDefault(); tocarOuPausar(); }
    else if (e.key === 'ArrowRight' && e.shiftKey) proxima(true);
    else if (e.key === 'ArrowLeft' && e.shiftKey) anterior();
    else if (e.key === 'ArrowRight' && e.target.type !== 'range') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    else if (e.key === 'ArrowLeft' && e.target.type !== 'range') audio.currentTime = Math.max(0, audio.currentTime - 5);
  });

  // arrastar arquivos do computador para a página
  let camadas = 0;
  const temArquivos = e => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  document.addEventListener('dragenter', e => { if (!temArquivos(e)) return; camadas++; $('soltar').hidden = false; });
  document.addEventListener('dragleave', () => { camadas = Math.max(0, camadas - 1); if (!camadas) $('soltar').hidden = true; });
  document.addEventListener('dragover', e => { if (temArquivos(e)) e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (!temArquivos(e)) return;
    e.preventDefault(); camadas = 0; $('soltar').hidden = true;
    adicionar(e.dataTransfer.files);
  });

  // ---------- começar: traz a fila guardada no navegador ----------
  async function iniciar() {
    desenharBotoes();
    let guardadas = [];
    try { guardadas = await B.listar(); }
    catch { aviso('Este navegador não deixa guardar músicas (modo anônimo?). Dá para tocar, mas a fila some ao fechar.'); }
    const filaIds = ler('fila', []);
    const lugar = id => { const i = filaIds.indexOf(id); return i < 0 ? 1e9 : i; };
    musicas = guardadas.sort((a, b) => lugar(a.id) - lugar(b.id) || a.criado - b.criado);
    ordem = musicas.map((_, i) => i);
    if (aleatorio) ordem = N.embaralhar(musicas.length, -1);
    desenharFila();
    // volta para a música e o ponto em que você parou (sem tocar sozinho)
    const i = musicas.findIndex(m => m.id === ler('atual', null));
    if (i >= 0) {
      if (aleatorio) ordem = N.embaralhar(musicas.length, i);
      carregar(ordem.indexOf(i), false, ler('tempo', 0));
    } else if (musicas.length) carregar(0, false);
    else desenharTocando();
    desenharTempo();
  }
  iniciar();

  // funciona sem internet depois da primeira visita (service worker)
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { }));
  }

  // para os testes automáticos conseguirem adicionar arquivos
  window.Radiola = { adicionar, estado: () => ({ musicas: musicas.map(m => ({ titulo: m.titulo, artista: m.artista, duracao: m.duracao })), ordem, pos, tocando: !audio.paused }) };
})();
