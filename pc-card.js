/**
 * PC Dashboard Card for Home Assistant
 * A highly configurable card to monitor and control your PC
 * Version: 1.0.0
 */

const VERSION = '1.0.0';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number(v) || 0));
}

function arcPath(cx, cy, r, startAngle, endAngle) {
  const rad = (a) => ((a - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

function formatBytes(val, unit = 'MB/s') {
  const n = parseFloat(val);
  if (isNaN(n)) return '—';
  if (n >= 1024) return `${(n / 1024).toFixed(1)} GB/s`;
  if (n >= 1) return `${n.toFixed(1)} MB/s`;
  return `${(n * 1024).toFixed(0)} KB/s`;
}

function formatUptime(val) {
  if (!val || val === 'unavailable' || val === 'unknown') return '—';
  const s = parseFloat(val);
  if (isNaN(s)) return val;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getEntityState(hass, entityId) {
  if (!hass || !entityId) return null;
  return hass.states[entityId] || null;
}

function getStateValue(hass, entityId, fallback = null) {
  const s = getEntityState(hass, entityId);
  if (!s) return fallback;
  if (s.state === 'unavailable' || s.state === 'unknown') return fallback;
  return s.state;
}

function getNumericValue(hass, entityId, fallback = null) {
  const v = getStateValue(hass, entityId);
  if (v === null) return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

// ─── SVG Gauge ────────────────────────────────────────────────────────────────

function renderGauge(value, max, label, unit, color, size = 80) {
  const pct = clamp((value / max) * 100);
  const sweep = 240; // degrees total arc
  const start = -120;
  const end = start + (sweep * pct) / 100;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const trackColor = 'rgba(255,255,255,0.08)';
  const displayVal = value === null ? '—' : `${Math.round(value)}`;

  return `
    <div class="gauge-wrap">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <!-- Track -->
        <path d="${arcPath(cx, cy, r, start, start + sweep)}"
              fill="none" stroke="${trackColor}" stroke-width="${size * 0.09}"
              stroke-linecap="round"/>
        <!-- Value arc -->
        ${value !== null ? `
        <path d="${arcPath(cx, cy, r, start, end)}"
              fill="none" stroke="${color}" stroke-width="${size * 0.09}"
              stroke-linecap="round"
              style="filter: drop-shadow(0 0 4px ${color}88)"/>
        ` : ''}
        <!-- Center text -->
        <text x="${cx}" y="${cy - 2}" text-anchor="middle"
              fill="white" font-size="${size * 0.2}" font-weight="700"
              font-family="inherit">${displayVal}</text>
        <text x="${cx}" y="${cy + size * 0.14}" text-anchor="middle"
              fill="rgba(255,255,255,0.5)" font-size="${size * 0.13}"
              font-family="inherit">${unit}</text>
      </svg>
      <div class="gauge-label">${label}</div>
    </div>
  `;
}

// ─── Main Card ────────────────────────────────────────────────────────────────

class PCCard extends HTMLElement {
  static get version() { return VERSION; }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._busy = {};
  }

  static getStubConfig() {
    return {
      title: 'My PC',
      icon: 'mdi:desktop-tower-monitor',
      pc_state_sensor: 'binary_sensor.pc_online',
      cpu_sensor: 'sensor.pc_cpu_usage',
      ram_sensor: 'sensor.pc_memory_usage',
      disk_sensor: 'sensor.pc_disk_usage',
      temperature_sensor: 'sensor.pc_cpu_temp',
      network_up_sensor: 'sensor.pc_network_upload',
      network_down_sensor: 'sensor.pc_network_download',
      uptime_sensor: 'sensor.pc_uptime',
      boot_action: { service: 'wake_on_lan.send_magic_packet', data: { mac: 'AA:BB:CC:DD:EE:FF' } },
      shutdown_action: { service: 'button.press', target: { entity_id: 'button.pc_shutdown' } },
      restart_action: { service: 'button.press', target: { entity_id: 'button.pc_restart' } },
      lock_action: { service: 'button.press', target: { entity_id: 'button.pc_lock' } },
      sleep_action: { service: 'button.press', target: { entity_id: 'button.pc_sleep' } },
      accent_color: '#4f8ef7',
      danger_color: '#ef4444',
      warn_color: '#f59e0b',
      ok_color: '#22c55e',
      background: 'default',
      gauge_size: 90,
      show_gauges: true,
      show_network: true,
      show_uptime: true,
      show_temperature: true,
      columns: 4,
      compact: false,
    };
  }

  setConfig(config) {
    if (!config) throw new Error('Invalid configuration');
    this._config = { ...PCCard.getStubConfig(), ...config };
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  get _isOnline() {
    const stateId = this._config.pc_state_sensor;
    if (!stateId) return null; // unknown
    const s = getEntityState(this._hass, stateId);
    if (!s) return null;
    if (s.state === 'unavailable' || s.state === 'unknown') return null;
    return s.state === 'on' || s.state === 'true' || s.state === 'home' || s.state === 'connected';
  }

  _accentColor(pct, warnAt = 80, dangerAt = 90) {
    if (pct === null) return 'rgba(255,255,255,0.3)';
    if (pct >= dangerAt) return this._config.danger_color;
    if (pct >= warnAt) return this._config.warn_color;
    return this._config.accent_color;
  }

  async _callAction(key, actionConfig) {
    if (this._busy[key]) return;
    this._busy[key] = true;
    this._render();
    try {
      const [domain, service] = actionConfig.service.split('.');
      await this._hass.callService(domain, service, actionConfig.data || {}, actionConfig.target || {});
    } catch (e) {
      console.error(`[pc-card] Action ${key} failed:`, e);
    }
    // Brief cooldown before unblocking
    setTimeout(() => { this._busy[key] = false; this._render(); }, 3000);
  }

  _styles() {
    const cfg = this._config;
    const accent = cfg.accent_color;
    const ok = cfg.ok_color;
    const danger = cfg.danger_color;
    const warn = cfg.warn_color;

    const bg = cfg.background === 'glass'
      ? 'background: rgba(15, 20, 35, 0.85); backdrop-filter: blur(20px);'
      : cfg.background === 'dark'
      ? 'background: #0f1423;'
      : cfg.background === 'gradient'
      ? `background: linear-gradient(135deg, #0f1423 0%, #1a1f35 100%);`
      : cfg.background === 'none'
      ? 'background: transparent;'
      : ''; // default = HA card bg

    return `
      :host {
        --pc-accent: ${accent};
        --pc-ok: ${ok};
        --pc-danger: ${danger};
        --pc-warn: ${warn};
        --pc-text: rgba(255,255,255,0.92);
        --pc-text-dim: rgba(255,255,255,0.45);
        --pc-surface: rgba(255,255,255,0.06);
        --pc-surface-hover: rgba(255,255,255,0.1);
        --pc-border: rgba(255,255,255,0.08);
        display: block;
      }

      .pc-card {
        border-radius: 16px;
        padding: ${cfg.compact ? '14px' : '20px'};
        color: var(--pc-text);
        font-family: var(--primary-font-family, 'Roboto', sans-serif);
        user-select: none;
        ${bg}
        overflow: hidden;
        position: relative;
      }

      /* ── Header ── */
      .header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: ${cfg.compact ? '12px' : '18px'};
      }

      .header-icon-wrap {
        position: relative;
        width: 42px;
        height: 42px;
        flex-shrink: 0;
      }

      .header-icon {
        width: 42px;
        height: 42px;
        background: var(--pc-surface);
        border: 1px solid var(--pc-border);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.3s;
      }

      .header-icon ha-icon {
        --mdc-icon-size: 22px;
        color: var(--pc-accent);
      }

      .header-info {
        flex: 1;
        min-width: 0;
      }

      .header-title {
        font-size: ${cfg.compact ? '15px' : '17px'};
        font-weight: 700;
        letter-spacing: 0.3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .header-uptime {
        font-size: 12px;
        color: var(--pc-text-dim);
        margin-top: 1px;
      }

      .status-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 11px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        flex-shrink: 0;
        border: 1px solid transparent;
        transition: all 0.3s;
      }

      .status-badge.online {
        background: rgba(34, 197, 94, 0.12);
        border-color: rgba(34, 197, 94, 0.3);
        color: var(--pc-ok);
      }

      .status-badge.offline {
        background: rgba(239, 68, 68, 0.12);
        border-color: rgba(239, 68, 68, 0.3);
        color: var(--pc-danger);
      }

      .status-badge.unknown {
        background: var(--pc-surface);
        border-color: var(--pc-border);
        color: var(--pc-text-dim);
      }

      .status-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
      }

      .status-badge.online .status-dot {
        animation: pulse-ok 2s ease-in-out infinite;
      }

      @keyframes pulse-ok {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.8); }
      }

      /* ── Divider ── */
      .divider {
        height: 1px;
        background: var(--pc-border);
        margin: ${cfg.compact ? '10px 0' : '14px 0'};
      }

      /* ── Gauges ── */
      .gauges-grid {
        display: grid;
        grid-template-columns: repeat(${clamp(cfg.columns, 2, 6)}, 1fr);
        gap: ${cfg.compact ? '8px 4px' : '12px 8px'};
        margin-bottom: ${cfg.compact ? '10px' : '14px'};
      }

      .gauge-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .gauge-wrap svg {
        overflow: visible;
      }

      .gauge-label {
        font-size: 11px;
        color: var(--pc-text-dim);
        text-align: center;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        font-weight: 500;
      }

      /* ── Network & Stats ── */
      .stats-row {
        display: flex;
        gap: 8px;
        margin-bottom: ${cfg.compact ? '10px' : '14px'};
        flex-wrap: wrap;
      }

      .stat-chip {
        display: flex;
        align-items: center;
        gap: 7px;
        background: var(--pc-surface);
        border: 1px solid var(--pc-border);
        border-radius: 10px;
        padding: 7px 12px;
        flex: 1;
        min-width: 100px;
        transition: background 0.2s;
      }

      .stat-chip:hover {
        background: var(--pc-surface-hover);
      }

      .stat-chip ha-icon {
        --mdc-icon-size: 16px;
        color: var(--pc-accent);
        flex-shrink: 0;
      }

      .stat-chip-content {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .stat-chip-value {
        font-size: 13px;
        font-weight: 700;
        color: var(--pc-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .stat-chip-label {
        font-size: 10px;
        color: var(--pc-text-dim);
        letter-spacing: 0.3px;
        text-transform: uppercase;
      }

      /* ── Actions ── */
      .actions-title {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.8px;
        text-transform: uppercase;
        color: var(--pc-text-dim);
        margin-bottom: 8px;
      }

      .actions-grid {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .action-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 5px;
        padding: ${cfg.compact ? '10px 14px' : '12px 18px'};
        background: var(--pc-surface);
        border: 1px solid var(--pc-border);
        border-radius: 12px;
        cursor: pointer;
        flex: 1;
        min-width: 60px;
        transition: all 0.2s ease;
        position: relative;
        overflow: hidden;
        color: var(--pc-text);
        -webkit-tap-highlight-color: transparent;
      }

      .action-btn::before {
        content: '';
        position: absolute;
        inset: 0;
        background: currentColor;
        opacity: 0;
        transition: opacity 0.2s;
      }

      .action-btn:hover::before { opacity: 0.06; }
      .action-btn:active::before { opacity: 0.12; }

      .action-btn:hover {
        border-color: rgba(255,255,255,0.16);
        transform: translateY(-1px);
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
      }

      .action-btn:active {
        transform: translateY(0);
      }

      .action-btn.danger {
        background: rgba(239, 68, 68, 0.08);
        border-color: rgba(239, 68, 68, 0.25);
        color: var(--pc-danger);
      }

      .action-btn.warn {
        background: rgba(245, 158, 11, 0.08);
        border-color: rgba(245, 158, 11, 0.25);
        color: var(--pc-warn);
      }

      .action-btn.ok {
        background: rgba(34, 197, 94, 0.08);
        border-color: rgba(34, 197, 94, 0.25);
        color: var(--pc-ok);
      }

      .action-btn.accent {
        background: rgba(79, 142, 247, 0.1);
        border-color: rgba(79, 142, 247, 0.3);
        color: var(--pc-accent);
      }

      .action-btn.busy {
        opacity: 0.6;
        cursor: not-allowed;
        pointer-events: none;
      }

      .action-btn.busy::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        height: 2px;
        background: currentColor;
        animation: btn-progress 3s linear forwards;
      }

      @keyframes btn-progress {
        from { width: 0%; }
        to { width: 100%; }
      }

      .action-btn ha-icon {
        --mdc-icon-size: 20px;
        position: relative;
        z-index: 1;
      }

      .action-btn-label {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.3px;
        position: relative;
        z-index: 1;
        white-space: nowrap;
      }

      /* ── Offline overlay ── */
      .offline-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 14px;
        background: rgba(239, 68, 68, 0.08);
        border: 1px dashed rgba(239, 68, 68, 0.3);
        border-radius: 12px;
        color: rgba(239, 68, 68, 0.8);
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 12px;
      }

      .offline-banner ha-icon {
        --mdc-icon-size: 18px;
      }

      /* ── Spinner ── */
      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .spin {
        animation: spin 1s linear infinite;
        display: inline-block;
      }

      /* ── No config ── */
      .no-config {
        padding: 20px;
        text-align: center;
        color: var(--pc-text-dim);
        font-size: 14px;
      }
    `;
  }

  _render() {
    if (!this._config || !this._hass) return;
    const cfg = this._config;
    const online = this._isOnline;

    // Sensor values
    const cpu = getNumericValue(this._hass, cfg.cpu_sensor);
    const ram = getNumericValue(this._hass, cfg.ram_sensor);
    const disk = getNumericValue(this._hass, cfg.disk_sensor);
    const temp = getNumericValue(this._hass, cfg.temperature_sensor);
    const netUp = getStateValue(this._hass, cfg.network_up_sensor);
    const netDown = getStateValue(this._hass, cfg.network_down_sensor);
    const uptime = getStateValue(this._hass, cfg.uptime_sensor);

    // Status
    const statusClass = online === true ? 'online' : online === false ? 'offline' : 'unknown';
    const statusLabel = online === true ? 'Online' : online === false ? 'Offline' : 'Unknown';

    // Gauges
    const gaugesItems = [];
    const gs = clamp(cfg.gauge_size || 90, 60, 140);

    if (cfg.cpu_sensor && cfg.show_gauges !== false)
      gaugesItems.push(renderGauge(cpu, 100, 'CPU', '%', this._accentColor(cpu, 75, 90), gs));
    if (cfg.ram_sensor && cfg.show_gauges !== false)
      gaugesItems.push(renderGauge(ram, 100, 'RAM', '%', this._accentColor(ram, 80, 90), gs));
    if (cfg.disk_sensor && cfg.show_gauges !== false)
      gaugesItems.push(renderGauge(disk, 100, 'Disk', '%', this._accentColor(disk, 85, 95), gs));
    if (cfg.temperature_sensor && cfg.show_temperature !== false && cfg.show_gauges !== false) {
      const tempColor = this._accentColor(temp, 70, 85);
      gaugesItems.push(renderGauge(temp, 100, 'Temp', '°C', tempColor, gs));
    }

    // Stats chips
    const statsChips = [];
    if (cfg.network_up_sensor && cfg.show_network !== false) {
      statsChips.push({ icon: 'mdi:upload-network', value: formatBytes(netUp), label: 'Upload' });
    }
    if (cfg.network_down_sensor && cfg.show_network !== false) {
      statsChips.push({ icon: 'mdi:download-network', value: formatBytes(netDown), label: 'Download' });
    }

    // Action buttons definition
    const allActions = [
      {
        key: 'boot',
        label: 'Boot',
        icon: 'mdi:power',
        variant: 'ok',
        action: cfg.boot_action,
        showWhen: (o) => o === false, // Only when offline
      },
      {
        key: 'shutdown',
        label: 'Shutdown',
        icon: 'mdi:power-standby',
        variant: 'danger',
        action: cfg.shutdown_action,
        showWhen: (o) => o === true,
      },
      {
        key: 'restart',
        label: 'Restart',
        icon: 'mdi:restart',
        variant: 'warn',
        action: cfg.restart_action,
        showWhen: (o) => o === true,
      },
      {
        key: 'lock',
        label: 'Lock',
        icon: 'mdi:lock',
        variant: 'accent',
        action: cfg.lock_action,
        showWhen: (o) => o === true,
      },
      {
        key: 'sleep',
        label: 'Sleep',
        icon: 'mdi:sleep',
        variant: 'accent',
        action: cfg.sleep_action,
        showWhen: (o) => o === true,
      },
    ];

    // Filter: only show buttons with an action configured AND where showWhen matches
    const visibleActions = allActions.filter(a => a.action && a.showWhen(online));

    // Build HTML
    const html = `
      <style>${this._styles()}</style>
      <ha-card>
        <div class="pc-card">

          <!-- Header -->
          <div class="header">
            <div class="header-icon-wrap">
              <div class="header-icon">
                <ha-icon icon="${cfg.icon || 'mdi:desktop-tower-monitor'}"></ha-icon>
              </div>
            </div>
            <div class="header-info">
              <div class="header-title">${cfg.title || 'PC'}</div>
              ${cfg.show_uptime !== false && uptime ? `<div class="header-uptime">Uptime: ${formatUptime(uptime)}</div>` : ''}
            </div>
            <div class="status-badge ${statusClass}">
              <div class="status-dot"></div>
              ${statusLabel}
            </div>
          </div>

          ${online === false ? `
          <div class="offline-banner">
            <ha-icon icon="mdi:desktop-tower-monitor"></ha-icon>
            PC is currently offline
          </div>
          ` : ''}

          <!-- Gauges -->
          ${gaugesItems.length > 0 ? `
          <div class="gauges-grid" style="grid-template-columns: repeat(${Math.min(gaugesItems.length, clamp(cfg.columns, 2, 6))}, 1fr)">
            ${gaugesItems.join('')}
          </div>
          ` : ''}

          <!-- Stats chips -->
          ${statsChips.length > 0 ? `
          <div class="stats-row">
            ${statsChips.map(c => `
              <div class="stat-chip">
                <ha-icon icon="${c.icon}"></ha-icon>
                <div class="stat-chip-content">
                  <span class="stat-chip-value">${c.value}</span>
                  <span class="stat-chip-label">${c.label}</span>
                </div>
              </div>
            `).join('')}
          </div>
          ` : ''}

          <!-- Actions -->
          ${visibleActions.length > 0 ? `
          <div class="divider"></div>
          <div class="actions-title">Quick Actions</div>
          <div class="actions-grid">
            ${visibleActions.map(a => `
              <button class="action-btn ${a.variant} ${this._busy[a.key] ? 'busy' : ''}"
                      data-action="${a.key}">
                <ha-icon icon="${a.icon}"></ha-icon>
                <span class="action-btn-label">${a.label}</span>
              </button>
            `).join('')}
          </div>
          ` : ''}

        </div>
      </ha-card>
    `;

    this.shadowRoot.innerHTML = html;

    // Attach event listeners after render
    this.shadowRoot.querySelectorAll('.action-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const key = btn.dataset.action;
        const actionDef = allActions.find(a => a.key === key);
        if (actionDef && actionDef.action) {
          this._callAction(key, actionDef.action);
        }
      });
    });
  }

  getCardSize() {
    let size = 3;
    if (this._config.show_gauges !== false) size += 2;
    if (this._config.show_network !== false) size += 1;
    return size;
  }

  static getConfigElement() {
    return document.createElement('pc-card-editor');
  }
}

// ─── Config Editor ────────────────────────────────────────────────────────────

class PCCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
  }

  set hass(hass) {
    this._hass = hass;
    // Keep existing pickers in sync without a full re-render
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach(p => {
      p.hass = hass;
    });
  }

  setConfig(config) {
    this._config = { ...PCCard.getStubConfig(), ...config };
    this._render();
  }

  _dispatch() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    }));
  }

  // Plain text / number input
  _field(key, label, type = 'text', hint = '') {
    const val = this._config[key] ?? '';
    return `
      <div class="field">
        <label>${label}</label>
        ${hint ? `<div class="hint">${hint}</div>` : ''}
        <input type="${type}" name="${key}" value="${val}" placeholder="${hint || label}"/>
      </div>
    `;
  }

  // Placeholder slot — filled imperatively with ha-entity-picker after innerHTML is set
  _entityPicker(key, label, domain = '') {
    return `
      <div class="field">
        <div class="entity-picker-slot"
             data-key="${key}"
             data-label="${label}"
             data-domain="${domain}">
        </div>
      </div>
    `;
  }

  // Hydrate every .entity-picker-slot with a real ha-entity-picker element
  _hydrateEntityPickers() {
    this.shadowRoot.querySelectorAll('.entity-picker-slot').forEach(slot => {
      const key = slot.dataset.key;
      const label = slot.dataset.label;
      const domain = slot.dataset.domain;

      const picker = document.createElement('ha-entity-picker');
      picker.hass = this._hass;
      picker.value = this._config[key] || '';
      picker.label = label;
      picker.allowCustomEntity = true;
      if (domain) picker.includeDomains = domain.split(',');

      picker.addEventListener('value-changed', (e) => {
        this._config = { ...this._config, [key]: e.detail.value || undefined };
        this._dispatch();
      });

      slot.appendChild(picker);
    });
  }

  _toggle(key, label) {
    const checked = this._config[key] !== false;
    return `
      <div class="field toggle-field">
        <label>${label}</label>
        <label class="switch">
          <input type="checkbox" name="${key}" ${checked ? 'checked' : ''}/>
          <span class="slider"></span>
        </label>
      </div>
    `;
  }

  _section(title) {
    return `<div class="section-title">${title}</div>`;
  }

  _actionFields(key, label) {
    const a = this._config[`${key}_action`] || {};
    return `
      <div class="action-group">
        <div class="action-group-label">${label}</div>
        <div class="action-row-label">Service (domain.service)</div>
        <input type="text" name="${key}_service" value="${a.service || ''}" placeholder="e.g. button.press"/>
        <div class="action-row-label" style="margin-top:6px">Target entity (optional)</div>
        <div class="entity-picker-slot action-entity-slot"
             data-action-key="${key}"
             data-label="Target entity">
        </div>
        <div class="action-row-label" style="margin-top:6px">Extra data JSON (optional)</div>
        <input type="text" name="${key}_data" value="${a.data ? JSON.stringify(a.data) : ''}" placeholder='e.g. {"mac":"AA:BB:CC:DD:EE:FF"}'/>
      </div>
    `;
  }

  // Hydrate action entity pickers (separate from sensor pickers)
  _hydrateActionPickers() {
    this.shadowRoot.querySelectorAll('.action-entity-slot').forEach(slot => {
      const actionKey = slot.dataset.actionKey;
      const label = slot.dataset.label;
      const current = this._config[`${actionKey}_action`] || {};
      const currentEntityId = current.target?.entity_id || '';

      const picker = document.createElement('ha-entity-picker');
      picker.hass = this._hass;
      picker.value = currentEntityId;
      picker.label = label;
      picker.allowCustomEntity = true;

      picker.addEventListener('value-changed', (e) => {
        const actionKey2 = slot.dataset.actionKey;
        const actionCfgKey = `${actionKey2}_action`;
        const existing = { ...this._config[actionCfgKey] };
        const val = e.detail.value;
        if (val) {
          existing.target = { entity_id: val };
        } else {
          delete existing.target;
        }
        this._config = { ...this._config, [actionCfgKey]: existing };
        this._dispatch();
      });

      slot.appendChild(picker);
    });
  }

  _render() {
    const cfg = this._config;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: var(--primary-font-family, sans-serif); }
        .editor { padding: 4px 0; }
        .section-title {
          font-size: 11px; font-weight: 700; letter-spacing: 1px;
          text-transform: uppercase; color: var(--primary-color, #4f8ef7);
          margin: 16px 0 8px; padding-bottom: 4px;
          border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.1));
        }
        .field { margin-bottom: 10px; }
        .field label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: var(--primary-text-color); }
        .hint { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 4px; }
        /* ha-entity-picker fills its container naturally */
        .entity-picker-slot ha-entity-picker { display: block; }
        .field input[type="text"], .field input[type="number"] {
          width: 100%; box-sizing: border-box;
          padding: 7px 10px; border-radius: 8px;
          border: 1px solid var(--divider-color, #ddd);
          background: var(--card-background-color, white);
          color: var(--primary-text-color);
          font-size: 13px;
        }
        .toggle-field { display: flex; align-items: center; justify-content: space-between; }
        .switch { position: relative; display: inline-block; width: 40px; height: 22px; flex-shrink: 0; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider { position: absolute; inset: 0; background: #ccc; border-radius: 22px; cursor: pointer; transition: .3s; }
        .slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 3px; bottom: 3px; background: white; border-radius: 50%; transition: .3s; }
        input:checked + .slider { background: var(--primary-color, #4f8ef7); }
        input:checked + .slider:before { transform: translateX(18px); }
        .action-group { margin-bottom: 12px; background: var(--secondary-background-color, #f5f5f5); border-radius: 10px; padding: 10px; }
        .action-group-label { font-size: 12px; font-weight: 700; margin-bottom: 8px; color: var(--primary-text-color); }
        .action-row-label { font-size: 11px; color: var(--secondary-text-color); margin-bottom: 3px; }
        .action-group input[type="text"] { width: 100%; box-sizing: border-box; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--divider-color, #ddd); background: var(--card-background-color, white); color: var(--primary-text-color); font-size: 12px; font-family: monospace; }
        .action-entity-slot ha-entity-picker { display: block; }
        .color-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .color-item { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 11px; color: var(--secondary-text-color); }
        .color-item input[type="color"] { width: 40px; height: 32px; padding: 0; border: none; background: none; cursor: pointer; border-radius: 6px; }
        select { width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--divider-color, #ddd); background: var(--card-background-color, white); color: var(--primary-text-color); font-size: 13px; }
      </style>
      <div class="editor">

        ${this._section('General')}
        ${this._field('title', 'Card Title')}
        ${this._field('icon', 'Icon', 'text', 'e.g. mdi:desktop-tower-monitor')}

        <div class="field">
          <label>Background Style</label>
          <select name="background">
            ${['default','dark','glass','gradient','none'].map(v =>
              `<option value="${v}" ${cfg.background === v ? 'selected' : ''}>${v.charAt(0).toUpperCase() + v.slice(1)}</option>`
            ).join('')}
          </select>
        </div>

        ${this._section('Colors')}
        <div class="field">
          <label>Theme Colors</label>
          <div class="color-row">
            ${[['accent_color','Accent'],['ok_color','Online'],['warn_color','Warning'],['danger_color','Danger']].map(([k,l]) => `
              <div class="color-item">
                <input type="color" name="${k}" value="${cfg[k] || '#ffffff'}"/>
                ${l}
              </div>
            `).join('')}
          </div>
        </div>

        ${this._section('Sensors')}
        ${this._entityPicker('pc_state_sensor',    'PC State Sensor',          'binary_sensor')}
        ${this._entityPicker('cpu_sensor',          'CPU Usage Sensor',         'sensor')}
        ${this._entityPicker('ram_sensor',          'RAM Usage Sensor',         'sensor')}
        ${this._entityPicker('disk_sensor',         'Disk Usage Sensor',        'sensor')}
        ${this._entityPicker('temperature_sensor',  'CPU Temp Sensor',          'sensor')}
        ${this._entityPicker('network_up_sensor',   'Upload Speed Sensor',      'sensor')}
        ${this._entityPicker('network_down_sensor', 'Download Speed Sensor',    'sensor')}
        ${this._entityPicker('uptime_sensor',       'Uptime Sensor (seconds)',  'sensor')}

        ${this._section('Layout')}
        ${this._field('columns',    'Gauge Columns',  'number')}
        ${this._field('gauge_size', 'Gauge Size (px)','number')}
        ${this._toggle('show_gauges',      'Show Gauges')}
        ${this._toggle('show_network',     'Show Network Stats')}
        ${this._toggle('show_temperature', 'Show Temperature')}
        ${this._toggle('show_uptime',      'Show Uptime')}
        ${this._toggle('compact',          'Compact Mode')}

        ${this._section('Actions (only shown when state matches)')}
        ${this._actionFields('boot',     'Boot / Wake on LAN — shown when Offline')}
        ${this._actionFields('shutdown', 'Shutdown — shown when Online')}
        ${this._actionFields('restart',  'Restart — shown when Online')}
        ${this._actionFields('lock',     'Lock — shown when Online')}
        ${this._actionFields('sleep',    'Sleep — shown when Online')}

      </div>
    `;

    // Hydrate entity pickers (must happen after innerHTML is set)
    this._hydrateEntityPickers();
    this._hydrateActionPickers();

    // Attach listeners for plain inputs / selects / checkboxes
    this.shadowRoot.querySelectorAll('input:not([type="color"]), select').forEach(el => {
      el.addEventListener('change', () => this._handleChange(el));
    });
    this.shadowRoot.querySelectorAll('input[type="color"]').forEach(el => {
      el.addEventListener('input', () => this._handleChange(el));
    });
  }

  _handleChange(el) {
    const name = el.name;
    const value = el.type === 'checkbox' ? el.checked : el.value;

    // Action service / data fields
    const actionMatch = name.match(/^(boot|shutdown|restart|lock|sleep)_(service|data)$/);
    if (actionMatch) {
      const [, key, part] = actionMatch;
      const actionCfgKey = `${key}_action`;
      const current = { ...this._config[actionCfgKey] };
      if (part === 'service') {
        current.service = value;
      } else {
        try { current[part] = value ? JSON.parse(value) : undefined; } catch (e) {}
      }
      this._config = { ...this._config, [actionCfgKey]: current };
    } else if (name === 'columns' || name === 'gauge_size') {
      this._config = { ...this._config, [name]: parseInt(value) || undefined };
    } else if (el.type === 'checkbox') {
      this._config = { ...this._config, [name]: value };
    } else {
      this._config = { ...this._config, [name]: value };
    }

    this._dispatch();
  }
}

// ─── Registration ─────────────────────────────────────────────────────────────

customElements.define('pc-card', PCCard);
customElements.define('pc-card-editor', PCCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'pc-card',
  name: 'PC Dashboard Card',
  description: 'Monitor and control your PC — system stats, gauges, and smart action buttons.',
  preview: true,
  documentationURL: 'https://github.com/YOUR_USERNAME/pc-card',
});

console.info(
  `%c PC-CARD %c v${VERSION} `,
  'background:#4f8ef7;color:white;padding:2px 6px;border-radius:4px 0 0 4px;font-weight:700',
  'background:#1e293b;color:#4f8ef7;padding:2px 6px;border-radius:0 4px 4px 0',
);
