/**
 * Seções compartilhadas do site do terreiro — usadas pelo site público
 * (`/[tenantSlug]`) e pela prévia do editor (`/admin/meu-site`).
 */
import React from 'react';
import type { SectionContext, SiteSection } from '../types';
import { Hero } from './Hero';
import { About } from './About';
import { Video } from './Video';
import { GirasCalendar } from './GirasCalendar';
import { Location } from './Location';
import { Contact } from './Contact';
import { Sponsor } from './Sponsor';
import { CustomText } from './CustomText';
import { Gallery } from './Gallery';
import { Linhas } from './Linhas';
import { Rotina } from './Rotina';
import { Faq } from './Faq';
import { Social } from './Social';
import { Ajudar } from './Ajudar';

export { Hero, About, Video, GirasCalendar, Location, Contact, Sponsor, CustomText, Gallery, Linhas, Rotina, Faq, Social, Ajudar };

export function renderSection(section: SiteSection, ctx: SectionContext): React.ReactNode {
  const { section_type, config, id } = section;
  switch (section_type) {
    case 'HERO':
      return <Hero key={id} config={config} ctx={ctx} />;
    case 'ABOUT':
      return <About key={id} config={config} ctx={ctx} />;
    case 'VIDEO_EMBED':
      return <Video key={id} config={config} ctx={ctx} />;
    case 'GIRAS_CALENDAR':
      return <GirasCalendar key={id} config={config} ctx={ctx} />;
    case 'LOCATION':
      return <Location key={id} config={config} ctx={ctx} />;
    case 'CONTACT':
      return <Contact key={id} config={config} ctx={ctx} />;
    case 'SPONSOR':
      return <Sponsor key={id} config={config} ctx={ctx} />;
    case 'CUSTOM_TEXT':
      return <CustomText key={id} config={config} ctx={ctx} />;
    case 'GALLERY':
      return <Gallery key={id} config={config} ctx={ctx} />;
    case 'LINHAS':
      return <Linhas key={id} config={config} ctx={ctx} />;
    case 'ROTINA':
      return <Rotina key={id} config={config} ctx={ctx} />;
    case 'FAQ':
      return <Faq key={id} config={config} ctx={ctx} />;
    case 'SOCIAL':
      return <Social key={id} config={config} ctx={ctx} />;
    case 'AJUDAR':
      return <Ajudar key={id} config={config} ctx={ctx} />;
    default:
      return null;
  }
}
