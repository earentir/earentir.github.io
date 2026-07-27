import { t } from '../i18n.js';

const API_DOCS_URL = 'https://api.earentir.dev/doc/';

export function mount(root) {
  root.innerHTML = `
    <div class="api-docs-app">
      <iframe
        class="api-docs-frame"
        src="${API_DOCS_URL}"
        title="${t('apiDocsTitle')}"
        loading="lazy"
      ></iframe>
    </div>
  `;
}

export function unmount() {}
