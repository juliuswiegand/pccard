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
              />
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
      pc_state_sensor: '',
      cpu_sensor: '',
      ram_sensor: '',
      disk_sensor: '',
      temperature_sensor: '',
      network_up_sensor: '',
      network_down_sensor: '',
      uptime_sensor: '',
      accent_color: '#4f8ef7',
      danger_color: '#ef4444',
      warn_color: '#f59e0b',
      ok_color: '#22c55e',
      background: 'default',
      gauge_size: 90,
      show_cpu: true,
      show_ram: true,
      show_disk: true,
      show_temperature: true,
      show_network: true,
      show_uptime: true,
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

    if (cfg.cpu_sensor && cfg.show_cpu !== false)
      gaugesItems.push(renderGauge(cpu, 100, 'CPU', '%', this._accentColor(cpu, 75, 90), gs));
    if (cfg.ram_sensor && cfg.show_ram !== false)
      gaugesItems.push(renderGauge(ram, 100, 'RAM', '%', this._accentColor(ram, 80, 90), gs));
    if (cfg.disk_sensor && cfg.show_disk !== false)
      gaugesItems.push(renderGauge(disk, 100, 'Disk', '%', this._accentColor(disk, 85, 95), gs));
    if (cfg.temperature_sensor && cfg.show_temperature !== false) {
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
    const cfg = this._config;
    if (cfg.show_cpu !== false || cfg.show_ram !== false || cfg.show_disk !== false || cfg.show_temperature !== false) size += 2;
    if (this._config.show_network !== false) size += 1;
    return size;
  }

  static getConfigElement() {
    return document.createElement('pc-card-editor');
  }
}

// ─── Config Editor ────────────────────────────────────────────────────────────
// Uses ha-form (HA's built-in form renderer) which properly handles
// lazy-loading of sub-components like ha-entity-picker, ha-icon-picker, etc.

const ACTION_KEYS = ['boot', 'shutdown', 'restart', 'lock', 'sleep'];
const ACTION_LABELS = {
  boot: 'Boot / Wake on LAN (shown when Offline)',
  shutdown: 'Shutdown (shown when Online)',
  restart: 'Restart (shown when Online)',
  lock: 'Lock (shown when Online)',
  sleep: 'Sleep (shown when Online)',
};

// ── Schemas for ha-form ─────────────────────────────────────────────────────

const GENERAL_SCHEMA = [
  { name: 'title', selector: { text: {} } },
  { name: 'icon', selector: { icon: {} } },
  {
    name: 'background',
    selector: {
      select: {
        mode: 'dropdown',
        options: [
          { value: 'default', label: 'Default' },
          { value: 'dark', label: 'Dark' },
          { value: 'glass', label: 'Glass' },
          { value: 'gradient', label: 'Gradient' },
          { value: 'none', label: 'None (transparent)' },
        ],
      },
    },
  },
];

const SENSOR_SCHEMA = [
  { name: 'pc_state_sensor',    selector: { entity: { domain: 'binary_sensor' } } },
  { name: 'cpu_sensor',         selector: { entity: { domain: 'sensor' } } },
  { name: 'ram_sensor',         selector: { entity: { domain: 'sensor' } } },
  { name: 'disk_sensor',        selector: { entity: { domain: 'sensor' } } },
  { name: 'temperature_sensor', selector: { entity: { domain: 'sensor' } } },
  { name: 'network_up_sensor',  selector: { entity: { domain: 'sensor' } } },
  { name: 'network_down_sensor',selector: { entity: { domain: 'sensor' } } },
  { name: 'uptime_sensor',      selector: { entity: { domain: 'sensor' } } },
];

