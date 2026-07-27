import { t, onLangChange } from './i18n.js';
import { navigate } from './router.js';
import { getTheme, setTheme, onThemeChange } from './theme.js';
import { getFont, setFont, onFontChange } from './font.js';
import { isDesktopPatternEnabled, toggleDesktopPattern, onDesktopChange } from './desktop.js';

function underlineAccel(label, accel) {
  const letter = accel.toUpperCase();
  const idx = label.toLowerCase().indexOf(accel.toLowerCase());
  if (idx === -1) {
    return `${label} (<u>${letter}</u>)`;
  }
  return `${label.slice(0, idx)}<u>${label.charAt(idx)}</u>${label.slice(idx + 1)}`;
}

function isDropdown(menu) {
  return Array.isArray(menu.items) && menu.items.length > 0;
}

function buildMenuModel() {
  return [
    {
      id: 'file',
      accel: 'f',
      labelKey: 'menuFile',
      items: [
        { id: 'home', accel: 'h', labelKey: 'menuHome', action: () => navigate('home') },
        { separator: true },
        { id: 'exit', accel: 'x', labelKey: 'menuExit', action: () => { window.location.href = '/'; } },
      ],
    },
    {
      id: 'dmt',
      accel: 'd',
      labelKey: 'menuDmtTop',
      action: () => navigate('dmt'),
    },
    {
      id: 'tiles',
      accel: 't',
      labelKey: 'menuTilesTop',
      action: () => navigate('tiles'),
    },
    {
      id: 'watchlist',
      accel: 'w',
      labelKey: 'menuWatchlist',
      items: [
        {
          id: 'wl-sync',
          accel: 's',
          labelKey: 'menuWatchlistSync',
          action: () => navigate('wl-sync'),
        },
        {
          id: 'wl-compare',
          accel: 'c',
          labelKey: 'menuWatchlistCompare',
          action: () => navigate('wl-compare'),
        },
      ],
    },
    {
      id: 'options',
      accel: 'o',
      labelKey: 'menuOptions',
      items: [
        {
          id: 'desktop',
          accel: 'p',
          labelKey: 'menuDesktopPattern',
          checked: isDesktopPatternEnabled(),
          action: () => toggleDesktopPattern(),
        },
        { separator: true },
        {
          id: 'theme-dark',
          accel: 'd',
          labelKey: 'menuThemeDark',
          checked: getTheme() === 'dark',
          action: () => setTheme('dark'),
        },
        {
          id: 'theme-light',
          accel: 'l',
          labelKey: 'menuThemeLight',
          checked: getTheme() === 'light',
          action: () => setTheme('light'),
        },
        { separator: true },
        {
          id: 'font-vga',
          accel: 'v',
          labelKey: 'fontVga',
          checked: getFont() === 'vga',
          action: () => setFont('vga'),
        },
        {
          id: 'font-tiny5',
          accel: 'y',
          labelKey: 'fontTiny5',
          checked: getFont() === 'tiny5',
          action: () => setFont('tiny5'),
        },
      ],
    },
    {
      id: 'api',
      accel: 'a',
      labelKey: 'menuApi',
      action: () => navigate('api'),
    },
    {
      id: 'help',
      accel: 'h',
      labelKey: 'menuHelp',
      items: [
        { id: 'about', accel: 'a', labelKey: 'menuAbout', action: () => showAbout() },
      ],
    },
  ];
}

function showAbout() {
  if (document.getElementById('tp-about')) {
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'tp-about';
  overlay.className = 'tp-modal-overlay';
  overlay.setAttribute('role', 'presentation');
  overlay.innerHTML = `
    <div class="tp-modal" role="dialog" aria-modal="true" aria-labelledby="tp-about-title">
      <div class="tp-modal-titlebar">
        <span class="tp-modal-title" id="tp-about-title">${t('aboutTitle')}</span>
      </div>
      <div class="tp-modal-body">
        <p class="tp-modal-lead">${t('aboutBody')}</p>
        <p class="tp-modal-detail">${t('aboutDetail')}</p>
        <div class="tp-modal-actions">
          <button type="button" class="tp-modal-btn" id="tp-about-ok">${t('aboutOk')}</button>
        </div>
      </div>
    </div>
  `;

  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  };

  const onKey = (event) => {
    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });
  overlay.querySelector('#tp-about-ok')?.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  overlay.querySelector('#tp-about-ok')?.focus();
}

