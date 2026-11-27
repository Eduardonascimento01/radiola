// teste.js: confere as contas do Radiola. Rode com:  node teste.js
const assert = require('assert');
const N = require('./nucleo.js');

let ok = 0;
function teste(nome, fn) { fn(); ok++; console.log('✓ ' + nome); }

teste('nome do arquivo vira artista e título', () => {
  assert.deepStrictEqual(N.lerNome('03 - Legião Urbana - Tempo Perdido.mp3'), { artista: 'Legião Urbana', titulo: 'Tempo Perdido' });
  assert.deepStrictEqual(N.lerNome('Queen_-_Bohemian_Rhapsody.m4a'), { artista: 'Queen', titulo: 'Bohemian Rhapsody' });
  assert.deepStrictEqual(N.lerNome('minha musica.ogg'), { artista: '', titulo: 'minha musica' });
  assert.deepStrictEqual(N.lerNome('A-ha - Take On Me - Remaster.mp3'), { artista: 'A-ha', titulo: 'Take On Me - Remaster' });
});

teste('tempo em minutos e segundos', () => {
  assert.strictEqual(N.formatarTempo(0), '0:00');
  assert.strictEqual(N.formatarTempo(75.9), '1:15');
  assert.strictEqual(N.formatarTempo(3725), '1:02:05');
  assert.strictEqual(N.formatarTempo(NaN), '0:00');
});

teste('próxima: para no fim, ou volta ao começo com "repetir a fila"', () => {
  assert.strictEqual(N.avancar(0, 3, 'nao', false), 1);
  assert.strictEqual(N.avancar(2, 3, 'nao', false), -1);
  assert.strictEqual(N.avancar(2, 3, 'todas', false), 0);
  assert.strictEqual(N.avancar(1, 3, 'uma', false), 1);    // acabou sozinha: repete a mesma
  assert.strictEqual(N.avancar(1, 3, 'uma', true), 2);     // apertou "próxima": vai para a próxima
  assert.strictEqual(N.avancar(0, 0, 'todas', true), -1);
});

teste('anterior: no começo fica na primeira (ou vai para a última com "repetir a fila")', () => {
  assert.strictEqual(N.voltar(2, 3, 'nao'), 1);
  assert.strictEqual(N.voltar(0, 3, 'nao'), 0);
  assert.strictEqual(N.voltar(0, 3, 'todas'), 2);
});

teste('aleatório: todas as músicas, uma vez cada, com a atual em primeiro', () => {
  for (let vez = 0; vez < 50; vez++) {
    const o = N.embaralhar(10, 4);
    assert.strictEqual(o[0], 4);
    assert.deepStrictEqual([...o].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
  assert.strictEqual(N.embaralhar(5, -1).length, 5);
});

teste('só aceita arquivos de música', () => {
  assert.ok(N.ehAudio('a.mp3', ''));
  assert.ok(N.ehAudio('x', 'audio/ogg'));
  assert.ok(!N.ehAudio('foto.jpg', 'image/jpeg'));
});

// Monta uma etiqueta ID3 de mentira, do jeito que um MP3 de verdade traz
function etiqueta(versao, quadros) {
  const corpo = Buffer.concat(quadros.map(([id, dados]) => {
    const cab = Buffer.alloc(10);
    cab.write(id, 0, 'latin1');
    const t = dados.length;
    if (versao === 4) cab.writeUInt32BE(((t & 0xfe00000) << 3) | ((t & 0x1fc000) << 2) | ((t & 0x3f80) << 1) | (t & 0x7f), 4);
    else cab.writeUInt32BE(t, 4);
    return Buffer.concat([cab, dados]);
  }));
  const enchimento = Buffer.alloc(20);           // MP3 de verdade costuma ter zeros sobrando
  const t = corpo.length + enchimento.length;
  const cab = Buffer.from([0x49, 0x44, 0x33, versao, 0, 0, (t >> 21) & 0x7f, (t >> 14) & 0x7f, (t >> 7) & 0x7f, t & 0x7f]);
  return new Uint8Array(Buffer.concat([cab, corpo, enchimento, Buffer.from('resto do mp3')]));
}

teste('etiqueta ID3 2.3: título em UTF-16, artista em latin1, capa', () => {
  const utf16 = s => Buffer.concat([Buffer.from([1, 0xff, 0xfe]), Buffer.from(s, 'utf16le')]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const b = etiqueta(3, [
    ['TIT2', utf16('Aquarela')],
    ['TPE1', Buffer.concat([Buffer.from([0]), Buffer.from('Toquinho', 'latin1')])],
    ['APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/jpeg\0', 'latin1'), Buffer.from([3]), Buffer.from('capa\0', 'latin1'), jpg])],
  ]);
  const t = N.lerID3(b);
  assert.strictEqual(t.titulo, 'Aquarela');
  assert.strictEqual(t.artista, 'Toquinho');
  assert.strictEqual(t.capa.tipo, 'image/jpeg');
  assert.deepStrictEqual(Buffer.from(t.capa.dados), jpg);
});

