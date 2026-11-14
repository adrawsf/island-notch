/** Chinese -> Hanyu Pinyin with tone marks (Cantonese lyrics get Mandarin readings). */
export async function romanizeChinese(lines: string[]): Promise<string[]> {
  const { pinyin } = await import("pinyin-pro");
  return lines.map((line) =>
    pinyin(line, { toneType: "symbol", nonZh: "consecutive", type: "string" })
      .replace(/\s+([,.!?，。！？、])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim(),
  );
}
