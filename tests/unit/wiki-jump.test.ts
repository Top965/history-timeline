import { describe, expect, it } from "vitest";
import { matchSection, normalize } from "@/lib/wiki/jump";

const saddam = [
  { title: "Early life", text: "Born in Al-Awja near Tikrit." },
  { title: "Iran–Iraq War", text: "In 1980 Iraq invaded Iran." },
  {
    title: "Gulf War",
    text: "The invasion of Kuwait began on 2 August 1990. After the invasion of Kuwait the UN imposed sanctions.",
  },
  { title: "Family", text: "He married Sajida Talfah. Kuwait is not mentioned here, but the invasion of Kuwait is." },
];

describe("matchSection", () => {
  it("prefers a section whose title names the moment", () => {
    expect(matchSection("Iran–Iraq War", saddam)).toBe(1);
  });

  it("falls back to the section that tells it most often, dropping a leading word", () => {
    expect(matchSection("Iraqi invasion of Kuwait", saddam)).toBe(2);
  });

  it("finds the section holding most of the label's words when none names it outright", () => {
    expect(matchSection("Invasion and liberation of Kuwait", saddam)).toBe(2);
    const ar = [
      { title: "النشأة", text: "ولد في العوجة" },
      { title: "حرب الخليج", text: "في عام 1990 أمر بغزو الكويت، وبقيت القوات في الكويت حتى 1991" },
    ];
    expect(matchSection("غزو الكويت وتحريرها", ar)).toBe(1);
    expect(matchSection("Liberation of Paris", saddam)).toBe(-1);
  });

  it("ignores club affixes, accents and Arabic diacritics", () => {
    const club = [{ title: "Barcelona", text: "" }];
    expect(matchSection("FC Barcelona", club)).toBe(0);
    expect(normalize("São Paulo")).toBe(" sao paulo ");
    expect(matchSection("غَزو الكويت", [{ title: "حرب الخليج", text: "بدأ غزو الكويت عام 1990" }])).toBe(0);
  });

  it("does not count a longer moment's mentions as a shorter one's", () => {
    const iraq = [
      ...saddam,
      { title: "Capture and trial", text: "During the Iraq War he was captured in December 2003." },
    ];
    const others = ["Iran–Iraq War", "Iraq War", "Gulf War"];
    expect(matchSection("Iraq War", iraq)).toBe(1);
    expect(matchSection("Iraq War", iraq, others)).toBe(4);
    expect(matchSection("Iran–Iraq War", iraq, others)).toBe(1);
  });

  it("guesses nothing when no section names it", () => {
    expect(matchSection("Moon landing", saddam)).toBe(-1);
    expect(matchSection("War", saddam)).toBe(-1);
  });
});