teste('etiqueta ID3 2.4: texto em UTF-8 com acento', () => {
  const utf8 = s => Buffer.concat([Buffer.from([3]), Buffer.from(s, 'utf8')]);
  const t = N.lerID3(etiqueta(4, [['TIT2', utf8('Garota de Ipanema')], ['TPE1', utf8('Tom Jobim')], ['TALB', utf8('Coração')]]));
  assert.deepStrictEqual([t.titulo, t.artista, t.album], ['Garota de Ipanema', 'Tom Jobim', 'Coração']);
});

teste('arquivo sem etiqueta não quebra', () => {
  assert.strictEqual(N.lerID3(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])), null);
  assert.strictEqual(N.tamanhoID3(new Uint8Array(3)), 0);
});

const A = require('./audius.js');
teste('Audius: resposta da API vira música da fila (e só as que tocam)', () => {
  const resposta = [
    { id: 'YmJWK', title: ' Samba de Roda ', duration: 215, genre: 'Samba', permalink: '/ana/samba',
      user: { name: 'Ana' }, artwork: { '150x150': 'p.jpg', '480x480': 'g.jpg' }, is_streamable: true },
    { id: 'x1', title: 'Exclusiva', user: { name: 'B' }, is_streamable: false },
    { id: 'x2', title: 'Apagada', user: { name: 'C' }, is_delete: true },
    null,
  ];
  const l = A.tocaveis(resposta).map(A.paraMusica);
  assert.strictEqual(l.length, 1);
  const m = l[0];
  assert.strictEqual(m.id, 'au-YmJWK');
  assert.strictEqual(m.fonte, 'audius');
  assert.strictEqual(m.titulo, 'Samba de Roda');
  assert.strictEqual(m.artista, 'Ana');
  assert.strictEqual(m.duracao, 215);
  assert.strictEqual(m.capaUrl, 'g.jpg');
  assert.strictEqual(m.capaPequena, 'p.jpg');
  assert.strictEqual(m.link, 'https://audius.co/ana/samba');
  assert.ok(A.enderecoDoSom('YmJWK').startsWith('https://api.audius.co/v1/tracks/YmJWK/stream?app_name=radiola'));
});

const Archive = require('./archive.js');
teste('Archive: montarBusca', () => {
  const url = Archive.montarBusca('samba');
  assert.ok(url.includes('mediatype%3Aaudio') || url.includes('mediatype:audio'));
  assert.ok(url.includes('rows=30'));
});

teste('Archive: paraAlbum com title e creator em lista e sem year', () => {
  const doc = { identifier: 'show1', title: ['Show ao vivo'], creator: ['Banda X'] };
  const alb = Archive.paraAlbum(doc);
  assert.strictEqual(alb.titulo, 'Show ao vivo');
  assert.strictEqual(alb.artista, 'Banda X');
  assert.strictEqual(alb.ano, '');
  assert.strictEqual(alb.capaUrl, 'https://archive.org/services/img/show1');
});

