import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { generateJson, InvalidAnswerError } from "./openrouter";

vi.mock("./credentials", () => ({ getCredential: async () => "test-key" }));

const Answer = z.object({ name: z.string(), years: z.number().nullable() });

/** Fake OpenRouter: answers with the given contents in turn, records every request body. */
function fakeOpenRouter(...contents: string[]) {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const content = contents[bodies.length - 1];
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return bodies;
}

describe("generateJson", () => {
  beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));
  afterEach(() => vi.unstubAllGlobals());

  it("asks for the schema's format and returns the validated answer", async () => {
    const bodies = fakeOpenRouter('{"name":"Ada","years":3}');
    expect(await generateJson("prompt", Answer)).toEqual({ name: "Ada", years: 3 });
    expect(bodies[0].response_format).toMatchObject({
      type: "json_schema",
      json_schema: { name: "answer", strict: true, schema: { required: ["name", "years"] } },
    });
    expect(bodies[0].provider).toEqual({ require_parameters: true });
  });

  it("sends an invalid answer back once, with what was wrong", async () => {
    const bodies = fakeOpenRouter('{"name":"Ada"}', '{"name":"Ada","years":null}');
    expect(await generateJson("prompt", Answer)).toEqual({ name: "Ada", years: null });
    const repair = bodies[1].messages as Array<{ role: string; content: string }>;
    expect(repair.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(repair[1].content).toBe('{"name":"Ada"}');
    expect(repair[2].content).toContain("years");
  });

  it("also repairs text that isn't JSON at all", async () => {
    fakeOpenRouter("Sure! Here is the JSON:", '{"name":"Ada","years":1}');
    expect(await generateJson("prompt", Answer)).toEqual({ name: "Ada", years: 1 });
  });

  it("gives up after the repair attempt", async () => {
    const bodies = fakeOpenRouter('{"name":1}', '{"name":2}');
    await expect(generateJson("prompt", Answer)).rejects.toBeInstanceOf(InvalidAnswerError);
    expect(bodies).toHaveLength(2);
  });
});
