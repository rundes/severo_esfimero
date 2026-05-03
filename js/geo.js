const Geo = {
  async getLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('El navegador no soporta geolocalización'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        }),
        (err) => {
          const msgs = {
            1: 'Permiso de ubicación denegado',
            2: 'Ubicación no disponible',
            3: 'Tiempo de espera agotado',
          };
          reject(new Error(msgs[err.code] || 'Error al obtener ubicación'));
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      );
    });
  },

  format(location) {
    if (!location) return 'Sin ubicación';
    return `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} (±${location.accuracy}m)`;
  },

  mapsUrl(location) {
    if (!location) return null;
    return `https://www.google.com/maps?q=${location.lat},${location.lng}`;
  },

  async reverseGeocode(lat, lng) {
    if (!CONFIG.GOOGLE_API_KEY) return null;
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${CONFIG.GOOGLE_API_KEY}&language=es&result_type=street_address`
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status === 'OK' && data.results?.[0]) {
        return data.results[0].formatted_address;
      }
    } catch {}
    return null;
  },

  async geocode(query) {
    if (!CONFIG.GOOGLE_API_KEY || !query) return null;
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${CONFIG.GOOGLE_API_KEY}&language=es&region=ar`
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status === 'OK' && data.results?.[0]) {
        const r = data.results[0];
        return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, address: r.formatted_address };
      }
    } catch {}
    return null;
  },
};
