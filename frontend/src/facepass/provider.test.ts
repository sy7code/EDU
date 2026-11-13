import { afterEach, describe, expect, it, vi } from "vitest";
import { TossFacePassProvider } from "./provider";

afterEach(() => vi.useRealTimers());

describe("TossFacePassProvider", () => {
  it("단말기가 결과를 안 보내면 시간 초과로 끝낸다 (화면이 멈추지 않게)", async () => {
    vi.useFakeTimers();
    const off = vi.fn();
    const sdk = { facePass: { listenData: () => off, start: async () => ({ type: "SUCCESS" as const }) } };
    const p = new TossFacePassProvider(sdk, 30_000).authenticate();
    const assertion = expect(p).rejects.toThrow("FACEPASS_TIMEOUT");
    await vi.advanceTimersByTimeAsync(30_001);
    await assertion;
    expect(off).toHaveBeenCalled();
  });
});
