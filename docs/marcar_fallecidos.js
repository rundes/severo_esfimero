/**
 * Pegar en la consola del navegador mientras severo.html está abierto y el usuario
 * está autenticado con Google (necesita token con scope de Sheets).
 *
 * Para cada DNI:
 *   - Si ya existe una fila en la hoja Ciudadanos → actualiza columna S (Fallecido)
 *   - Si no existe → crea una fila mínima con DNI + nombre + fallecido
 */
(async function marcarFallecidos() {

  const FALLECIDOS = [
    { dni: '12422103', año: '2026', nombre: 'MARTIGNONI NILDA ROSA MABEL' },
    { dni: '13454268', año: '2025', nombre: 'MONTARCE CARLOS RUBEN' },
    { dni: '5328611',  año: '2025', nombre: 'JEREZ RAMON JESUS' },
    { dni: '10571013', año: '2025', nombre: 'HERRERA CARLOS ALBERTO' },
    { dni: '18085148', año: '2025', nombre: 'CAITRU PATRICIA BEATRIZ' },
    { dni: '1047289',  año: '2025', nombre: 'PELIZZA OLGA TELMA' },
    { dni: '549495',   año: '2026', nombre: 'LUQUES IRMA INES' },
    { dni: '8114235',  año: '2026', nombre: 'BALIANI JUAN VICTORIO' },
    { dni: '20039764', año: '2026', nombre: 'ALVAREZ SILVIA SUSANA' },
    { dni: '18327624', año: 'FALLECIDO', nombre: 'MORALES LILIANA INES' },
    { dni: '5308435',  año: '2026', nombre: 'LUDUENA BERNARDO MIGUEL' },
    { dni: '17752226', año: '2026', nombre: 'GALVAN SILVIA DEL VALLE' },
    { dni: '12165593', año: '2026', nombre: 'ESCUDERO NELIDA MABEL' },
    { dni: '5529029',  año: '2026', nombre: 'CASES NICOLAS ALFREDO' },
    { dni: '5318029',  año: '2026', nombre: 'MENDIOLA ROBERTO OSCAR' },
    { dni: '3651392',  año: '2026', nombre: 'ARBERAS MARIA ANGELICA' },
    { dni: '4832616',  año: '2026', nombre: 'SOSA VICTORIA FELISA' },
    { dni: '8701112',  año: '2026', nombre: 'ERCORECA MIGUEL ANGEL' },
    { dni: '11025247', año: '2026', nombre: 'SUAREZ LUIS ALBERTO' },
    { dni: '14733349', año: '2026', nombre: 'GRIECO HECTOR RUBEN' },
    { dni: '5972966',  año: '2026', nombre: 'RODRIGUEZ SUSANA BEATRIZ' },
    { dni: '10571143', año: '2026', nombre: 'STABILE ADOLFO DANIEL' },
    { dni: '10371567', año: '2025', nombre: 'RODRIGUEZ RUBEN DARIO' },
    { dni: '4084961',  año: '2025', nombre: 'MARCAIDA NILDA B' },
    { dni: '6427811',  año: '2025', nombre: 'FLEKENSTEIN ESTER' },
    { dni: '5972962',  año: '2026', nombre: 'FILLEAUDEAU MARIA ISABEL' },
    { dni: '315748',   año: '2026', nombre: 'ECHEGARAY ELENA' },
    { dni: '5465401',  año: '2026', nombre: 'BRES MARTA N' },
    { dni: '5529026',  año: '2026', nombre: 'DE DOMENICO CARLOS A' },
    { dni: '14396008', año: '2026', nombre: 'REINAGA STELLA MARIS' },
    { dni: '5311307',  año: '2026', nombre: 'CEPEDA CARLOS O' },
    { dni: '5311329',  año: '2026', nombre: 'ETCHELET HEBERTO A' },
    { dni: '14733362', año: '2026', nombre: 'LEONELLI MARIA CRISTINA' },
    { dni: '3922666',  año: 'FALLECIDO', nombre: 'ERRECALDE MABEL N' },
  ];

  // ── Validaciones previas ──────────────────────────────────────────────────

  const token = localStorage.getItem('severo_access_token');
  if (!token) {
    console.error('❌ No hay token OAuth. Ingresá con Google en la app primero.');
    return;
  }
  if (typeof CONFIG === 'undefined') {
    console.error('❌ CONFIG no encontrado. Abrí la consola desde la app severo.html.');
    return;
  }

  const sheetId = CONFIG.SURVEY_SPREADSHEET_ID;
  const sheet   = CONFIG.SHEET_CIUDADANOS;

  // ── Leer hoja completa ────────────────────────────────────────────────────

  console.log(`Leyendo hoja "${sheet}"…`);
  const readRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheet)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!readRes.ok) {
    console.error('❌ Error al leer la hoja:', readRes.status, await readRes.text());
    return;
  }
  const { values: rows = [] } = await readRes.json();
  console.log(`  ${rows.length - 1} filas encontradas.`);

  // Col H = índice 7 (DNI), Col S = índice 18 (Fallecido)
  const DNI_COL      = 7;
  const FALLECIDO_COL = 18;

  let updated = 0, created = 0, skipped = 0, errors = 0;

  for (const { dni, año, nombre } of FALLECIDOS) {
    const rowIdx = rows.findIndex(
      (r, i) => i > 0 && String(r[DNI_COL] || '').trim() === String(dni).trim()
    );

    if (rowIdx > 0) {
      // ── Fila existente ────────────────────────────────────────────────────
      const existente = rows[rowIdx][FALLECIDO_COL];
      if (existente && existente.toString().trim() !== '') {
        console.log(`  ⟳ DNI ${dni} ya marcado: "${existente}" — omitido`);
        skipped++;
        continue;
      }

      const sheetRow = rowIdx + 1;
      const range = `${encodeURIComponent(sheet)}!S${sheetRow}`;
      const putRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?valueInputOption=USER_ENTERED`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [[año]] }),
        }
      );
      if (putRes.ok) {
        rows[rowIdx][FALLECIDO_COL] = año;
        console.log(`  ✓ ${nombre} (${dni}) → fallecido ${año}`);
        updated++;
      } else {
        console.error(`  ✗ Error actualizando DNI ${dni}:`, putRes.status);
        errors++;
      }

    } else {
      // ── Sin encuesta previa → crear fila mínima ───────────────────────────
      const id  = Date.now() + Math.floor(Math.random() * 999);
      const now = new Date().toISOString();
      // [ID, Fecha, Email op, Nombre op, Lat, Lng, Precisión, DNI, Apellido, Apodo,
      //  Domicilio, Barrio, Edad, Residencia, Calidad vida, Problemas, Mejoras, Comentarios, Fallecido]
      const newRow = [
        id, now, '', '', '', '', '',
        dni, nombre, '', '', '', '', '', '', '', '', '',
        año,
      ];
      const appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheet)}!A1:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: [newRow] }),
        }
      );
      if (appendRes.ok) {
        rows.push(newRow);
        console.log(`  + ${nombre} (${dni}) → fila nueva, fallecido ${año}`);
        created++;
      } else {
        console.error(`  ✗ Error creando DNI ${dni}:`, appendRes.status);
        errors++;
      }
    }

    // Pausa para no saturar la API
    await new Promise((r) => setTimeout(r, 350));
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`✅ Actualizados : ${updated}`);
  console.log(`➕ Creados      : ${created}`);
  console.log(`⟳  Ya marcados  : ${skipped}`);
  if (errors) console.warn(`❌ Errores      : ${errors}`);
  console.log('─────────────────────────────────────────');

})();