teste('Archive: musicasDoAlbum com 2 MP3, 1 Ogg ignorado, 1 spectrogram, track 1 antes de 2, durações 252 e 3492', () => {
  const meta = {
    files: [
      { name: 'track2.mp3', format: 'VBR MP3', title: 'Segunda', length: '4:12', track: '2', creator: 'Artista A' },
      { name: 'track1.mp3', format: '128Kbps MP3', length: '3492.23', track: '1' },
      { name: 'audio.ogg', format: 'Ogg Vorbis', length: '100' },
      { name: 'capa_spectrogram.png', format: 'PNG' },
    ]
  };
  const album = { identifier: 'show1', titulo: 'Show', artista: 'Banda' };
  const musicas = Archive.musicasDoAlbum(meta, album);
  assert.strictEqual(musicas.length, 2);
  assert.strictEqual(musicas[0].arquivo, 'track1.mp3');
  assert.strictEqual(musicas[0].titulo, 'track1');
  assert.strictEqual(musicas[0].duracao, 3492);
  assert.strictEqual(musicas[1].arquivo, 'track2.mp3');
  assert.strictEqual(musicas[1].titulo, 'Segunda');
  assert.strictEqual(musicas[1].duracao, 252);
});

teste('Archive: enderecoDoSom com nome com espaço e acento', () => {
  const m = { identifier: 'show1', arquivo: 'Música 1.mp3' };
  assert.strictEqual(Archive.enderecoDoSom(m), 'https://archive.org/download/show1/' + encodeURIComponent('Música 1.mp3'));
});

const R = require('./radio.js');
teste('Rádio: só https, sem repetidas, nome e gêneros', () => {
  const lista = [
    { stationuuid: '1', name: 'Boa', url_resolved: 'https://radio.com/stream', favicon: 'https://radio.com/ico.png', tags: 'rock, pop, ', country: 'Brazil' },
    { stationuuid: '2', name: 'Ruim HTTP', url_resolved: 'http://radio.com/stream', favicon: 'https://radio.com/ico.png', tags: 'samba' },
    { stationuuid: '3', name: 'Repetida', url_resolved: 'https://radio.com/stream', favicon: 'https://radio.com/ico.png', tags: 'rock' },
    { name: 'Sem ID', url_resolved: 'https://radio.com/stream2', tags: 'jazz' },
    { stationuuid: '4', name: 'Favicon HTTP', url_resolved: 'https://radio.com/stream3', favicon: 'http://radio.com/ico.png', tags: 'notícias' }
  ];
  const t = R.tocaveis(lista);
  assert.strictEqual(t.length, 2);
  assert.strictEqual(t[0].nome, 'Boa');
  assert.strictEqual(t[0].capaUrl, 'https://radio.com/ico.png');
  assert.deepStrictEqual(t[0].generos, ['rock', 'pop']);
  assert.strictEqual(t[1].nome, 'Favicon HTTP');
  assert.strictEqual(t[1].capaUrl, null);
});

teste('Rádio: juntar a busca por nome e por estilo sem perder nada (e sem repetir)', () => {
  const porNome = R.tocaveis([{ stationuuid: 'a', name: 'Rádio Samba', url_resolved: 'https://x/a' }]);
  const porEstilo = R.tocaveis([
    { stationuuid: 'a', name: 'Rádio Samba', url_resolved: 'https://x/a' },
    { stationuuid: 'b', name: 'Pagode FM', url_resolved: 'https://x/b', tags: 'samba' },
  ]);
  const j = R.juntar(porNome, porEstilo);
  assert.deepStrictEqual(j.map(e => e.nome), ['Rádio Samba', 'Pagode FM']);
});

const C = require('./colecao.js');
const V = require('./vitrine.js');
const I = require('./importar.js');

teste('Importar: CSV do Exportify (o artista é o nome, não o código URI)', () => {
  const csv = ['"Track URI","Track Name","Artist URI(s)","Artist Name(s)","Album Name"',
    '"spotify:track:1","Bohemian Rhapsody","spotify:artist:1dfeR4","Queen","A Night At The Opera"',
    '"spotify:track:2","September","spotify:artist:4QQgXk","Earth, Wind & Fire","The Best Of"'].join('\n');
  const { itens } = I.lerEntrada(csv);
  assert.deepStrictEqual(itens.map(i => [i.titulo, i.artista]), [['Bohemian Rhapsody', 'Queen'], ['September', 'Earth, Wind & Fire']]);
});

