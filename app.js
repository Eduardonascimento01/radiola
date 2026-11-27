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
  let estacao = ler('estacao', 'arquivos');   // 'arquivos' | 'audius'
  let urlTocando = null;
  const capas = new Map();                  // id -> endereço temporário da imagem da capa

  const audio = new Audio();
  audio.preload = 'metadata';
  audio.volume = ler('volume', 1);

  const atual = () => (pos >= 0 && pos < ordem.length ? musicas[ordem[pos]] : null);
  const aviso = texto => { $('aviso').textContent = texto || ''; };

  // A capinha quadrada da lista: a imagem da capa, ou a 1ª letra do título
  function preencherCapa(el, m) {
    const url = urlDaCapa(m, true);
    if (url) {
      const img = document.createElement('img');
      img.src = url; img.alt = ''; img.loading = 'lazy';
      img.onerror = () => { img.remove(); el.textContent = (m.titulo || '?').trim().charAt(0).toUpperCase(); };
      el.append(img);
    } else el.textContent = (m.titulo || '?').trim().charAt(0).toUpperCase();
  }

  function urlDaCapa(m, pequena) {
    if (m && m.capaUrl) return (pequena && m.capaPequena) || m.capaUrl;   // Audius: a capa vem da internet
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
      preencherCapa(capa, m);
      capa.onclick = () => tocarDaTela(i);

      // textContent (e não innerHTML): o nome do arquivo nunca vira código na página
      const texto = document.createElement('button');
      texto.type = 'button';
      texto.className = 'faixa-texto';
      const t = document.createElement('strong'); t.textContent = m.titulo;
      const a = document.createElement('span');
      a.textContent = (m.artista || 'Artista desconhecido') + (m.fonte === 'audius' ? ' · Audius' : '');
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
      : 'Adicione músicas do aparelho ou busque no Audius';
    const url = urlDaCapa(m);
    $('capa').hidden = !url;
    // capa da internet que não carregou (sem rede, imagem apagada): esconde em vez de mostrar "imagem quebrada"
    $('capa').onerror = () => { $('capa').hidden = true; };
    if (url) $('capa').src = url; else $('capa').removeAttribute('src');
    document.title = m ? `${m.titulo} · Radiola` : 'Radiola';
    marcarAtual();
    contarAoCelular(m, url);
    if (typeof desenharAcoes === 'function') desenharAcoes();
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
    // enquanto o navegador não sabe a duração (música da internet ainda carregando), usa a que já guardamos
    const dur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : ((atual() && atual().duracao) || 0);
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
        artwork: urlCapa ? [{ src: urlCapa, sizes: m.capaUrl ? '480x480' : '512x512', type: (m.capa && m.capa.type) || 'image/jpeg' }]
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
    urlTocando = null;
    // MP3 do aparelho: um endereço temporário para o arquivo; Audius: o endereço da música na internet
    if (m.blob) { urlTocando = URL.createObjectURL(m.blob); audio.src = urlTocando; }
    else if (m.fonte === 'audius') audio.src = Audius.enderecoDoSom(m.trackId);
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
    if (!musicas.length) {
      if (estacao === 'audius') $('buscaAudius').focus(); else $('arquivos').click();
      return;
    }
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
      biblioteca.set(m.id, m);
      ordem.push(musicas.length - 1);
      feitos++;
      desenharFila();
    }
    guardarFila();
    desenharColecao();
    const partes = [`Pronto: ${feitos - naoToca} música(s) na fila.`];
    if (naoToca) partes.push(`${naoToca} em formato que este navegador não toca.`);
    if (pulados) partes.push(`${pulados} arquivo(s) não eram de música.`);
    aviso(partes.join(' '));
    if (pos < 0 && musicas.length) carregar(0, false);
  }

  // Tirar da fila NÃO apaga a música do aparelho: ela continua em "Todas as músicas".
  // (quem apaga de verdade é o X da lista "Todas as músicas", na coleção)
  function tirarDaFila(i, calado) {
    const m = musicas[i];
    const eraAtual = atual() && atual().id === m.id;
    const tocava = eraAtual && !audio.paused;
    if (eraAtual) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
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
    if (!calado) aviso(`"${m.titulo}" saiu da fila (continua em "Todas as músicas").`);
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

  // ---------- estações do dial (de onde vem o som) ----------
  const ESTACOES = [...document.querySelectorAll('.estacao[data-estacao]')];
  function mostrarEstacao(nome) {
    estacao = nome === 'audius' ? 'audius' : 'arquivos';
    gravar('estacao', estacao);
    ESTACOES.forEach(b => {
      const ativa = b.dataset.estacao === estacao;
      b.classList.toggle('ativa', ativa);
      b.setAttribute('aria-pressed', String(ativa));
    });
    // o ponteiro âmbar do dial anda até a estação escolhida
    const todas = [...document.querySelectorAll('.estacao')];
    const k = todas.findIndex(b => b.dataset.estacao === estacao);
    $('dial').style.setProperty('--ponteiro', ((k + 0.5) / todas.length * 100) + '%');
    $('painelAudius').hidden = estacao !== 'audius';
    if (estacao === 'audius' && !$('resultadosAudius').children.length) carregarEmAlta();
  }
  ESTACOES.forEach(b => b.addEventListener('click', () => mostrarEstacao(b.dataset.estacao)));

  // ---------- Audius: buscar e tocar músicas inteiras, grátis ----------
  const avisoAudius = t => { $('avisoAudius').textContent = t || ''; };
  let pedidoAudius = 0;   // buscou de novo antes da resposta chegar? a resposta velha é ignorada
  async function mostrarResultados(promessa, carregando, titulo) {
    const meu = ++pedidoAudius;
    avisoAudius(carregando);
    let lista;
    try { lista = await promessa; }
    catch (e) { if (meu === pedidoAudius) avisoAudius(e.message); return; }
    if (meu !== pedidoAudius) return;
    avisoAudius(lista.length ? titulo : 'Nada encontrado. Tente outra palavra.');
    desenharResultados(lista);
  }
  const carregarEmAlta = () => mostrarResultados(Audius.emAlta(), 'Carregando as músicas em alta...', 'Em alta no Audius agora:');
  function buscarAudius() {
    const q = $('buscaAudius').value.trim();
    if (!q) { carregarEmAlta(); return; }
    mostrarResultados(Audius.buscar(q), `Buscando "${q}"...`, `Resultados para "${q}":`);
  }
  $('buscarAudius').onclick = buscarAudius;
  $('buscaAudius').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); buscarAudius(); } });

  function desenharResultados(lista) {
    const ol = $('resultadosAudius');
    ol.textContent = '';
    lista.forEach(m => {
      const li = document.createElement('li');
      li.className = 'faixa';
      const capa = document.createElement('button');
      capa.type = 'button';
      capa.className = 'faixa-capa';
      capa.setAttribute('aria-label', 'Tocar agora ' + m.titulo);
      preencherCapa(capa, m);
      capa.onclick = () => adicionarAudius(m, true);
      // textContent: o título vem da internet e nunca pode virar código na página
      const texto = document.createElement('button');
      texto.type = 'button';
      texto.className = 'faixa-texto';
      const t = document.createElement('strong'); t.textContent = m.titulo;
      const a = document.createElement('span'); a.textContent = (m.artista || 'Artista') + (m.genero ? ' · ' + m.genero : '');
      texto.append(t, a);
      texto.onclick = () => adicionarAudius(m, true);
      const tempo = document.createElement('span');
      tempo.className = 'faixa-tempo';
      tempo.textContent = N.formatarTempo(m.duracao);
      const mais = document.createElement('button');
      mais.type = 'button';
      mais.className = 'botao-icone faixa-tirar';
      mais.title = 'Pôr na fila';
      mais.setAttribute('aria-label', 'Pôr ' + m.titulo + ' na fila');
      mais.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
      mais.onclick = () => adicionarAudius(m, false);
      li.append(capa, texto, tempo, mais);
      ol.append(li);
    });
  }

  // Põe uma música do Audius na fila e guarda (amanhã ela continua lá). tocarJa: já começa a tocar.
  async function adicionarAudius(m, tocarJa) {
    let i = musicas.findIndex(x => x.id === m.id);
    if (i < 0) {
      if (biblioteca.has(m.id)) m = biblioteca.get(m.id);
      else { try { await B.salvar(m); } catch { } biblioteca.set(m.id, m); desenharColecao(); }
      musicas.push(m);
      i = musicas.length - 1;
      ordem.push(i);
      guardarFila();
      desenharFila();
      if (!tocarJa) aviso(`"${m.titulo}" entrou na fila.`);
    } else if (!tocarJa) aviso(`"${m.titulo}" já está na fila.`);
    if (tocarJa) carregar(ordem.indexOf(i));
    else if (pos < 0) carregar(ordem.indexOf(i), false);
  }


  // ---------- sua coleção (etapa 3): curtidas, playlists e todas as músicas ----------
  // biblioteca = TODAS as músicas guardadas no aparelho (MP3 e Audius), pelo id.
  // A fila, as curtidas e as playlists são só listas de ids apontando para ela.
  const C = window.Colecao;
  const biblioteca = new Map();
  const curtidas = ler('curtidas', []).filter(x => typeof x === 'string');
  const playlists = C.arrumar(ler('playlists', []));
  let aberta = null;                       // qual lista está aberta na tela ('curtidas', 'todas' ou o id da playlist)
  const guardarColecao = () => { gravar('curtidas', curtidas); gravar('playlists', playlists); };
  const avisoColecao = t => { $('avisoColecao').textContent = t || ''; };

  const ICONE_LISTA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h11M4 11h11M4 16h7M18 5v11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="17" r="2.5" fill="currentColor"/></svg>';
  const ICONE_TODAS = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>';
  const ICONE_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l12 7-12 7z" fill="currentColor"/></svg>';
  const ICONE_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  const ICONE_CORACAO = document.querySelector('#curtir svg').outerHTML;

  // Cada lista da coleção, do jeito que a tela precisa
  function listasDaColecao() {
    const todas = [...biblioteca.values()].sort((a, b) => (a.criado || 0) - (b.criado || 0)).map(m => m.id);
    return [
      { chave: 'curtidas', nome: 'Curtidas', ids: curtidas, icone: ICONE_CORACAO, classe: 'curtidas' },
      ...playlists.map(p => ({ chave: p.id, nome: p.nome, ids: p.ids, icone: ICONE_LISTA, playlist: p })),
      { chave: 'todas', nome: 'Todas as músicas', ids: todas, icone: ICONE_TODAS },
    ];
  }

  function desenharColecao() {
    const ul = $('listas');
    ul.textContent = '';
    for (const l of listasDaColecao()) {
      const ids = l.ids.filter(id => biblioteca.has(id));
      const li = document.createElement('li');
      li.className = 'lista-item';
      const cab = document.createElement('div');
      cab.className = 'lista-cab';
      const ic = document.createElement('span');
      ic.className = 'lista-icone ' + (l.classe || '');
      ic.innerHTML = l.icone;
      const abrir = document.createElement('button');
      abrir.type = 'button';
      abrir.className = 'lista-abrir';
      abrir.setAttribute('aria-expanded', String(aberta === l.chave));
      const t = document.createElement('strong'); t.textContent = l.nome;            // nome digitado: sempre textContent
      const n = document.createElement('span'); n.textContent = C.contar(ids.length) + (aberta === l.chave ? ' · fechar' : ' · ver');
      abrir.append(t, n);
      abrir.onclick = () => { aberta = aberta === l.chave ? null : l.chave; desenharColecao(); };
      const tocar = document.createElement('button');
      tocar.type = 'button';
      tocar.className = 'lista-tocar';
      tocar.innerHTML = ICONE_PLAY;
      tocar.disabled = !ids.length;
      tocar.setAttribute('aria-label', 'Tocar ' + l.nome);
      tocar.onclick = () => tocarLista(ids, l.nome);
      cab.append(ic, abrir, tocar);
      li.append(cab);
      if (aberta === l.chave) li.append(corpoDaLista(l, ids));
      ul.append(li);
    }
  }

  // As músicas de uma lista aberta: tocar a partir de uma, ou tirar da lista
  function corpoDaLista(l, ids) {
    const corpo = document.createElement('div');
    corpo.className = 'lista-corpo';
    if (!ids.length) {
      const p = document.createElement('p');
      p.className = 'lista-vazia';
      p.textContent = l.chave === 'curtidas' ? 'Toque no coração de uma música para ela aparecer aqui.'
        : l.chave === 'todas' ? 'Nenhuma música guardada ainda.'
        : 'Playlist vazia. Toque em "Playlist", embaixo da música que está tocando, para pôr músicas aqui.';
      corpo.append(p);
    } else {
      const ol = document.createElement('ol');
      ol.className = 'lista';
      ids.forEach((id, k) => {
        const m = biblioteca.get(id);
        const item = document.createElement('li');
        item.className = 'faixa' + (atual() && atual().id === id ? ' atual' : '');
        const capa = document.createElement('button');
        capa.type = 'button'; capa.className = 'faixa-capa';
        capa.setAttribute('aria-label', 'Tocar ' + m.titulo);
        preencherCapa(capa, m);
        const texto = document.createElement('button');
        texto.type = 'button'; texto.className = 'faixa-texto';
        const t = document.createElement('strong'); t.textContent = m.titulo;
        const a = document.createElement('span'); a.textContent = (m.artista || 'Artista desconhecido') + (m.fonte === 'audius' ? ' · Audius' : '');
        texto.append(t, a);
        capa.onclick = texto.onclick = () => tocarLista(ids, l.nome, k);
        const tempo = document.createElement('span');
        tempo.className = 'faixa-tempo';
        tempo.textContent = m.duracao ? N.formatarTempo(m.duracao) : '';
        const x = document.createElement('button');
        x.type = 'button'; x.className = 'botao-icone faixa-tirar';
        x.innerHTML = ICONE_X;
        const rotulo = l.chave === 'todas' ? 'Apagar do aparelho' : l.chave === 'curtidas' ? 'Descurtir' : 'Tirar da playlist';
        x.title = rotulo;
        x.setAttribute('aria-label', rotulo + ': ' + m.titulo);
        x.onclick = () => tirarDaLista(l, m);
        item.append(capa, texto, tempo, x);
        ol.append(item);
      });
      corpo.append(ol);
    }
    if (l.playlist) {
      const rod = document.createElement('div');
      rod.className = 'lista-rodape';
      const apagar = document.createElement('button');
      apagar.type = 'button'; apagar.className = 'link-perigo';
      apagar.textContent = 'Apagar a playlist';
      apagar.onclick = () => {
        if (!confirm(`Apagar a playlist "${l.nome}"? As músicas continuam guardadas em "Todas as músicas".`)) return;
        playlists.splice(playlists.indexOf(l.playlist), 1);
        aberta = null;
        guardarColecao(); desenharColecao();
        avisoColecao(`Playlist "${l.nome}" apagada.`);
      };
      rod.append(apagar);
      corpo.append(rod);
    }
    return corpo;
  }

  async function tirarDaLista(l, m) {
    if (l.chave === 'curtidas') { C.tirar(curtidas, m.id); avisoColecao(`"${m.titulo}" saiu das curtidas.`); }
    else if (l.playlist) { C.tirar(l.playlist.ids, m.id); avisoColecao(`"${m.titulo}" saiu de "${l.nome}".`); }
    else {
      // "Todas as músicas": apaga do aparelho de verdade (sai também da fila, das curtidas e das playlists)
      if (!confirm(`Apagar "${m.titulo}" do aparelho? Ela sai também da fila, das curtidas e das playlists.`)) return;
      const i = musicas.findIndex(x => x.id === m.id);
      if (i >= 0) tirarDaFila(i, true);
      try { await B.apagar(m.id); } catch { }
      biblioteca.delete(m.id);
      if (capas.has(m.id)) { URL.revokeObjectURL(capas.get(m.id)); capas.delete(m.id); }
      C.esquecer(m.id, curtidas, playlists);
      avisoColecao(`"${m.titulo}" foi apagada do aparelho.`);
    }
    guardarColecao();
    desenharColecao();
    desenharAcoes();
  }

  // Tocar uma lista: ela vira a fila, começando pela música "inicio"
  function tocarLista(ids, nome, inicio = 0) {
    const novas = ids.map(id => biblioteca.get(id)).filter(Boolean);
    if (!novas.length) return;
    musicas = novas;
    pos = -1;
    ordem = musicas.map((_, i) => i);
    if (aleatorio) ordem = N.embaralhar(musicas.length, inicio);
    guardarFila();
    desenharFila();
    carregar(ordem.indexOf(inicio));
    aviso(`Tocando "${nome}" (${C.contar(musicas.length)}).`);
  }

  // Botões embaixo da música que está tocando
  function desenharAcoes() {
    const m = atual();
    const curtida = !!m && curtidas.includes(m.id);
    $('curtir').disabled = !m;
    $('porNaPlaylist').disabled = !m;
    $('curtir').setAttribute('aria-pressed', String(curtida));
    $('curtir').querySelector('span').textContent = curtida ? 'Curtida' : 'Curtir';
    $('curtir').setAttribute('aria-label', curtida ? 'Descurtir esta música' : 'Curtir esta música');
  }
  $('curtir').onclick = () => {
    const m = atual();
    if (!m) return;
    const ficou = C.alternar(curtidas, m.id);
    guardarColecao(); desenharAcoes(); desenharColecao();
    aviso(ficou ? `"${m.titulo}" foi para as curtidas.` : `"${m.titulo}" saiu das curtidas.`);
  };

  // Nova playlist (na coleção)
  function criarPlaylist(nome, comMusica) {
    const pl = C.criar(playlists, nome);
    if (!pl) return null;
    if (comMusica) C.por(pl.ids, comMusica.id);
    guardarColecao(); desenharColecao();
    return pl;
  }
  $('novaPlaylist').onclick = () => { $('novaLinha').hidden = !$('novaLinha').hidden; if (!$('novaLinha').hidden) $('nomePlaylist').focus(); };
  const criarDaColecao = () => {
    const pl = criarPlaylist($('nomePlaylist').value);
    if (!pl) { avisoColecao('Escreva um nome para a playlist.'); return; }
    $('nomePlaylist').value = '';
    $('novaLinha').hidden = true;
    aberta = pl.id;
    desenharColecao();
    avisoColecao(`Playlist "${pl.nome}" criada.`);
  };
  $('criarPlaylist').onclick = criarDaColecao;
  $('nomePlaylist').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); criarDaColecao(); } });

  // Janelinha "Pôr na playlist" (para a música que está tocando)
  function desenharDialogo() {
    const m = atual();
    $('dialogoMusica').textContent = m ? m.titulo + (m.artista ? ' · ' + m.artista : '') : '';
    const ul = $('dialogoLista');
    ul.textContent = '';
    if (!playlists.length) {
      const li = document.createElement('li');
      li.className = 'lista-vazia';
      li.textContent = 'Você ainda não tem playlists. Crie a primeira aqui embaixo.';
      ul.append(li);
    }
    playlists.forEach(pl => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      const ja = pl.ids.includes(m.id);
      b.className = ja ? 'ja' : '';
      const nome = document.createElement('span'); nome.textContent = pl.nome;
      const marca = document.createElement('span'); marca.textContent = ja ? '✓ já está' : C.contar(pl.ids.filter(id => biblioteca.has(id)).length);
      b.append(nome, marca);
      b.onclick = () => {
        if (pl.ids.includes(m.id)) C.tirar(pl.ids, m.id); else C.por(pl.ids, m.id);
        guardarColecao(); desenharDialogo(); desenharColecao();
      };
      li.append(b);
      ul.append(li);
    });
  }
  $('porNaPlaylist').onclick = () => { if (!atual()) return; desenharDialogo(); $('dialogoPlaylist').showModal(); };
  $('fecharDialogo').onclick = () => $('dialogoPlaylist').close();
  $('dialogoPlaylist').addEventListener('click', e => { if (e.target === $('dialogoPlaylist')) $('dialogoPlaylist').close(); });
  const criarDoDialogo = () => {
    const pl = criarPlaylist($('nomeNoDialogo').value, atual());
    if (!pl) return;
    $('nomeNoDialogo').value = '';
    desenharDialogo();
  };
  $('criarNoDialogo').onclick = criarDoDialogo;
  $('nomeNoDialogo').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); criarDoDialogo(); } });

  // ---------- começar: traz a fila guardada no navegador ----------
  async function iniciar() {
    desenharBotoes();
    mostrarEstacao(estacao);
    let guardadas = [];
    try { guardadas = await B.listar(); }
    catch { aviso('Este navegador não deixa guardar músicas (modo anônimo?). Dá para tocar, mas a fila some ao fechar.'); }
    guardadas.forEach(m => biblioteca.set(m.id, m));
    // a fila guardada (ids); quem ainda não tinha fila (versão antiga) recebe todas as músicas
    const filaIds = ler('fila', null);
    musicas = Array.isArray(filaIds) ? filaIds.map(id => biblioteca.get(id)).filter(Boolean)
      : guardadas.sort((a, b) => (a.criado || 0) - (b.criado || 0));
    desenharColecao();
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
  window.Radiola = { adicionar, adicionarAudius, mostrarEstacao, estado: () => ({ musicas: musicas.map(m => ({ titulo: m.titulo, artista: m.artista, duracao: m.duracao })), ordem, pos, tocando: !audio.paused }) };
})();
