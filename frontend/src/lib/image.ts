/** 긴 변이 maxSide 이하가 되도록 비율을 지켜 줄인 크기. 이미 작으면 그대로(키우지 않음) */
export function fitWithin(width: number, height: number, maxSide = 1600): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * 브라우저 전용: 사진 파일을 긴 변 maxSide 이하 JPEG data URL로 줄인다 (서버 2MB 제한 아래로).
 * 원본·결과를 어디에도 저장하지 않는다. 읽기·그리기에 실패하면 reject.
 */
export async function toJpegDataUrl(file: File, maxSide = 1600, quality = 0.8): Promise<string> {
  // 일부 기기·앱은 사진의 type을 비워서 준다. 비어 있으면 디코딩을 시도하고, 종류가 있는데 이미지가 아닐 때만 거절
  if (file.type !== "" && !file.type.startsWith("image/")) throw new Error("not an image");
  // 휴대폰 사진의 회전 정보(EXIF)를 반영해서 그린다
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    // JPEG는 투명을 못 담으므로 흰 바탕 (PNG 캡처의 투명 부분이 검게 나오지 않게)
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const url = canvas.toDataURL("image/jpeg", quality);
    if (!url.startsWith("data:image/jpeg")) throw new Error("jpeg encode failed");
    return url;
  } finally {
    bitmap.close();
  }
}
