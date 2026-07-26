import { t } from '../i18n.js';

export function mount(root) {
  root.innerHTML = `
    <div class="dmt-app">
      <header class="dmt-header">
        <h1>${t('homeTitle')}</h1>
        <p>${t('homeBody')}</p>
      </header>
      <section class="dmt-panel">
        <p class="dmt-hint" style="margin:0">${t('homeHint')}</p>
      </section>
    </div>
  `;
}

export function unmount() {}
