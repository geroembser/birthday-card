import type { ThemeId } from '../../shared/types.ts';
import { LIMITS } from '../../shared/types.ts';
import { createCard } from '../lib/api.ts';
import { $, escapeHtml } from '../lib/dom.ts';
import { listMyCards, rememberCard } from '../lib/storage.ts';
import { THEMES, themeById } from '../lib/themes.ts';
import { navigate } from '../router.ts';
import { renderCover } from '../components/cover.ts';
import { logoHtml } from '../components/logo.ts';
import { formatDate, text } from '../lib/i18n.ts';

export function renderHome(root: HTMLElement): void {
  document.title = 'birthday.card';
  const mine = listMyCards();

  root.innerHTML = `
    <main class="home">
      <section class="hero">
        <p class="hero-brand">${logoHtml('brand-lg')}</p>
        <h1 class="display">${text.home.heroLine1}<br /><em>${text.home.heroLine2}</em></h1>
        <p class="lead">
          ${text.home.intro}
        </p>
      </section>

      <form class="create" id="create">
        <label class="field">
          <span class="field-label">${text.home.recipientLabel}</span>
          <input name="recipient" type="text" autocomplete="off" maxlength="${LIMITS.recipientLength}"
                 placeholder="${text.home.recipientPlaceholder}" enterkeyhint="done" />
        </label>

        <fieldset class="themes">
          <legend class="field-label">${text.home.chooseCover}</legend>
          <div class="theme-grid" id="themes"></div>
        </fieldset>

        <p class="form-error" id="error" hidden></p>
        <button class="btn primary big" type="submit" id="submit">${text.home.createCard}</button>
        <p class="fineprint">${text.home.noAccount}</p>
      </form>

      ${
        mine.length
          ? `<section class="mine">
              <h2 class="section-title">${text.home.yourCards}</h2>
              <ul class="mine-list">
                ${mine
                  .map(
                    (c) => `
                  <li class="mine-item">
                    <div class="mine-cover" data-theme="${c.theme}"></div>
                    <div class="mine-meta">
                      <strong>${c.recipient ? text.home.cardFor(escapeHtml(c.recipient)) : text.home.untitledCard}</strong>
                      <span>${text.themes[themeById(c.theme).id].name} · ${formatDate(c.createdAt)}</span>
                    </div>
                    <div class="mine-actions">
                      <a class="btn ghost small" data-link href="/edit/${c.id}">${text.common.edit}</a>
                      <a class="btn small" data-link href="/c/${c.id}">${text.home.open}</a>
                    </div>
                  </li>`,
                  )
                  .join('')}
              </ul>
            </section>`
          : ''
      }

      <footer class="home-footer">
        ${logoHtml('brand-sm')}
        <span>${text.home.madeFor}</span>
        <a class="home-source" href="https://github.com/geroembser/birthday-card" target="_blank" rel="noreferrer">
          ${text.home.viewCode} <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>`;

  // Theme picker
  const grid = $(root, '#themes');
  const recipientInput = $<HTMLInputElement>(root, 'input[name=recipient]');
  THEMES.forEach((t, i) => {
    const themeText = text.themes[t.id];
    const label = document.createElement('label');
    label.className = 'theme-option';
    label.innerHTML = `
      <input type="radio" name="theme" value="${t.id}" ${i === 0 ? 'checked' : ''} />
      <span class="cover-frame"></span>
      <span class="theme-name">${themeText.name}</span>
      <span class="theme-blurb">${themeText.blurb}</span>`;
    $(label, '.cover-frame').append(renderCover(t.id, ''));
    grid.append(label);
  });

  // Live-preview the recipient name on the covers.
  recipientInput.addEventListener('input', () => {
    const name = recipientInput.value.trim();
    grid.querySelectorAll<HTMLElement>('.theme-option').forEach((option) => {
      const id = $<HTMLInputElement>(option, 'input').value as ThemeId;
      $(option, '.cover-frame').replaceChildren(renderCover(id, name));
    });
  });

  // Small cover thumbnails in "Your cards"
  root.querySelectorAll<HTMLElement>('.mine-cover').forEach((node) => {
    node.append(renderCover(node.dataset.theme as ThemeId, ''));
  });

  // Submit
  const form = $<HTMLFormElement>(root, '#create');
  const submit = $<HTMLButtonElement>(root, '#submit');
  const error = $(root, '#error');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const theme = String(data.get('theme') ?? 'confetti') as ThemeId;
    const recipient = String(data.get('recipient') ?? '').trim();
    submit.disabled = true;
    submit.textContent = text.home.creating;
    error.hidden = true;
    try {
      const { card, editToken } = await createCard({ theme, recipient });
      rememberCard({ id: card.id, recipient: card.recipient, theme: card.theme, createdAt: card.createdAt }, editToken);
      navigate(`/edit/${card.id}`);
    } catch {
      error.textContent = text.home.createError;
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = text.home.createCard;
    }
  });
}
