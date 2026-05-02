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
};
