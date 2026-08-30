import type { ThemeId } from '../../shared/types.ts';
import { LIMITS } from '../../shared/types.ts';
import { createCard } from '../lib/api.ts';
import { $, escapeHtml } from '../lib/dom.ts';
import { listMyCards, rememberCard } from '../lib/storage.ts';
import { THEMES, themeById } from '../lib/themes.ts';
import { navigate } from '../router.ts';
import { renderCover } from '../components/cover.ts';
import { logoHtml } from '../components/logo.ts';

export function renderHome(root: HTMLElement): void {
  document.title = 'birthday.card';
  const mine = listMyCards();

  root.innerHTML = `
    <main class="home">
      <section class="hero">
        <p class="hero-brand">${logoHtml('brand-lg')}</p>
        <h1 class="display">Handwrite a card.<br /><em>Share a link.</em></h1>
        <p class="lead">
          Pick up your Apple Pencil and write a birthday message the way you would on paper.
          When they open the link, the card unfolds and your handwriting appears, stroke by stroke.
        </p>
      </section>

      <form class="create" id="create">
        <label class="field">
          <span class="field-label">Who is it for?</span>
          <input name="recipient" type="text" autocomplete="off" maxlength="${LIMITS.recipientLength}"
                 placeholder="Their name (optional)" enterkeyhint="done" />
        </label>

        <fieldset class="themes">
          <legend class="field-label">Choose a cover</legend>
          <div class="theme-grid" id="themes"></div>
        </fieldset>

        <p class="form-error" id="error" hidden></p>
        <button class="btn primary big" type="submit" id="submit">Create card</button>
        <p class="fineprint">No account needed. Only this device can edit the card; anyone with the link can open it.</p>
      </form>

      ${
        mine.length
          ? `<section class="mine">
              <h2 class="section-title">Your cards</h2>
              <ul class="mine-list">
                ${mine
                  .map(
                    (c) => `
                  <li class="mine-item">
                    <div class="mine-cover" data-theme="${c.theme}"></div>
                    <div class="mine-meta">
                      <strong>${c.recipient ? `For ${escapeHtml(c.recipient)}` : 'Untitled card'}</strong>
                      <span>${themeById(c.theme).name} · ${new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div class="mine-actions">
                      <a class="btn ghost small" data-link href="/edit/${c.id}">Edit</a>
                      <a class="btn small" data-link href="/c/${c.id}">Open</a>
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
        <span>Made for iPad and Apple Pencil, works anywhere with a browser.</span>
        <a class="home-source" href="https://github.com/geroembser/birthday-card" target="_blank" rel="noreferrer">
          View the code on GitHub <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </main>`;

  // Theme picker
  const grid = $(root, '#themes');
  const recipientInput = $<HTMLInputElement>(root, 'input[name=recipient]');
  THEMES.forEach((t, i) => {
    const label = document.createElement('label');
    label.className = 'theme-option';
    label.innerHTML = `
      <input type="radio" name="theme" value="${t.id}" ${i === 0 ? 'checked' : ''} />
      <span class="cover-frame"></span>
      <span class="theme-name">${t.name}</span>
      <span class="theme-blurb">${t.blurb}</span>`;
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
    submit.textContent = 'Creating…';
    error.hidden = true;
    try {
      const { card, editToken } = await createCard({ theme, recipient });
      rememberCard({ id: card.id, recipient: card.recipient, theme: card.theme, createdAt: card.createdAt }, editToken);
      navigate(`/edit/${card.id}`);
    } catch (err) {
      error.textContent = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      error.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Create card';
    }
  });
}
