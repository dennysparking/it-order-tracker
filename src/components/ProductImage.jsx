import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { isValidUrl, getItemEmoji } from '../utils';

export default function ProductImage({ url, imageUrl, name, onImageLoad, orderId, size = 48 }) {
  const [img, setImg] = useState(imageUrl || null);
  const [loading, setLoading] = useState(false);
  const attempted = useRef(false);

  useEffect(() => {
    if (imageUrl) { setImg(imageUrl); return; }
    if (!url || !isValidUrl(url) || attempted.current) return;
    attempted.current = true;
    setLoading(true);
    api.get(`/api/preview?url=${encodeURIComponent(url)}`).then(res => {
      setLoading(false);
      if (res?.image) {
        setImg(res.image);
        if (onImageLoad) onImageLoad(res.image);
        // Auto-persist to DB so future loads skip the fetch
        if (orderId && !imageUrl) {
          api.patch(`/api/orders/${orderId}/image`, { image_url: res.image }).catch(() => {});
        }
      }
    }).catch(() => setLoading(false));
  }, [url, imageUrl]);

  if (loading) return (
    <div style={{
      width: size, height: size, borderRadius: 8, background: "var(--bg-input)",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      fontSize: size * 0.35, color: "var(--text-dimmed)",
    }}>...</div>
  );

  if (!img) return (
    <div style={{
      width: size, height: size, borderRadius: 8, background: "var(--bg-tertiary)",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      fontSize: size * 0.4, color: "var(--text-dimmed)",
    }}>{getItemEmoji(name)}</div>
  );

  return (
    <img src={img} alt="" style={{
      width: size, height: size, borderRadius: 8, objectFit: "cover", flexShrink: 0,
      background: "#fff",
    }} onError={() => setImg(null)} />
  );
}