const LAYOUT_SCHEMA = [
  { name: 'columns',    selector: { number: { min: 2, max: 6, mode: 'box' } } },
  { name: 'gauge_size', selector: { number: { min: 60, max: 140, mode: 'slider' } } },
  { name: 'show_cpu',          selector: { boolean: {} } },
  { name: 'show_ram',          selector: { boolean: {} } },
  { name: 'show_disk',         selector: { boolean: {} } },
  { name: 'show_temperature',  selector: { boolean: {} } },
  { name: 'show_network',      selector: { boolean: {} } },
  { name: 'show_uptime',       selector: { boolean: {} } },
  { name: 'compact',           selector: { boolean: {} } },
];

const LABELS = {
  title: 'Card Title',
  icon: 'Icon',
  background: 'Background Style',
  pc_state_sensor: 'PC State Sensor',
  cpu_sensor: 'CPU Usage Sensor',
  ram_sensor: 'RAM Usage Sensor',
  disk_sensor: 'Disk Usage Sensor',
  temperature_sensor: 'CPU Temperature Sensor',
  network_up_sensor: 'Upload Speed Sensor',
  network_down_sensor: 'Download Speed Sensor',
  uptime_sensor: 'Uptime Sensor (seconds)',
  columns: 'Gauge Columns',
  gauge_size: 'Gauge Size (px)',
  show_cpu: 'Show CPU Gauge',
  show_ram: 'Show RAM Gauge',
  show_disk: 'Show Disk Gauge',
  show_temperature: 'Show Temperature Gauge',
  show_network: 'Show Network Stats',
  show_uptime: 'Show Uptime',
  compact: 'Compact Mode',
  accent_color: 'Accent',
  ok_color: 'Online / OK',
  warn_color: 'Warning',
  danger_color: 'Danger',
};

// Per-action: service text + target entity + data JSON
function actionSchema(key) {
  return [
    { name: `${key}_service`,       selector: { text: {} } },
    { name: `${key}_target_entity`, selector: { entity: {} } },
    { name: `${key}_data_json`,     selector: { text: {} } },
  ];
}

const ACTION_FIELD_LABELS = {
  service: 'Service (e.g. button.press)',
  target_entity: 'Target entity',
  data_json: 'Extra data JSON',
};

class PCCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
  }

  set hass(hass) {
    this._hass = hass;
    // Push hass to all ha-form instances so their pickers stay current
    this.shadowRoot.querySelectorAll('ha-form').forEach(f => { f.hass = hass; });
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

  // Flatten nested action configs into flat keys for ha-form
  get _formData() {
    const d = { ...this._config };
    for (const key of ACTION_KEYS) {
      const a = this._config[`${key}_action`] || {};
      d[`${key}_service`] = a.service || '';
      d[`${key}_target_entity`] = a.target?.entity_id || '';
      d[`${key}_data_json`] = a.data ? JSON.stringify(a.data) : '';
    }
    return d;
  }

  // Merge ha-form output back, reconstructing nested action objects
  _mergeFormData(changed) {
    const merged = { ...this._config, ...changed };

    // Reconstruct *_action objects from flat fields
    for (const key of ACTION_KEYS) {
      const svc = merged[`${key}_service`];
      const ent = merged[`${key}_target_entity`];
      const dj  = merged[`${key}_data_json`];

      // Clean flat keys from config
      delete merged[`${key}_service`];
      delete merged[`${key}_target_entity`];
      delete merged[`${key}_data_json`];

      if (svc) {
        const action = { service: svc };
        if (ent) action.target = { entity_id: ent };
        if (dj) { try { action.data = JSON.parse(dj); } catch (e) { /* ignore bad JSON */ } }
        merged[`${key}_action`] = action;
      } else {
        delete merged[`${key}_action`];
      }
    }

    this._config = merged;
    this._dispatch();
  }

  // Create an ha-form element, attach it to a container, wire events
  _createForm(container, schema, computeLabel) {
    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.data = this._formData;
    form.schema = schema;
    form.computeLabel = computeLabel;
    form.addEventListener('value-changed', (e) => {
      e.stopPropagation();
      this._mergeFormData(e.detail.value);
      // Update all forms with fresh data so they stay in sync
      this.shadowRoot.querySelectorAll('ha-form').forEach(f => { f.data = this._formData; });
    });
    container.appendChild(form);
    return form;
  }

  _heading(text) {
    const h = document.createElement('div');
    h.className = 'section-title';
    h.textContent = text;
    return h;
  }

  _render() {
    // Build the editor entirely via DOM API (no innerHTML for ha-form hosts)
    this.shadowRoot.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        font-family: var(--primary-font-family, sans-serif);
      }
      .editor { padding: 4px 0; }
      .section-title {
        font-size: 11px; font-weight: 700; letter-spacing: 1px;
        text-transform: uppercase; color: var(--primary-color, #4f8ef7);
        margin: 18px 0 8px; padding-bottom: 4px;
        border-bottom: 1px solid var(--divider-color, rgba(0,0,0,0.1));
      }
      .section-title:first-child { margin-top: 4px; }
      ha-form { display: block; margin-bottom: 4px; }
      .color-row { display: flex; gap: 10px; flex-wrap: wrap; margin: 4px 0 8px; }
      .color-item {
        display: flex; flex-direction: column; align-items: center; gap: 4px;
        font-size: 11px; color: var(--secondary-text-color);
      }
      .color-item input[type="color"] {
        width: 44px; height: 34px; padding: 0; border: 1px solid var(--divider-color, #ddd);
        background: none; cursor: pointer; border-radius: 8px;
      }
      .action-group {
        margin-bottom: 14px; background: var(--secondary-background-color, #f5f5f5);
        border-radius: 12px; padding: 12px;
      }
      .action-group-label {
        font-size: 12px; font-weight: 700; margin-bottom: 8px;
        color: var(--primary-text-color);
      }
    `;
    this.shadowRoot.appendChild(style);

    const editor = document.createElement('div');
    editor.className = 'editor';

    const defaultLabel = (schema) => LABELS[schema.name] || schema.name;

    // ── General ──
    editor.appendChild(this._heading('General'));
    this._createForm(editor, GENERAL_SCHEMA, defaultLabel);

    // ── Colors (native inputs — ha-form color_rgb returns [r,g,b], we use hex) ──
    editor.appendChild(this._heading('Colors'));
    const colorRow = document.createElement('div');
    colorRow.className = 'color-row';
    for (const [key, label] of [['accent_color','Accent'],['ok_color','Online'],['warn_color','Warning'],['danger_color','Danger']]) {
      const item = document.createElement('div');
      item.className = 'color-item';
      const input = document.createElement('input');
      input.type = 'color';
      input.value = this._config[key] || '#ffffff';
      input.addEventListener('input', () => {
        this._config = { ...this._config, [key]: input.value };
        this._dispatch();
      });
      const lbl = document.createElement('span');
      lbl.textContent = label;
      item.appendChild(input);
      item.appendChild(lbl);
      colorRow.appendChild(item);
    }
    editor.appendChild(colorRow);

    // ── Sensors ──
    editor.appendChild(this._heading('Sensors'));
    this._createForm(editor, SENSOR_SCHEMA, defaultLabel);

    // ── Layout ──
    editor.appendChild(this._heading('Layout'));
    this._createForm(editor, LAYOUT_SCHEMA, defaultLabel);

    // ── Actions ──
    editor.appendChild(this._heading('Actions'));
    for (const key of ACTION_KEYS) {
      const group = document.createElement('div');
      group.className = 'action-group';
      const title = document.createElement('div');
      title.className = 'action-group-label';
      title.textContent = ACTION_LABELS[key];
      group.appendChild(title);
      this._createForm(group, actionSchema(key), (schema) => {
        const part = schema.name.replace(`${key}_`, '');
        return ACTION_FIELD_LABELS[part] || part;
      });
      editor.appendChild(group);
    }

    this.shadowRoot.appendChild(editor);
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
