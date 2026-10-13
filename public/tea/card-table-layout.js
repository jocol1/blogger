(function(root) {
  function seats(players, viewerId) {
    const ids = players.map(player => typeof player === 'string' ? player : player.id);
    const start = Math.max(0, ids.indexOf(viewerId));
    return ids.map((id, index) => {
      const position = (index - start + ids.length) % ids.length;
      const edge = position === 0 ? 'bottom' : ids.length === 2 ? 'top' : ids.length === 3 ? (position === 1 ? 'left' : 'right') : ['left', 'top', 'right'][(position - 1) % 3];
      return { id, edge, position };
    });
  }
  function sortTienLen(cards, grouped = false) {
    const counts = new Map(); cards.forEach(card => counts.set(card.rank, (counts.get(card.rank) || 0) + 1));
    return [...cards].sort((a, b) => (grouped ? Number(counts.get(b.rank) > 1) - Number(counts.get(a.rank) > 1) : 0) || a.rank - b.rank || a.suit - b.suit);
  }
  function sortColor(cards, grouped = true) {
    const colors = ['red', 'yellow', 'green', 'blue', 'wild'], kinds = ['number', 'skip', 'draw2', 'wild'];
    return grouped ? [...cards].sort((a,b) => colors.indexOf(a.color) - colors.indexOf(b.color) || kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || (a.value || 0) - (b.value || 0)) : [...cards];
  }
  const api = { seats, sortTienLen, sortColor };
  if(typeof module !== 'undefined') module.exports = api; else root.CardTableLayout = api;
})(typeof window !== 'undefined' ? window : globalThis);
