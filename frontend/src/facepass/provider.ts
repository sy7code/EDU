// 토스플레이스 FacePass 어댑터.
// 실제 SDK: https://docs.tossplace.com/reference/plugin-sdk/front/face-pass.html
// 단말기 플러그인 안에서만 전역 sdk.facePass 가 존재한다. 얼굴 정보는 오지 않고 시리얼(merchantUserKey)만 온다.
import type { FacePassRaw } from "../types/domain";

export interface FaceAuthProvider {
  readonly kind: "toss" | "mock";
  authenticate(): Promise<FacePassRaw>;
}

type TossSdk = {
  facePass: {
    start(params?: { showResultScreen?: boolean }): Promise<{ type: "SUCCESS" | "FAILED" }>;
    listenData(cb: (p: FacePassRaw) => void): () => void;
  };
};

function tossSdk(): TossSdk | null {
  const g = globalThis as unknown as { sdk?: TossSdk };
  return g.sdk?.facePass ? g.sdk : null;
}

export class TossFacePassProvider implements FaceAuthProvider {
  readonly kind = "toss" as const;
  constructor(private readonly sdk: TossSdk) {}

  authenticate(): Promise<FacePassRaw> {
    return new Promise((resolve, reject) => {
      // 1) 리스너 먼저 등록 → 2) start 호출 (문서 권장 순서)
      const off = this.sdk.facePass.listenData((p) => {
        off();
        resolve(p);
      });
      this.sdk.facePass
        .start({ showResultScreen: false })
        .then((r) => {
          if (r.type === "FAILED") {
            off();
            reject(new Error("FACEPASS_RENDER_FAILED"));
          }
        })
        .catch((e) => {
          off();
          reject(e);
        });
    });
  }
}

/** 단말기 밖(개발·데모)에서 쓰는 가짜 인증. 화면에서 고른 시리얼로 결과를 만든다. */
export class MockFacePassProvider implements FaceAuthProvider {
  readonly kind = "mock" as const;
  constructor(private readonly pick: () => Promise<{ serial: string | null; fail?: boolean }>) {}

  async authenticate(): Promise<FacePassRaw> {
    const { serial, fail } = await this.pick();
    await new Promise((r) => setTimeout(r, 900)); // 인식 중 연출
    if (fail || !serial) {
      return { authenticated: false, result: "FaceFailed", message: "얼굴을 인식하지 못했어요" };
    }
    return { merchantUserKey: serial, authenticated: true, result: "Authenticated", message: "" };
  }
}

export function detectTossSdk(): TossSdk | null {
  return tossSdk();
}

export const FACEPASS_RESULT_TEXT: Record<FacePassRaw["result"], string> = {
  Authenticated: "인증되었어요",
  FaceFailed: "얼굴을 인식하지 못했어요. 다시 시도하거나 QR·바코드를 써 주세요.",
  Blocked: "인증이 차단되었어요. 선생님께 알려 주세요.",
  Denied: "인증이 거부되었어요. 선생님께 알려 주세요.",
  Disconnected: "단말기 연결이 끊겼어요. 잠시 후 다시 시도해 주세요.",
  Canceled: "인증을 취소했어요.",
  Timeout: "시간이 초과되었어요. 다시 시도해 주세요.",
};
