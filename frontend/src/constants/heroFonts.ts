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
  { label: 'Pequeno (24px)', value: 24 },
  { label: 'Médio (32px)', value: 32 },
  { label: 'Grande (40px)', value: 40 },
  { label: 'Extra Grande (48px)', value: 48 },
  { label: 'Enorme (56px)', value: 56 },
  { label: 'Gigante (64px)', value: 64 },
  { label: 'Mega (72px)', value: 72 },
];

export const HERO_FONT_WEIGHTS = [
  { label: 'Normal (400)', value: 400 },
  { label: 'Médio (500)', value: 500 },
  { label: 'Semi-negrito (600)', value: 600 },
  { label: 'Negrito (700)', value: 700 },
  { label: 'Extra Negrito (800)', value: 800 },
  { label: 'Preto (900)', value: 900 },
];
