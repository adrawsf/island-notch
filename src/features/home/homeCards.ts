/** Cards the home tab can show (ids stored in the `homeCards` setting). */
export const HOME_CARDS: { id: string; label: string; hint: string }[] = [
  { id: "clock", label: "Jam & tanggal", hint: "Jam besar di atas." },
  { id: "worldClocks", label: "World clock", hint: "Sampai 4 kota." },
  { id: "image", label: "Gambar", hint: "Foto atau GIF pilihanmu." },
  { id: "pet", label: "Kucing piksel", hint: "Klik untuk mengelus." },
];

export const HOME_CARD_IDS = HOME_CARDS.map((c) => c.id);
