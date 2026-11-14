import { describe, expect, it } from "vitest";
import { ApiError } from "../api/types";
import { isRetryable } from "./retryable";

describe("isRetryable", () => {
  it("NOT_FOUND는 다시 시도하지 않는다", () => expect(isRetryable(new ApiError("NOT_FOUND"))).toBe(false));
  it("FORBIDDEN은 다시 시도하지 않는다", () => expect(isRetryable(new ApiError("FORBIDDEN"))).toBe(false));
  it("그 밖의 오류는 다시 시도할 수 있다", () => {
    expect(isRetryable(new ApiError("UNKNOWN"))).toBe(true);
    expect(isRetryable(new Error("network"))).toBe(true);
  });
});