teste('Importar: limparTitulo', () => {
  assert.strictEqual(I.limparTitulo('Bohemian Rhapsody - Remastered 2011'), 'Bohemian Rhapsody');
  assert.strictEqual(I.limparTitulo('Song (feat. X) [Official Video]'), 'Song');
});

teste('Importar: separarYoutube', () => {
  const s = I.separarYoutube('Queen - Bohemian Rhapsody (Official Video Remastered)', 'Queen Official');
  assert.strictEqual(s.artista, 'Queen');
  assert.strictEqual(s.musica, 'Bohemian Rhapsody');
});

teste('Importar: escolher', () => {
  const procurado = { titulo: 'Tempo Perdido', artista: 'Legião Urbana' };
  const candidatos = [
    { titulo: 'Outra Música', artista: 'Outro' },
    { titulo: 'Tempo Perdido', artista: 'Legião Urbana' },
    { titulo: 'Tempo', artista: 'Outro' }
  ];
  const escolhido = I.escolher(procurado, candidatos);
  assert.strictEqual(escolhido.titulo, 'Tempo Perdido');

  const ruim = I.escolher({ titulo: 'XYZABC123', artista: 'Ninguem' }, candidatos);
  assert.strictEqual(ruim, null);
});

teste('Importar: lerEntrada (links, texto, CSV, avisos)', () => {
  const texto = [
    'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
    'https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    'Legião Urbana - Tempo Perdido',
    '',
  ].join('\n');

  const res = I.lerEntrada(texto);
  assert.strictEqual(res.itens.length, 3);
  assert.strictEqual(res.avisos.length, 1);

  const csvTexto = [
    '"Track URI","Track Name","Artist Name(s)"',
    '"spotify:track:1","Let\'s Groove","Earth, Wind & Fire"',
    '"spotify:track:2","Song ""Quote""","Artist"'
  ].join('\n');

  const resCsv = I.lerEntrada(csvTexto);
  assert.strictEqual(resCsv.itens.length, 2);
  assert.strictEqual(resCsv.itens[0].titulo, "Let's Groove");
  assert.strictEqual(resCsv.itens[0].artista, "Earth, Wind & Fire");
});

