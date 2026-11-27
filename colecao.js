// colecao.js: as contas das suas playlists e curtidas (etapa 3).
// Uma playlist é só uma LISTA DE NÚMEROS (os ids das músicas), não uma cópia das músicas.
// Igual a um caderno de receitas que diz "página 12, página 40": a receita fica no livro.
// Não usa a tela nem o navegador: dá para testar no Node (teste.js).
(function (raiz) {
  'use strict';

  const MAX_NOME = 40;
  const limparNome = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, MAX_NOME).trim();

  // Cria uma playlist nova. Nome repetido ganha um número: "Treino", "Treino (2)"
  function criar(playlists, nome, agora = Date.now()) {
    const base = limparNome(nome);
    if (!base) return null;
    const usado = n => playlists.some(p => p.nome.toLowerCase() === n.toLowerCase());
    let final = base, k = 2;
    while (usado(final)) final = `${base} (${k++})`;
    const pl = { id: 'pl-' + agora.toString(36) + Math.random().toString(36).slice(2, 6), nome: final, ids: [], criado: agora };
    playlists.push(pl);
    return pl;
  }

  // Põe a música na lista (sem repetir). Devolve true se entrou agora.
  function por(lista, id) {
    if (!id || lista.includes(id)) return false;
    lista.push(id);
    return true;
  }

  function tirar(lista, id) {
    const i = lista.indexOf(id);
    if (i < 0) return false;
    lista.splice(i, 1);
    return true;
  }

  // Curtiu? Descurte. Não curtiu? Curte. Devolve como ficou.
  function alternar(lista, id) {
    if (tirar(lista, id)) return false;
    por(lista, id);
    return true;
  }

  // Apagou a música do aparelho: some de todas as listas também
  function esquecer(id, curtidas, playlists) {
    tirar(curtidas, id);
    playlists.forEach(p => tirar(p.ids, id));
  }

  // Confere o que veio guardado (dado estranho vira lista vazia, em vez de quebrar o app)
  function arrumar(playlists) {
    if (!Array.isArray(playlists)) return [];
    return playlists
      .filter(p => p && typeof p.id === 'string' && limparNome(p.nome))
      .map(p => ({ id: p.id, nome: limparNome(p.nome), ids: Array.isArray(p.ids) ? p.ids.filter(x => typeof x === 'string') : [], criado: p.criado || 0 }));
  }

  const contar = n => n + (n === 1 ? ' música' : ' músicas');

  const api = { MAX_NOME, limparNome, criar, por, tirar, alternar, esquecer, arrumar, contar };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.Colecao = api;
})(this);
