# PC Dashboard Card

A beautiful, highly configurable [Home Assistant](https://www.home-assistant.io/) Lovelace card for monitoring and controlling your PC. Built for [HACS](https://hacs.xyz/).

![PC Dashboard Card](https://raw.githubusercontent.com/YOUR_USERNAME/pc-card/main/screenshot.png)

---

## Features

- **Arc gauges** for CPU, RAM, GPU, disk usage, and CPU temperature (color-coded: green / amber / red)
- **Network stats** chips for upload/download speed
- **Uptime** display in the header
- **Status badge** (Online / Offline / Unknown) with animated pulse
- **Context-aware buttons** -- boot only shows when the PC is offline; shutdown/restart/lock/sleep only show when online
- **3-second cooldown** on buttons to prevent accidental double-presses
- **Every gauge and section is individually toggleable**
- **Fully configurable** via the visual editor or YAML

---

## Installation

1. Open HACS -> **Frontend** -> top-right menu -> **Custom repositories**
2. Add `https://github.com/YOUR_USERNAME/pc-card` with category **Dashboard/Lovelace**
3. Install **PC Dashboard Card**

---

## Configuration

Add the card via the UI editor, or paste YAML directly.

### Minimal example

```yaml
type: custom:pc-card
title: Gaming PC
pc_state_sensor: binary_sensor.pc_online
cpu_sensor: sensor.pc_cpu_usage
ram_sensor: sensor.pc_memory_usage
shutdown_entity: button.pc_shutdown
wol_mac: "AA:BB:CC:DD:EE:FF"
```

### Full example

```yaml
type: custom:pc-card
title: Gaming PC
icon: mdi:desktop-tower-monitor

# ── State ──────────────────────────────────────────────────────────────────
# binary_sensor: on = online, off = offline
pc_state_sensor: binary_sensor.pc_online

# ── Sensors (all optional) ─────────────────────────────────────────────────
cpu_sensor: sensor.pc_cpu_usage          # 0-100 %
ram_sensor: sensor.pc_memory_usage       # 0-100 %
gpu_sensor: sensor.pc_gpu_usage          # 0-100 %
disk_sensor: sensor.pc_disk_usage        # 0-100 %
temperature_sensor: sensor.pc_cpu_temp   # degrees Celsius
network_up_sensor: sensor.pc_network_upload     # MB/s
network_down_sensor: sensor.pc_network_download # MB/s
uptime_sensor: sensor.pc_uptime          # seconds

# ── Wake on LAN (shown when offline) ──────────────────────────────────────
wol_mac: "AA:BB:CC:DD:EE:FF"

# ── Actions (shown when online) ───────────────────────────────────────────
# Just pick a button, switch, or script entity — the card calls the right
# service automatically.
shutdown_entity: button.pc_shutdown
restart_entity: button.pc_restart
lock_entity: button.pc_lock
sleep_entity: button.pc_sleep

# ── Colors ─────────────────────────────────────────────────────────────────
accent_color: "#4f8ef7"
ok_color: "#22c55e"
warn_color: "#f59e0b"
danger_color: "#ef4444"

# ── Layout ─────────────────────────────────────────────────────────────────
columns: 4          # gauge columns (2-6)
gauge_size: 90      # gauge size in px (60-140)
compact: false      # tighter padding

# ── Toggles ────────────────────────────────────────────────────────────────
show_cpu: true
show_ram: true
show_gpu: true
show_disk: true
show_temperature: true
show_network: true
show_uptime: true
show_actions: true
```

---

## Recommended integrations for PC sensors

| Sensor | Integration |
|--------|-------------|
| CPU / RAM / GPU / Disk | [System Bridge](https://github.com/timmo001/system-bridge) or [HASS Agent](https://github.com/LAB02-Research/HASS.Agent) |
| Network speed | System Bridge / HASS Agent |
| CPU temperature | System Bridge / HASS Agent |
| Online/offline | [HASS Agent](https://github.com/LAB02-Research/HASS.Agent) (provides a binary sensor) |
| WOL boot | Built-in `wake_on_lan` integration |
| Shutdown/Restart/Lock | HASS Agent commands |

---

## Options reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | string | `My PC` | Card title |
| `icon` | string | `mdi:desktop-tower-monitor` | Header icon |
| `pc_state_sensor` | entity | -- | Binary sensor controlling button visibility |
| `cpu_sensor` | entity | -- | CPU usage (0-100 %) |
| `ram_sensor` | entity | -- | RAM usage (0-100 %) |
| `gpu_sensor` | entity | -- | GPU usage (0-100 %) |
| `disk_sensor` | entity | -- | Disk usage (0-100 %) |
| `temperature_sensor` | entity | -- | CPU temperature (C) |
| `network_up_sensor` | entity | -- | Upload speed (MB/s) |
| `network_down_sensor` | entity | -- | Download speed (MB/s) |
| `uptime_sensor` | entity | -- | Uptime in seconds |
| `wol_mac` | string | -- | MAC address for Wake on LAN |
| `shutdown_entity` | entity | -- | Entity to press for shutdown |
| `restart_entity` | entity | -- | Entity to press for restart |
| `lock_entity` | entity | -- | Entity to press for lock |
| `sleep_entity` | entity | -- | Entity to press for sleep |
| `accent_color` | color | `#4f8ef7` | Primary accent color |
| `ok_color` | color | `#22c55e` | Online / low-usage color |
| `warn_color` | color | `#f59e0b` | Medium-usage warning color |
| `danger_color` | color | `#ef4444` | High-usage / offline color |
| `columns` | number | `4` | Number of gauge columns |
| `gauge_size` | number | `90` | Gauge diameter in px |
| `compact` | boolean | `false` | Reduce padding |
| `show_cpu` | boolean | `true` | Show CPU gauge |
| `show_ram` | boolean | `true` | Show RAM gauge |
| `show_gpu` | boolean | `true` | Show GPU gauge |
| `show_disk` | boolean | `true` | Show disk gauge |
| `show_temperature` | boolean | `true` | Show temperature gauge |
| `show_network` | boolean | `true` | Show network chips |
| `show_uptime` | boolean | `true` | Show uptime in header |
| `show_actions` | boolean | `true` | Show quick action buttons |

---

## License

MIT