teste('Vitrine: endereço parecido não engana e item guardado é conferido', () => {
  assert.strictEqual(V.lerLink('https://youtube.com.site-falso.net/watch?v=dQw4w9WgXcQ'), null);
  assert.strictEqual(V.lerLink('https://notyoutube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.strictEqual(V.lerLink('https://open.spotify.com.falso.net/track/4u7EnebtmKWzUH433cf5Qv'), null);
  assert.ok(V.valido({ id: 'x', fonte: 'youtube', tipo: 'video', codigo: 'dQw4w9WgXcQ', lista: null }));
  assert.ok(!V.valido({ id: 'x', fonte: 'youtube', tipo: 'video', codigo: '../../evil' }));
  assert.ok(!V.valido({ id: 'x', fonte: 'spotify', tipo: 'track', codigo: 'x"><script>' }));
  assert.ok(!V.valido(null));
});

teste('Vitrine: lê links do YouTube e do Spotify', () => {
  const r1 = V.lerLink(' https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG ');
  assert.deepStrictEqual(r1, {
    fonte: 'youtube',
    tipo: 'video',
    codigo: 'dQw4w9WgXcQ',
    lista: 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG'
  });

  assert.deepStrictEqual(V.lerLink('https://youtu.be/dQw4w9WgXcQ'), {
    fonte: 'youtube',
    tipo: 'video',
    codigo: 'dQw4w9WgXcQ',
    lista: null
  });

  assert.deepStrictEqual(V.lerLink('https://www.youtube.com/shorts/dQw4w9WgXcQ'), {
    fonte: 'youtube',
    tipo: 'video',
    codigo: 'dQw4w9WgXcQ',
    lista: null
  });

  assert.deepStrictEqual(V.lerLink('https://music.youtube.com/watch?v=dQw4w9WgXcQ'), {
    fonte: 'youtube',
    tipo: 'video',
    codigo: 'dQw4w9WgXcQ',
    lista: null
  });

  assert.deepStrictEqual(V.lerLink('https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG'), {
    fonte: 'youtube',
    tipo: 'playlist',
    codigo: 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG',
    lista: null
  });

  assert.deepStrictEqual(V.lerLink('https://open.spotify.com/track/4u7EnebtmKWzUH433cf5Qv?si=abc'), {
    fonte: 'spotify',
    tipo: 'track',
    codigo: '4u7EnebtmKWzUH433cf5Qv',
    lista: null
  });

  assert.deepStrictEqual(V.lerLink('https://open.spotify.com/intl-pt/album/1GbtB4zTqAsyfZEsm1RZfx'), {
    fonte: 'spotify',
    tipo: 'album',
    codigo: '1GbtB4zTqAsyfZEsm1RZfx',
    lista: null
  });

  assert.deepStrictEqual(V.lerLink('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M'), {
    fonte: 'spotify',
    tipo: 'playlist',
    codigo: '37i9dQZF1DXcBWIGoYBM5M',
    lista: null
  });

  assert.strictEqual(V.lerLink('oi'), null);
  assert.strictEqual(V.lerLink('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.strictEqual(V.lerLink('https://youtu.be/curto'), null);
  assert.strictEqual(V.lerLink('https://open.spotify.com/track/123'), null);
  assert.strictEqual(V.lerLink('javascript:alert(1)'), null);

  const itemVideoComLista = { fonte: 'youtube', tipo: 'video', codigo: 'dQw4w9WgXcQ', lista: 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' };
  assert.strictEqual(V.enderecoDoPlayer(itemVideoComLista), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG');

  const itemAlbumSpotify = { fonte: 'spotify', tipo: 'album', codigo: '1GbtB4zTqAsyfZEsm1RZfx', lista: null };
  assert.strictEqual(V.enderecoDoPlayer(itemAlbumSpotify), 'https://open.spotify.com/embed/album/1GbtB4zTqAsyfZEsm1RZfx');
});

teste('coleção: criar playlist (nome limpo, sem repetir)', () => {
  const pls = [];
  assert.strictEqual(C.criar(pls, '   '), null);
  const a = C.criar(pls, '  Treino   da  manhã ');
  assert.strictEqual(a.nome, 'Treino da manhã');
  assert.strictEqual(C.criar(pls, 'treino da MANHÃ').nome, 'treino da MANHÃ (2)');
  assert.strictEqual(C.criar(pls, 'x'.repeat(60)).nome.length, 40);
  assert.strictEqual(pls.length, 3);
  assert.notStrictEqual(pls[0].id, pls[1].id);
});

teste('coleção: pôr, tirar, curtir e apagar de todas as listas', () => {
  const lista = [];
  assert.ok(C.por(lista, 'a'));
  assert.ok(!C.por(lista, 'a'));           // não repete
  assert.ok(C.por(lista, 'b'));
  assert.ok(C.tirar(lista, 'a'));
  assert.deepStrictEqual(lista, ['b']);
  const curtidas = [];
  assert.strictEqual(C.alternar(curtidas, 'x'), true);
  assert.strictEqual(C.alternar(curtidas, 'x'), false);
  const pls = [{ id: 'p', nome: 'P', ids: ['x', 'y'] }];
  C.alternar(curtidas, 'x');
  C.esquecer('x', curtidas, pls);
  assert.deepStrictEqual(curtidas, []);
  assert.deepStrictEqual(pls[0].ids, ['y']);
  assert.strictEqual(C.contar(1), '1 música');
  assert.strictEqual(C.contar(0), '0 músicas');
});

teste('coleção: dado estragado não quebra', () => {
  assert.deepStrictEqual(C.arrumar(null), []);
  assert.deepStrictEqual(C.arrumar([null, { id: 1 }, { id: 'p', nome: '  ', ids: [] }]), []);
  assert.deepStrictEqual(C.arrumar([{ id: 'p', nome: 'Ok', ids: ['a', 3, null] }]), [{ id: 'p', nome: 'Ok', ids: ['a'], criado: 0 }]);
});

const X = require('./extras.js');
teste('extras: corDaCapa', () => {
  // Toda vermelha
  const vermelho = new Uint8Array(24 * 24 * 4);
  for (let i = 0; i < vermelho.length; i += 4) { vermelho[i] = 255; vermelho[i+3] = 255; }
  const corV = X.corDaCapa(vermelho);
  assert.ok(corV && corV.r > 240 && corV.g < 10 && corV.b < 10);

  // Metade preta + metade azul
  const meioAzul = new Uint8Array(24 * 24 * 4);
  for (let i = 0; i < meioAzul.length; i += 8) {
    // preto (soma < 60)
    meioAzul[i] = 5; meioAzul[i+1] = 5; meioAzul[i+2] = 5; meioAzul[i+3] = 255;
    // azul
    meioAzul[i+4] = 20; meioAzul[i+5] = 40; meioAzul[i+6] = 240; meioAzul[i+7] = 255;
  }
  const corA = X.corDaCapa(meioAzul);
  assert.ok(corA && corA.b > corA.r);

  // Toda cinza ou branca
  const cinza = new Uint8Array(24 * 24 * 4);
  for (let i = 0; i < cinza.length; i += 4) { cinza[i] = 120; cinza[i+1] = 120; cinza[i+2] = 120; cinza[i+3] = 255; }
  assert.strictEqual(X.corDaCapa(cinza), null);

  // Pixels transparentes ignorados
  const trans = new Uint8Array(24 * 24 * 4);
  assert.strictEqual(X.corDaCapa(trans), null);
});

teste('extras: ajustarContraste', () => {
  // Azul escuro no tema escuro (escuro = true) deve ter luminância >= 0.45
  const azulEscuro = { r: 10, g: 10, b: 150 };
  const ajustadoEscuro = X.ajustarContraste(azulEscuro, true);
  assert.ok(X.luminancia(ajustadoEscuro) >= 0.45);

  // Amarelo claro no tema claro (escuro = false) deve ter luminância <= 0.45
  const amareloClaro = { r: 255, g: 255, b: 200 };
  const ajustadoClaro = X.ajustarContraste(amareloClaro, false);
  assert.ok(X.luminancia(ajustadoClaro) <= 0.45);
});

teste('extras: formatarTimer', () => {
  assert.strictEqual(X.formatarTimer(75), '1:15');
  assert.strictEqual(X.formatarTimer(3665), '1:01:05');
});

teste('extras: capa com duas cores fortes não vira cinza (fica a que domina)', () => {
  const px = [];
  for (let i = 0; i < 200; i++) px.push(30, 110, 220, 255);   // azul
  for (let i = 0; i < 300; i++) px.push(230, 120, 40, 255);   // laranja (mais)
  for (let i = 0; i < 400; i++) px.push(120, 100, 90, 255);   // fundo marrom apagado (muito, mas fraco)
  assert.deepStrictEqual(X.corDaCapa(px), { r: 230, g: 120, b: 40 });
});

teste('Archive: a mesma música em 2 MP3 aparece uma vez só; busca com sinais não quebra', () => {
  const Ar = require('./archive.js');
  const album = Ar.paraAlbum({ identifier: 'show1', title: 'Show', creator: 'Banda' });
  const meta = { files: [
    { name: '01 Abertura.mp3', format: 'VBR MP3', track: '1', length: '120' },
    { name: '01 Abertura_64kb.mp3', format: '64Kbps MP3', track: '1', length: '120' },
    { name: '02 Final.mp3', format: 'VBR MP3', track: '2', length: '200' },
    { name: '02 Final_64kb.mp3', format: '64Kbps MP3', track: '2', length: '200' },
  ] };
  assert.deepStrictEqual(Ar.musicasDoAlbum(meta, album).map(m => m.arquivo), ['01 Abertura.mp3', '02 Final.mp3']);
  const url = decodeURIComponent(Ar.montarBusca('( samba: "bossa"').replace(/\+/g, ' '));
  assert.ok(url.includes('(samba bossa) AND mediatype:audio'), url);
});

console.log(`\n${ok} testes passaram.`);
