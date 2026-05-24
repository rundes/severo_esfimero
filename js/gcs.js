// ── Google Cloud Storage ─────────────────────────────────────────────────────
// Bucket: maipu-pba
// Requiere scope: https://www.googleapis.com/auth/devstorage.read_write
// Para visualizar fotos el bucket debe tener IAM: allUsers → roles/storage.objectViewer
//
// CORS del bucket (gcloud storage buckets update gs://maipu-pba --cors-file=cors.json):
// [{"origin":["*"],"method":["GET","POST","PUT"],"responseHeader":["*"],"maxAgeSeconds":3600}]

const GCS = {
  async compress(file, maxPx = 1200, quality = 0.78) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const ratio = Math.min(maxPx / Math.max(img.width, img.height), 1);
          const canvas = document.createElement('canvas');
          canvas.width  = Math.round(img.width  * ratio);
          canvas.height = Math.round(img.height * ratio);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(resolve, 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  async upload(blob, filename) {
    const token = localStorage.getItem('severo_access_token');
    if (!token) throw new Error('401');
    const bucket = (typeof CONFIG !== 'undefined' && CONFIG.GCS_BUCKET) || 'maipu-pba';
    const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(filename)}&predefinedAcl=publicRead`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
      body: blob,
    });
    if (res.status === 401) throw new Error('401');
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`GCS ${res.status}: ${body.error?.message || 'Error al subir la foto'}`);
    }
    // Los slashes del nombre deben quedar sin codificar en la URL pública
    const publicName = filename.split('/').map(encodeURIComponent).join('/');
    return `https://storage.googleapis.com/${bucket}/${publicName}`;
  },

  filename(prefix = 'fotos') {
    const ts  = Date.now();
    const rnd = Math.random().toString(36).slice(2, 8);
    return `${prefix}/${ts}-${rnd}.jpg`;
  },
};
