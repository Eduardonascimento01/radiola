// nucleo.js: as contas do Radiola que não dependem da tela.
// Por não usar o navegador, dá para testar tudo no Node (teste.js).
(function (raiz) {
  'use strict';

  // ---------- nome da música a partir do nome do arquivo ----------
  // "03 - Legião Urbana - Tempo Perdido.mp3" vira { artista: "Legião Urbana", titulo: "Tempo Perdido" }
  function lerNome(nomeArquivo) {
    let s = String(nomeArquivo || '').replace(/\.[a-z0-9]{2,5}$/i, '');
    s = s.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    s = s.replace(/^\d{1,3}\s*[-.)]\s*/, '');          // número da faixa no começo
    const partes = s.split(/\s+-\s+/);
    if (partes.length >= 2) return { artista: partes[0].trim(), titulo: partes.slice(1).join(' - ').trim() };
    return { artista: '', titulo: s || 'Sem nome' };
  }

  // ---------- tempo: 75 segundos vira "1:15" ----------
  function formatarTempo(seg) {
    if (!isFinite(seg) || seg < 0) seg = 0;
    seg = Math.floor(seg);
    const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
    const ss = String(s).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
  }

  // ---------- andar pela fila ----------
  // pos = em que lugar da fila estamos; total = quantas músicas;
  // repetir = 'nao' | 'todas' | 'uma'; manual = a pessoa apertou "próxima".
  // Devolve o próximo lugar, ou -1 quando a fila acabou.
  function avancar(pos, total, repetir, manual) {
    if (total <= 0) return -1;
    if (repetir === 'uma' && !manual) return pos;
    if (pos + 1 < total) return pos + 1;
    return repetir === 'todas' ? 0 : -1;
  }
  function voltar(pos, total, repetir) {
    if (total <= 0) return -1;
    if (pos - 1 >= 0) return pos - 1;
    return repetir === 'todas' ? total - 1 : 0;
  }

  // Ordem aleatória (embaralhamento de Fisher-Yates) com a música atual em primeiro,
  // para ligar o aleatório não trocar a música que está tocando.
  function embaralhar(total, atual, sorteio = Math.random) {
    const resto = [];
    for (let i = 0; i < total; i++) if (i !== atual) resto.push(i);
    for (let i = resto.length - 1; i > 0; i--) {
      const j = Math.floor(sorteio() * (i + 1));
      [resto[i], resto[j]] = [resto[j], resto[i]];
    }
    return atual >= 0 && atual < total ? [atual, ...resto] : resto;
  }

  // ---------- etiqueta ID3 do MP3 (título, artista, álbum e capa) ----------
  // O MP3 costuma trazer no começo do arquivo uma "etiqueta" com os dados da música.
  // Formato: "ID3" + versão + tamanho, depois vários "quadros" (TIT2 = título,
  // TPE1 = artista, TALB = álbum, APIC = imagem da capa).
  const tamanhoSeguro = (b, i) => ((b[i] & 0x7f) << 21) | ((b[i + 1] & 0x7f) << 14) | ((b[i + 2] & 0x7f) << 7) | (b[i + 3] & 0x7f);
  const tamanhoNormal = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];

  // Tamanho total da etiqueta (para saber quanto do arquivo ler). 0 = não tem etiqueta.
  function tamanhoID3(bytes) {
    const b = bytes;
    if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return 0;
    return tamanhoSeguro(b, 6) + 10;
  }

  function decodificar(b, cod) {
    if (!b.length) return '';
    let nome = 'latin1';
    if (cod === 1) nome = (b[0] === 0xfe && b[1] === 0xff) ? 'utf-16be' : 'utf-16le';
    else if (cod === 2) nome = 'utf-16be';
    else if (cod === 3) nome = 'utf-8';
    let s;
    if (nome === 'latin1') s = Array.from(b, c => String.fromCharCode(c)).join('');
    else s = new TextDecoder(nome).decode(b);
    return s.replace(/^﻿/, '').replace(/\0+$/g, '').split('\0')[0].trim();
  }

  // Onde termina um texto que acaba em "zero" (1 byte em latin1/utf-8, 2 bytes em utf-16)
  function fimDoTexto(b, ini, cod) {
    if (cod === 1 || cod === 2) {
      for (let i = ini; i + 1 < b.length; i += 2) if (b[i] === 0 && b[i + 1] === 0) return i;
      return b.length;
    }
    const i = b.indexOf(0, ini);
    return i < 0 ? b.length : i;
  }

  function lerID3(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const fim = Math.min(tamanhoID3(b), b.length);
    if (!fim) return null;
    const versao = b[3];
    if (versao < 3 || versao > 4) return null;     // versões 2.3 e 2.4 (as mais comuns)
    const out = {};
    let i = 10;
    if (b[5] & 0x40) i += versao === 4 ? tamanhoSeguro(b, 10) : tamanhoNormal(b, 10) + 4; // cabeçalho extra
    while (i + 10 <= fim) {
      const id = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
      if (!/^[A-Z0-9]{4}$/.test(id)) break;          // acabaram os quadros (resto é enchimento)
      const tam = versao === 4 ? tamanhoSeguro(b, i + 4) : tamanhoNormal(b, i + 4);
      const ini = i + 10, fimQ = Math.min(ini + tam, fim);
      const q = b.subarray(ini, fimQ);
      if (id === 'TIT2' || id === 'TPE1' || id === 'TALB') {
        const chave = { TIT2: 'titulo', TPE1: 'artista', TALB: 'album' }[id];
        out[chave] = decodificar(q.subarray(1), q[0]);
      } else if (id === 'APIC' && !out.capa && q.length > 4) {
        const cod = q[0];
        const fimMime = q.indexOf(0, 1);
        if (fimMime > 0) {
          let tipo = decodificar(q.subarray(1, fimMime), 0).toLowerCase() || 'image/jpeg';
          if (!tipo.includes('/')) tipo = 'image/' + (tipo === 'jpg' ? 'jpeg' : tipo);
          const fimDesc = fimDoTexto(q, fimMime + 2, cod);
          const pulo = (cod === 1 || cod === 2) ? 2 : 1;
          const dados = q.subarray(fimDesc + pulo);
          if (dados.length > 0) out.capa = { tipo, dados };
        }
      }
      if (tam <= 0) break;
      i = ini + tam;
    }
    return out;
  }

  // Arquivos que o Radiola aceita
  const EXTENSOES = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
  const ehAudio = (nome, tipo) => /^audio\//.test(tipo || '') || EXTENSOES.test(nome || '');

  const api = { lerNome, formatarTempo, avancar, voltar, embaralhar, tamanhoID3, lerID3, ehAudio };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Nucleo = api;
})(this);