export function initMenu() {
  const host = document.getElementById('tp-menus');
  if (!host) {
    return;
  }

  let openMenuId = null;
  let activeItemIndex = -1;
  let model = buildMenuModel();

  function closeMenus() {
    openMenuId = null;
    activeItemIndex = -1;
    host.querySelectorAll('.tp-menu.open').forEach((el) => el.classList.remove('open'));
    host.querySelectorAll('.tp-menu-item.active').forEach((el) => el.classList.remove('active'));
  }

  function openMenu(menuId) {
    const menu = model.find((entry) => entry.id === menuId);
    if (!menu || !isDropdown(menu)) {
      return;
    }

    closeMenus();
    openMenuId = menuId;
    const menuEl = host.querySelector(`[data-menu="${menuId}"]`);
    if (menuEl) {
      menuEl.classList.add('open');
      activeItemIndex = 0;
      highlightItem();
    }
  }

  function getOpenItems() {
    if (!openMenuId) {
      return [];
    }
    const menu = model.find((entry) => entry.id === openMenuId);
    return menu?.items?.filter((item) => !item.separator) || [];
  }

  function highlightItem() {
    const menuEl = host.querySelector(`[data-menu="${openMenuId}"]`);
    if (!menuEl) {
      return;
    }
    const items = [...menuEl.querySelectorAll('.tp-menu-item')];
    items.forEach((el, i) => el.classList.toggle('active', i === activeItemIndex));
  }

  function activateCurrentItem() {
    const items = getOpenItems();
    const item = items[activeItemIndex];
    if (item?.action) {
      const keepOpen = item.checked !== undefined ? openMenuId : null;
      item.action();
      if (keepOpen) {
        openMenuId = keepOpen;
        render();
      } else {
        closeMenus();
      }
    }
  }

  function nextDropdownId(fromId, direction) {
    const dropdowns = model.filter(isDropdown);
    if (!dropdowns.length) {
      return null;
    }
    const currentIndex = dropdowns.findIndex((menu) => menu.id === fromId);
    const start = currentIndex === -1 ? 0 : currentIndex;
    const next = (start + direction + dropdowns.length) % dropdowns.length;
    return dropdowns[next].id;
  }

  function render() {
    const previousOpen = openMenuId;
    const previousIndex = activeItemIndex;
    model = buildMenuModel();
    host.replaceChildren();

    model.forEach((menu) => {
      const wrap = document.createElement('div');
      wrap.className = 'tp-menu';
      wrap.dataset.menu = menu.id;
      if (!isDropdown(menu)) {
        wrap.classList.add('tp-menu-direct');
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tp-menu-btn';
      btn.innerHTML = underlineAccel(t(menu.labelKey), menu.accel);

      if (isDropdown(menu)) {
        btn.setAttribute('aria-haspopup', 'true');
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          if (openMenuId === menu.id) {
            closeMenus();
          } else {
            openMenu(menu.id);
          }
        });

        const dropdown = document.createElement('div');
        dropdown.className = 'tp-dropdown';
        dropdown.setAttribute('role', 'menu');

        menu.items.forEach((item) => {
          if (item.separator) {
            const sep = document.createElement('div');
            sep.className = 'tp-menu-sep';
            dropdown.append(sep);
            return;
          }

          const row = document.createElement('button');
          row.type = 'button';
          row.className = 'tp-menu-item';
          row.dataset.accel = item.accel;
          if (item.checked) {
            row.classList.add('checked');
          }
          const check = item.checked !== undefined
            ? `<span class="tp-menu-check">${item.checked ? '√' : ''}</span>`
            : '';
          row.innerHTML = `${check}<span>${underlineAccel(t(item.labelKey), item.accel)}</span>`;
          row.addEventListener('click', (event) => {
            event.stopPropagation();
            const keepOpen = item.checked !== undefined ? menu.id : null;
            item.action();
            if (keepOpen) {
              openMenuId = keepOpen;
              render();
            } else {
              closeMenus();
            }
          });
          row.addEventListener('mouseenter', () => {
            const actionable = menu.items.filter((entry) => !entry.separator);
            activeItemIndex = actionable.indexOf(item);
            highlightItem();
          });
          dropdown.append(row);
        });

        wrap.append(btn, dropdown);
      } else {
        btn.addEventListener('click', (event) => {
          event.stopPropagation();
          closeMenus();
          menu.action?.();
        });
        wrap.append(btn);
      }

      host.append(wrap);
    });

    if (previousOpen) {
      const stillOpenable = model.some((menu) => menu.id === previousOpen && isDropdown(menu));
      if (stillOpenable) {
        openMenu(previousOpen);
        const items = getOpenItems();
        if (items.length) {
          activeItemIndex = Math.min(previousIndex, items.length - 1);
          highlightItem();
        }
      } else {
        closeMenus();
      }
    }
  }

  document.addEventListener('click', () => closeMenus());

  document.addEventListener('keydown', (event) => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && event.key.length === 1) {
      const letter = event.key.toLowerCase();
      if (!openMenuId) {
        const menu = model.find((entry) => entry.accel === letter);
        if (menu) {
          event.preventDefault();
          if (isDropdown(menu)) {
            openMenu(menu.id);
          } else {
            menu.action?.();
          }
        }
        return;
      }

      const items = getOpenItems();
      const match = items.find((item) => item.accel === letter);
      if (match) {
        event.preventDefault();
        const keepOpen = match.checked !== undefined ? openMenuId : null;
        match.action();
        if (keepOpen) {
          openMenuId = keepOpen;
          render();
        } else {
          closeMenus();
        }
      }
      return;
    }

    if (!openMenuId) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenus();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const items = getOpenItems();
      if (!items.length) {
        return;
      }
      activeItemIndex = (activeItemIndex + 1) % items.length;
      highlightItem();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const items = getOpenItems();
      if (!items.length) {
        return;
      }
      activeItemIndex = (activeItemIndex - 1 + items.length) % items.length;
      highlightItem();
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const nextId = nextDropdownId(openMenuId, direction);
      if (nextId) {
        openMenu(nextId);
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      activateCurrentItem();
    }
  });

  render();
  onLangChange(render);
  onDesktopChange(() => {
    if (openMenuId === 'options') {
      render();
    }
  });
  onThemeChange(() => {
    if (openMenuId === 'options') {
      render();
    }
  });
  onFontChange(() => {
    if (openMenuId === 'options') {
      render();
    }
  });
}
