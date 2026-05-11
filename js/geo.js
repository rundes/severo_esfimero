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
    if (CONFIG.GOOGLE_API_KEY) {
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${CONFIG.GOOGLE_API_KEY}&language=es&result_type=street_address`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'OK' && data.results?.[0]) return data.results[0].formatted_address;
        }
      } catch {}
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`,
        { headers: { 'User-Agent': 'SeveroMaipu/1.0' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.display_name) return data.display_name;
      }
    } catch {}
    return null;
  },

  async geocode(query) {
    if (!query) return null;
    if (CONFIG.GOOGLE_API_KEY) {
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${CONFIG.GOOGLE_API_KEY}&language=es&region=ar`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'OK' && data.results?.[0]) {
            const r = data.results[0];
            return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, address: r.formatted_address };
          }
        }
      } catch {}
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=ar&accept-language=es`,
        { headers: { 'User-Agent': 'SeveroMaipu/1.0' } }
      );
      if (res.ok) {
        const data = await res.json();
        if (data?.[0]) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), address: data[0].display_name };
      }
    } catch {}
    return null;
  },
};
