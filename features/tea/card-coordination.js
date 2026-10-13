const DEFINITIONS = [
  ['color', 'tea_card_games', tableId => tableId],
  ['tienlen', 'tea_tienlen_games', tableId => tableId],
  ['baicao', 'tea_classic_card_games', tableId => `${tableId}-baicao`],
  ['poker', 'tea_classic_card_games', tableId => `${tableId}-poker`],
];

// Reading every mode in the same transaction serializes deals across the table.
async function readCardGames(tx, db, tableId) {
  const entries = await Promise.all(DEFINITIONS.map(async ([key, collection, docId]) => {
    const ref = db.collection(collection).doc(docId(tableId));
    return [key, { ref, snapshot: await tx.get(ref) }];
  }));
  return Object.fromEntries(entries);
}

function activeCardGame(rows, except = null) {
  return DEFINITIONS.find(([key]) => key !== except && rows[key]?.snapshot.exists && rows[key].snapshot.data().status === 'active')?.[0] || null;
}

module.exports = { readCardGames, activeCardGame };
