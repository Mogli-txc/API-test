const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const Q = [
  // Jardim Apoema
  ['Apoema','R_PauloDessyJuan','Rua Paulo Dessy Juan, Tupã, São Paulo'],
  ['Apoema','R_CarlosGomesPato','Rua Carlos Gomes Pato, Tupã, São Paulo'],
  // Jardim Paulista
  ['Paulista','R_Brasil','Rua Brasil, Jardim Paulista, Tupã, São Paulo'],
  ['Paulista','R_Irapuru','Rua Irapuru, Tupã, São Paulo'],
  ['Paulista','R_Adamantina','Rua Adamantina, Tupã, São Paulo'],
  ['Paulista','R_Junqueiropolis','Rua Junqueirópolis, Tupã, São Paulo'],
  ['Paulista','R_Parapua','Rua Parapuã, Tupã, São Paulo'],
  ['Paulista','R_Gracianopolis','Rua Gracianópolis, Tupã, São Paulo'],
  // Vila Lahoz
  ['Lahoz','R_DonaPalma','Rua Dona Palma, Tupã, São Paulo'],
  ['Lahoz','Av_LelioPizza','Avenida Lélio Pizza, Tupã, São Paulo'],
  ['Lahoz','R_AntonioLahoz','Rua Antônio Lahoz, Tupã, São Paulo'],
  ['Lahoz','R_AbelFerreira','Rua Abel Ferreira Leite, Tupã, São Paulo'],
  // Jardim Santo Antônio
  ['StoAntonio','R_RioClaro','Rua Rio Claro, Tupã, São Paulo'],
  ['StoAntonio','Av_Centenario','Avenida Centenário, Tupã, São Paulo'],
  ['StoAntonio','R_Olimpia','Rua Olímpia, Tupã, São Paulo'],
];
(async () => {
  for (const [bairro,label,q] of Q) {
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=default`;
      const res = await fetch(url, { headers: { 'User-Agent': 'api-caronas/1.0 (test)' } });
      const d = await res.json();
      const f = d.features && d.features[0];
      if (!f) { console.log(`${bairro}\t${label}\tEMPTY`); }
      else {
        const [lon, lat] = f.geometry.coordinates;
        const p = f.properties || {};
        const cidade = p.city || p.county || p.town || '';
        const ok = /tup/i.test(cidade) ? 'OK' : 'CHECK';
        console.log(`${ok}\t${bairro}\t${label}\t${lat.toFixed(6)}\t${lon.toFixed(6)}\t${p.name||''} | ${cidade} | ${p.state||''}`);
      }
    } catch (e) { console.log(`${bairro}\t${label}\tERR ${e.message}`); }
    await sleep(1300);
  }
  process.exit(0);
})();
