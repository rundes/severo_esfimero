// Límites de barrios de Maipú — extraído del KMZ oficial
const BARRIOS_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Villa Italia' }, geometry: { type: 'Polygon', coordinates: [[
      [-57.884581,-36.8618707],[-57.877865,-36.8561197],[-57.882843,-36.8519477],
      [-57.896276,-36.8635187],[-57.89104,-36.8672617],[-57.884581,-36.8618707]
    ]] } },
    { type: 'Feature', properties: { name: 'Villa Vanelli' }, geometry: { type: 'Polygon', coordinates: [[
      [-57.883101,-36.879689],[-57.874689,-36.87224],[-57.883294,-36.865528],
      [-57.884302,-36.866352],[-57.887135,-36.864154],[-57.890954,-36.867433],
      [-57.889087,-36.868961],[-57.892714,-36.871828],[-57.883101,-36.879689]
    ]] } },
    { type: 'Feature', properties: { name: 'Barrio Belgrano' }, geometry: { type: 'Polygon', coordinates: [[
      [-57.871041,-36.854969],[-57.870097,-36.850196],[-57.870719,-36.850299],
      [-57.87132,-36.850694],[-57.87411,-36.85296],[-57.877736,-36.856171],
      [-57.878616,-36.856995],[-57.879581,-36.857682],[-57.876792,-36.859794],
      [-57.873788,-36.857304],[-57.871041,-36.854969]
    ]] } },
    { type: 'Feature', properties: { name: 'Barrio Centro' }, geometry: { type: 'Polygon', coordinates: [[
      [-57.8794958,-36.8577854],[-57.887135,-36.864154],[-57.884302,-36.866352],
      [-57.8765777,-36.859862],[-57.8794958,-36.8577854]
    ]] } },
    { type: 'Feature', properties: { name: 'Barrio Alvarado' }, geometry: { type: 'Polygon', coordinates: [[
      [-57.8713098,-36.8553724],[-57.8795068,-36.8623604],[-57.8765668,-36.8645754],
      [-57.8719318,-36.8605064],[-57.8713098,-36.8553724]
    ]] } },
    { type: 'Feature', properties: { name: 'Barrio Unión' }, geometry: { type: 'Polygon', coordinates: [[
      [-57.883036,-36.865528],[-57.87456,-36.872154],[-57.873895,-36.871587],
      [-57.872071,-36.860927],[-57.876556,-36.864704],[-57.879646,-36.86242],
      [-57.883036,-36.865528]
    ]] } },
    { type: 'Feature', properties: { name: 'Barrio Santo Domigo' }, geometry: { type: 'Polygon', coordinates: [[
      [-57.59016,-36.703522],[-57.592478,-36.714463],[-57.578144,-36.719004],
      [-57.573338,-36.705449],[-57.59016,-36.703522]
    ]] } },
    { type: 'Feature', properties: { name: 'Barrio Segurola' }, geometry: { type: 'Polygon', coordinates: [[
      [-57.463989,-36.827837],[-57.467937,-36.834294],[-57.455921,-36.839927],
      [-57.450428,-36.831478],[-57.463989,-36.827837]
    ]] } },
    { type: 'Feature', properties: { name: 'Barrio Monsalvo' }, geometry: { type: 'Polygon', coordinates: [[
      [-57.36434,-36.876977],[-57.366786,-36.880959],[-57.356358,-36.887207],
      [-57.352667,-36.881577],[-57.36434,-36.876977]
    ]] } },
    { type: 'Feature', properties: { name: 'Las Armas' }, geometry: { type: 'Polygon', coordinates: [[
      [-57.826202,-37.076203],[-57.83869,-37.077675],[-57.835,-37.09024],
      [-57.821352,-37.088391],[-57.826202,-37.076203]
    ]] } },
  ],
};

// Mapea nombres del KMZ a los valores usados en la encuesta
const _barrioNameMap = {
  'Villa Italia':        'Villa Italia',
  'Villa Vanelli':       'Villa Vannelli',
  'Barrio Belgrano':     'Belgrano',
  'Barrio Centro':       'Centro',
  'Barrio Alvarado':     'Alvarado',
  'Barrio Unión':        'Unión',
  'Barrio Santo Domigo': 'Santo Domingo',
  'Barrio Segurola':     'Segurola',
  'Barrio Monsalvo':     'Monsalvo',
  'Las Armas':           'Las Armas',
};

const _barrioColorMap = {
  'Villa Italia':        '#3949AB',
  'Villa Vanelli':       '#7B1FA2',
  'Barrio Belgrano':     '#00838F',
  'Barrio Centro':       '#388E3C',
  'Barrio Alvarado':     '#E64A19',
  'Barrio Unión':        '#5E35B1',
  'Barrio Santo Domigo': '#C62828',
  'Barrio Segurola':     '#1565C0',
  'Barrio Monsalvo':     '#2E7D32',
  'Las Armas':           '#F57F17',
};

// Ray-casting point-in-polygon; ring = [[lng, lat], ...]
function _pointInRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; // xi=lng, yi=lat
    const [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Devuelve el valor de barrio para la encuesta, o null si no cae en ninguno
function barrioFromPoint(lat, lng) {
  for (const f of BARRIOS_GEOJSON.features) {
    if (_pointInRing(lat, lng, f.geometry.coordinates[0])) {
      return _barrioNameMap[f.properties.name] || null;
    }
  }
  return null;
}

const BARRIOS_LAYER_OPTIONS = {
  style(feature) {
    const c = _barrioColorMap[feature.properties.name] || '#546E7A';
    return { color: c, weight: 2, opacity: 0.75, fillColor: c, fillOpacity: 0.12 };
  },
  onEachFeature(feature, layer) {
    const label = (feature.properties.name || '').replace(/^Barrio /, '');
    layer.bindTooltip(label, { sticky: true, className: 'barrio-tooltip' });
    layer.on({
      mouseover: (e) => e.target.setStyle({ fillOpacity: 0.3 }),
      mouseout:  (e) => e.target.setStyle({ fillOpacity: 0.12 }),
    });
  },
};
