export interface HeroFont {
  label: string;
  value: string; // CSS font-family value
  importUrl: string | null;
}

export const HERO_FONTS: HeroFont[] = [
  { label: 'Sistema (padrão)', value: 'system-ui, sans-serif', importUrl: null },
  {
    label: 'Inter',
    value: "'Inter', sans-serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Inter:ital,wght@0,400;0,500;0,600;0,700;0,900;1,400;1,700&display=swap',
  },
  {
    label: 'Roboto',
    value: "'Roboto', sans-serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,400;0,500;0,700;0,900;1,400;1,700&display=swap',
  },
  {
    label: 'Open Sans',
    value: "'Open Sans', sans-serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;0,700;0,800;1,400;1,700&display=swap',
  },
  {
    label: 'Poppins',
    value: "'Poppins', sans-serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400;1,700&display=swap',
  },
  {
    label: 'Montserrat',
    value: "'Montserrat', sans-serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,600;0,700;0,900;1,400;1,700&display=swap',
  },
  {
    label: 'Lato',
    value: "'Lato', sans-serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;0,900;1,400;1,700&display=swap',
  },
  {
    label: 'Nunito',
    value: "'Nunito', sans-serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400;1,700&display=swap',
  },
  {
    label: 'Raleway',
    value: "'Raleway', sans-serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Raleway:ital,wght@0,400;0,600;0,700;0,800;1,400;1,700&display=swap',
  },
  {
    label: 'Oswald',
    value: "'Oswald', sans-serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap',
  },
  {
    label: 'Playfair Display',
    value: "'Playfair Display', serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700&display=swap',
  },
  {
    label: 'Merriweather',
    value: "'Merriweather', serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;0,900;1,400;1,700&display=swap',
  },
  {
    label: 'Lora',
    value: "'Lora', serif",
    importUrl: 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400;1,700&display=swap',
  },
];

export const HERO_FONT_SIZES = [
  { label: 'Pequeno', value: 24 },
  { label: 'Médio', value: 32 },
  { label: 'Grande', value: 40 },
  { label: 'Extra Grande', value: 48 },
  { label: 'Enorme', value: 56 },
  { label: 'Gigante', value: 64 },
  { label: 'Máximo', value: 72 },
];

export const HERO_FONT_WEIGHTS = [
  { label: 'Fino', value: 400 },
  { label: 'Médio', value: 500 },
  { label: 'Semi-negrito', value: 600 },
  { label: 'Negrito', value: 700 },
  { label: 'Extra Negrito', value: 800 },
  { label: 'Preto', value: 900 },
];

// Font sizes suitable for section body/title text (smaller scale than hero)
export const SECTION_TITLE_SIZES = [
  { label: 'Pequeno', value: 20 },
  { label: 'Médio', value: 24 },
  { label: 'Grande', value: 28 },
  { label: 'Extra Grande', value: 32 },
  { label: 'Enorme', value: 40 },
];

export const SECTION_BODY_SIZES = [
  { label: 'Pequeno', value: 13 },
  { label: 'Normal', value: 15 },
  { label: 'Médio', value: 17 },
  { label: 'Grande', value: 19 },
  { label: 'Extra Grande', value: 22 },
];
