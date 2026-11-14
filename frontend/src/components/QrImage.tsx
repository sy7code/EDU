import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** 글자를 QR 이미지로 그린다. 그리는 데 실패하면 아무것도 그리지 않는다. */
export function QrImage({ value, size = 168, alt, displaySize }: { value: string; size?: number; alt: string; displaySize?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: size })
      .then((d) => alive && setSrc(d))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);
  if (!src) return null;
  const px = displaySize ?? size;
  return <img src={src} width={px} height={px} alt={alt} />;
}
