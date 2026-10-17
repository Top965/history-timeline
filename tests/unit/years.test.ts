import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateRange,
  formatEventYears,
  formatRange,
  formatYear,
  formatYearShort,
} from "@/lib/format/years";

describe("formatYear", () => {
  it("formats BCE, early CE and modern years like the prototype", () => {
    expect(formatYear(-3200, "en")).toBe("3,200 BCE");
    expect(formatYear(-44, "en")).toBe("44 BCE");
    expect(formatYear(476, "en")).toBe("476 CE");
    expect(formatYear(1914, "en")).toBe("1914");
  });
  it("shows the non-existent year 0 as 1 CE and rounds positions", () => {
    expect(formatYear(0, "en")).toBe("1 CE");
    expect(formatYear(1913.6, "en")).toBe("1914");
  });
  it("formats Arabic with ق.م and م", () => {
    expect(formatYear(-44, "ar")).toBe("44 ق.م");
    expect(formatYear(622, "ar")).toBe("622 م");
    expect(formatYear(1961, "ar")).toBe("1961");
  });
  it("drops the CE suffix in short form", () => {
    expect(formatYearShort(500, "en")).toBe("500");
    expect(formatYearShort(-500, "en")).toBe("500 BCE");
    expect(formatYearShort(500, "ar")).toBe("500");
  });
});

describe("event and range labels", () => {
  it("marks approximate dates and spans", () => {
    expect(formatEventYears({ startYear: -2560, endYear: null, isApproximate: true }, "en")).toBe("c. 2,560 BCE");
    expect(formatEventYears({ startYear: 1914, endYear: 1918 }, "en")).toBe("1914 – 1918");
    expect(formatEventYears({ startYear: 1914, endYear: 1914 }, "en")).toBe("1914");
    expect(formatEventYears({ startYear: 1760, endYear: 1840, isApproximate: true }, "ar")).toBe("نحو 1760 – 1840");
  });
  it("shows open-ended ranges as running to today", () => {
    expect(formatRange({ startYear: 1930, endYear: null }, "en")).toBe("1930 – today");
    expect(formatRange({ startYear: 1917, endYear: null }, "ar")).toBe("1917 – اليوم");
  });
});

describe("formatDate", () => {
  it("formats ISO dates in UTC regardless of server time zone", () => {
    expect(formatDate("1914-06-28", "en")).toBe("28 Jun 1914");
    expect(formatDate("1918-11-11", "ar")).toBe("11 نوفمبر 1918");
    expect(formatDateRange("1914-07-28", "1918-11-11", "en")).toBe("28 Jul 1914 – 11 Nov 1918");
  });
  it("rejects invalid dates", () => {
    expect(() => formatDate("not-a-date", "en")).toThrow(RangeError);
  });
});
