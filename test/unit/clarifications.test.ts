import { describe, expect, it } from "vitest"
import { parseClarifications } from "../../src/renderer/src/lib/clarifications"

describe("parseClarifications", () => {
  it("extracts a questions block and removes it from the plain text", () => {
    const text = [
      "Before the questions.",
      "",
      "```meow-questions",
      JSON.stringify({
        intro: "Choose a path",
        questions: [
          { id: "q1", question: "Which database?", options: ["Postgres", "SQLite"], multiple: false },
        ],
      }),
      "```",
      "",
      "After the questions.",
    ].join("\n")

    const result = parseClarifications(text)

    expect(result.plain).toBe("Before the questions.\n\nAfter the questions.")
    expect(result.payloads).toEqual([
      {
        intro: "Choose a path",
        questions: [
          { id: "q1", question: "Which database?", options: ["Postgres", "SQLite"], multiple: false },
        ],
      },
    ])
  })

  it("supports multiple blocks and preserves their order", () => {
    const first = ["```meow-questions", '{"questions":[{"question":"First"}]}', "```"].join("\n")
    const second = ["```meow-questions", '{"questions":[{"question":"Second"}]}', "```"].join("\n")
    const result = parseClarifications(`${first}\n\n${second}`)

    expect(result.payloads.map((payload) => payload.questions[0]?.question)).toEqual(["First", "Second"])
    expect(result.plain).toBe("")
  })

  it("keeps malformed blocks as normal text", () => {
    const text = ["```meow-questions", "{not valid json}", "```"].join("\n")
    const result = parseClarifications(text)

    expect(result.payloads).toEqual([])
    expect(result.plain).toBe(text)
  })

  it("filters invalid questions and non-string options", () => {
    const text = [
      "```meow-questions",
      JSON.stringify({
        questions: [
          null,
          { question: 42 },
          { question: "Valid", options: ["yes", 7, null], multiple: "yes" },
        ],
      }),
      "```",
    ].join("\n")
    const result = parseClarifications(text)

    expect(result.payloads).toHaveLength(1)
    expect(result.payloads[0]?.questions).toEqual([
      { id: undefined, question: "Valid", options: ["yes"], multiple: true },
    ])
  })

  it("drops blocks that contain no valid questions", () => {
    const text = [
      "```meow-questions",
      JSON.stringify({ questions: [{ id: "missing-text" }] }),
      "```",
    ].join("\n")
    const result = parseClarifications(text)

    expect(result.payloads).toEqual([])
    expect(result.plain).toBe(text)
  })

  it("handles braces and escaped quotes inside question strings", () => {
    const text = [
      "```meow-questions",
      JSON.stringify({ questions: [{ question: 'Use {curly} and "quoted" text' }] }),
      "```",
    ].join("\n")
    const result = parseClarifications(text)

    expect(result.payloads[0]?.questions[0]?.question).toBe('Use {curly} and "quoted" text')
  })

  it("parses an unterminated block and keeps trailing prose", () => {
    const text = [
      "Before",
      "```meow-questions",
      '{"questions":[{"question":"Still parsed"}]}',
      "After",
    ].join("\n")
    const result = parseClarifications(text)

    expect(result.payloads[0]?.questions[0]?.question).toBe("Still parsed")
    expect(result.plain).toBe("Before\n\nAfter")
  })

  it("collapses excess blank lines and trims the plain text", () => {
    const text = [
      "  Start",
      "",
      "```meow-questions",
      '{"questions":[{"question":"Q"}]}',
      "```",
      "",
      "",
      "",
      "End  ",
    ].join("\n")
    const result = parseClarifications(text)

    expect(result.plain).toBe("Start\n\nEnd")
  })

  it("returns the original trimmed text when there are no blocks", () => {
    expect(parseClarifications("  Just text  ")).toEqual({ plain: "Just text", payloads: [] })
  })
})
