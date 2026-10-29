import { describe, expect, it } from "vitest";
import { ShadowError } from "../errors";
import { readBoundedStream } from "../github";

function streamOf(...chunks: number[][]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk));
      controller.close();
    },
  });
}

describe("bounded GitHub archive reads", () => {
  it("combines chunks without changing their bytes", async () => {
    await expect(readBoundedStream(streamOf([1, 2], [3], [4, 5]), 5)).resolves.toEqual(
      new Uint8Array([1, 2, 3, 4, 5]),
    );
  });

  it("rejects archives as soon as streamed bytes exceed the limit", async () => {
    await expect(readBoundedStream(streamOf([1, 2], [3, 4]), 3)).rejects.toMatchObject<Partial<ShadowError>>({
      code: "TOO_LARGE",
    });
  });
});
