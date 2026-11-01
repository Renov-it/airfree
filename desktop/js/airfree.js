/**
 * Application front-end Airfree Local API (Compatible Jeedom Desktop/Mobile & Standalone)
 * Reprend l'ergonomie d'Airfree Cloud (Installations, Groupes, Zones, Thermostat, Configuration IP)
 */

(function (window) {
  'use strict';

  const MODE_META = {
    1: { id: 1, label: 'Arrêt', short: 'STOP', icon: 'stop' },
    2: { id: 2, label: 'Refroidissement', short: 'Froid', icon: 'cool' },
    3: { id: 3, label: 'Chauffage', short: 'Chaud', icon: 'heat' },
    4: { id: 4, label: 'Ventilation', short: 'Ventil.', icon: 'fan' },
    5: { id: 5, label: 'Déshumidification', short: 'Sec', icon: 'dry' },
    7: { id: 7, label: 'Auto', short: 'Auto', icon: 'auto' }
  };

  const state = {
    activeTab: 'zones',        // 'installations' | 'zones' | 'schedules' | 'routines' | 'config'
    subFilter: 'hvac',         // 'hvac' | 'consumption'
    mobilePreview: false,
    showHiddenZones: false,
    installCollapsed: false,
    collapsedGroups: {},
    loading: false,
    online: false,
    error: null,
    ip: '192.168.0.61',
    port: 3000,
    systemsCsv: '1,3',
    activeInstallationId: 'bureaux',
    installations: [
      {
        id: 'maison_lm',
        name: 'Maison LM',
        location: 'Montpellier, Hérault',
        type: 'house',
        ip: '192.168.1.50',
        port: 3000,
        systems: '1'
      },
      {
        id: 'bureaux',
        name: 'Bureaux',
        location: 'Montpellier, Hérault',
        type: 'office',
        ip: '192.168.0.61',
        port: 3000,
        systems: '1,3'
      }
    ],
    systems: [],
    zones: [],
    deviceInfo: null,
    showRawDiag: false,
    systemLocks: {},
    selectedZone: null,
    selectedGroup: null,
    lastRawResponse: null,
    schedules: [
      { id: 1, name: 'Ouverture Bureaux (Lun-Ven)', time: '08:00', group: 'Groupe 1 & 2', action: 'ON • 22.0°C (Chauffage)', enabled: true },
      { id: 2, name: 'Fermeture Bureaux (Lun-Ven)', time: '19:00', group: 'Groupe 1 & 2', action: 'OFF (Arrêt toutes zones)', enabled: true },
      { id: 3, name: 'Réduit Week-end', time: 'Sam-Dim', group: 'Tous les groupes', action: 'OFF • Hors-gel 16°C', enabled: true }
    ]
  };

  function escapeHtml(str) {
    if (str === null || typeof str === 'undefined') return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getApiUrl() {
    if (window.AIRFREE_API_URL) {
      return window.AIRFREE_API_URL;
    }
    if (typeof jeedom !== 'undefined' || window.location.pathname.indexOf('index.php') !== -1) {
      return 'plugins/airfree/core/ajax/airfree.ajax.php';
    }
    return 'api.php';
  }

  function showToast(msg, isError) {
    let el = document.getElementById('az-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.background = isError ? '#b91c1c' : '#064838';
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(function () {
      el.style.display = 'none';
    }, 3200);
  }

  function svgModeIcon(mode, size) {
    const s = size || 18;
    if (mode === 3) {
      // Soleil (Chauffage)
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="4.5"></circle>
        <line x1="12" y1="2" x2="12" y2="4.5"></line>
        <line x1="12" y1="19.5" x2="12" y2="22"></line>
        <line x1="4.93" y1="4.93" x2="6.7" y2="6.7"></line>
        <line x1="17.3" y1="17.3" x2="19.07" y2="19.07"></line>
        <line x1="2" y1="12" x2="4.5" y2="12"></line>
        <line x1="19.5" y1="12" x2="22" y2="12"></line>
        <line x1="4.93" y1="19.07" x2="6.7" y2="17.3"></line>
        <line x1="17.3" y1="6.7" x2="19.07" y2="4.93"></line>
      </svg>`;
    }
    if (mode === 2) {
      // Flocon (Refroidissement)
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="12" y1="2" x2="12" y2="22"></line>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <line x1="4.9" y1="4.9" x2="19.1" y2="19.1"></line>
        <line x1="19.1" y1="4.9" x2="4.9" y2="19.1"></line>
      </svg>`;
    }
    if (mode === 4) {
      // Ventilation
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"></path>
      </svg>`;
    }
    if (mode === 5) {
      // Goutte (Déshumidification)
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
      </svg>`;
    }
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M12 8v4l3 3"></path>
    </svg>`;
  }

  function svgDroplet() {
    return `<svg width="11" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.9;">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
    </svg>`;
  }

  function svgCardWatermark(mode) {
    if (mode === 2) {
      // Climatisation / Refroidissement : Grand Flocon de neige en filigrane (comme Airfree Cloud)
      return `<svg class="az-card-watermark-rays" viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="65" y1="15" x2="65" y2="115"></line>
        <line x1="15" y1="65" x2="115" y2="65"></line>
        <line x1="30" y1="30" x2="100" y2="100"></line>
        <line x1="100" y1="30" x2="30" y2="100"></line>
        <polyline points="55 25 65 35 75 25"></polyline>
        <polyline points="25 55 35 65 25 75"></polyline>
        <polyline points="34 46 46 46 46 34"></polyline>
        <polyline points="84 34 84 46 96 46"></polyline>
        <polyline points="34 84 46 84 46 96"></polyline>
      </svg>`;
    }
    if (mode === 5) {
      // Déshumidification : Grande Goutte d'eau en filigrane
      return `<svg class="az-card-watermark-rays" viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M68 20 L92 52 A28 28 0 1 1 44 52 Z"></path>
        <path d="M56 66 A14 14 0 0 0 68 78"></path>
      </svg>`;
    }
    if (mode === 4) {
      // Ventilation : Flux d'air en filigrane
      return `<svg class="az-card-watermark-rays" viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 50 H76 A11 11 0 1 0 65 39"></path>
        <path d="M16 66 H84 A12 12 0 1 1 72 78"></path>
        <path d="M30 82 H62 A9 9 0 1 1 53 91"></path>
      </svg>`;
    }
    // Chauffage (mode === 3 ou par défaut) : Soleil en filigrane
    return `<svg class="az-card-watermark-rays" viewBox="0 0 100 100" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round">
      <circle cx="68" cy="68" r="22"></circle>
      <line x1="68" y1="22" x2="68" y2="34"></line>
      <line x1="22" y1="68" x2="34" y2="68"></line>
      <line x1="35" y1="35" x2="44" y2="44"></line>
      <line x1="35" y1="92" x2="44" y2="85"></line>
      <line x1="92" y1="35" x2="85" y2="44"></line>
    </svg>`;
  }

  function svgExpandBox() {
    return `<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
      <polyline points="15 3 21 3 21 9"></polyline>
      <line x1="10" y1="14" x2="21" y2="3"></line>
    </svg>`;
  }

  function svgPowerIcon() {
    return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
      <line x1="12" y1="2" x2="12" y2="12"></line>
    </svg>`;
  }

  function svgHouseWatermark() {
    return `<svg class="az-install-watermark" viewBox="0 0 120 120" fill="none" stroke="#ffffff" stroke-width="4" stroke-linejoin="round">
      <path d="M15 62 L60 20 L105 62"></path>
      <path d="M28 52 V104 H92 V52"></path>
      <circle cx="60" cy="48" r="7"></circle>
      <rect x="38" y="68" width="16" height="16" rx="2"></rect>
      <path d="M66 104 V70 H82 V104"></path>
    </svg>`;
  }

  function svgOfficeWatermark() {
    return `<svg class="az-install-watermark" viewBox="0 0 120 120" fill="none" stroke="#ffffff" stroke-width="4" stroke-linejoin="round">
      <path d="M20 105 V38 L66 26 V105"></path>
      <path d="M66 36 L102 22 V105"></path>
      <rect x="30" y="48" width="12" height="12" rx="1"></rect>
      <rect x="48" y="48" width="12" height="12" rx="1"></rect>
      <rect x="30" y="68" width="12" height="12" rx="1"></rect>
      <rect x="48" y="68" width="12" height="12" rx="1"></rect>
      <line x1="78" y1="42" x2="90" y2="42"></line>
      <line x1="78" y1="62" x2="90" y2="62"></line>
      <line x1="78" y1="82" x2="90" y2="82"></line>
    </svg>`;
  }

  function splitTemp(tempVal) {
    const val = Math.round(parseFloat(tempVal || 0) * 10) / 10;
    const intPart = Math.floor(val);
    const decPart = Math.round((val - intPart) * 10);
    return { intPart: intPart, decPart: decPart };
  }

  async function apiCall(action, payload) {
    const url = getApiUrl();
    const bodyObj = Object.assign({ action: action, ip: state.ip, port: state.port, systems: state.systemsCsv }, payload || {});

    const formData = new URLSearchParams();
    Object.keys(bodyObj).forEach(function (k) {
      const v = bodyObj[k];
      formData.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    });

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: formData.toString()
    });
    return await resp.json();
  }

  async function loadAirfreeState(silent) {
    if (!silent) {
      state.loading = true;
      renderApp();
    }
    try {
      const json = await apiCall('getFullState', {});
      state.lastRawResponse = json;
      if (json && json.state === 'ok' && json.result) {
        const r = json.result;
        state.online = r.online !== false;
        state.error = r.error || null;
        state.ip = r.ip || state.ip;
        state.port = r.port || state.port;
        state.deviceInfo = r.deviceInfo || state.deviceInfo;

        // Préserver les modifications récentes (< 6s) par systemID contre le délai RS-485 Innobus
        const now = Date.now();
        const incomingSystems = r.systems || [];
        incomingSystems.forEach(function (sys) {
          const lock = state.systemLocks[sys.systemID];
          if (lock && now < lock.until) {
            if (typeof lock.mode !== 'undefined') {
              sys.mode = lock.mode;
              sys.zones.forEach(function (z) { z.mode = lock.mode; });
            }
            if (typeof lock.groupOn !== 'undefined') {
              sys.anyOn = lock.groupOn === 1;
              sys.zones.forEach(function (z) {
                if (z.available) z.on = lock.groupOn;
              });
            }
            if (lock.zones) {
              sys.zones.forEach(function (z) {
                const zLock = lock.zones[z.zoneID];
                if (zLock && now < zLock.until) {
                  if (typeof zLock.on !== 'undefined') z.on = zLock.on;
                  if (typeof zLock.setpoint !== 'undefined') z.setpoint = zLock.setpoint;
                  if (typeof zLock.sleep !== 'undefined') z.sleep = zLock.sleep;
                }
              });
              sys.anyOn = sys.zones.some(function (z) { return z.available && parseInt(z.on, 10) === 1; });
            }
          }
        });

        state.systems = incomingSystems;
        state.zones = [];
        state.systems.forEach(function (s) {
          s.zones.forEach(function (z) { state.zones.push(z); });
        });
        if (r.config && r.config.installations) {
          state.installations = r.config.installations;
          state.activeInstallationId = r.config.activeInstallationId || state.activeInstallationId;
        }
        // Mettre à jour la zone sélectionnée dans la modale si ouverte
        if (state.selectedZone) {
          const updated = state.zones.find(function (z) { return z.logicalId === state.selectedZone.logicalId; });
          if (updated) state.selectedZone = updated;
        }
      } else {
        state.online = false;
        state.error = (json && json.result) ? String(json.result) : 'Erreur API';
      }
    } catch (err) {
      state.online = false;
      state.error = err.message || 'Erreur réseau';
    } finally {
      state.loading = false;
      renderApp();
    }
  }

  let postCmdTimer = null;
  function schedulePostCommandSync() {
    if (postCmdTimer) clearTimeout(postCmdTimer);
    postCmdTimer = setTimeout(function () {
      loadAirfreeState(true);
    }, 3500);
  }

  function lockSystemPatch(systemID, patch) {
    const sysId = parseInt(systemID, 10);
    const now = Date.now();
    if (!state.systemLocks[sysId]) {
      state.systemLocks[sysId] = { zones: {} };
    }
    state.systemLocks[sysId].until = now + 3200;
    if (typeof patch.mode !== 'undefined') {
      state.systemLocks[sysId].mode = patch.mode;
    }
    if (typeof patch.groupOn !== 'undefined') {
      state.systemLocks[sysId].groupOn = patch.groupOn;
    }
    if (patch.zoneID) {
      const zId = parseInt(patch.zoneID, 10);
      if (!state.systemLocks[sysId].zones[zId]) {
        state.systemLocks[sysId].zones[zId] = {};
      }
      state.systemLocks[sysId].zones[zId].until = now + 6500;
      if (typeof patch.on !== 'undefined') state.systemLocks[sysId].zones[zId].on = patch.on;
      if (typeof patch.setpoint !== 'undefined') state.systemLocks[sysId].zones[zId].setpoint = patch.setpoint;
      if (typeof patch.sleep !== 'undefined') state.systemLocks[sysId].zones[zId].sleep = patch.sleep;
    }
  }

  async function toggleZonePower(systemID, zoneID, currentOn, event) {
    if (event) event.stopPropagation();
    const sysId = parseInt(systemID, 10);
    const zId = parseInt(zoneID, 10);
    const targetOn = currentOn ? 0 : 1;

    lockSystemPatch(sysId, { zoneID: zId, on: targetOn });

    // Mise à jour locale uniquement sur la zone ciblée de ce systemID
    state.zones.forEach(function (z) {
      if (parseInt(z.systemID, 10) === sysId && parseInt(z.zoneID, 10) === zId) z.on = targetOn;
    });
    state.systems.forEach(function (s) {
      if (parseInt(s.systemID, 10) === sysId) {
        s.zones.forEach(function (z) {
          if (parseInt(z.zoneID, 10) === zId) z.on = targetOn;
        });
        s.anyOn = s.zones.some(function (z) { return z.available && parseInt(z.on, 10) === 1; });
      }
    });
    if (state.selectedZone && parseInt(state.selectedZone.systemID, 10) === sysId && parseInt(state.selectedZone.zoneID, 10) === zId) {
      state.selectedZone.on = targetOn;
    }
    renderApp();

    try {
      const res = await apiCall('setZoneParam', {
        systemID: sysId,
        zoneID: zId,
        params: { on: targetOn }
      });
      if (res.state === 'ok') {
        showToast('Système ' + sysId + ' / Zone ' + zId + ' : ' + (targetOn ? 'ON' : 'OFF'));
        schedulePostCommandSync();
      } else {
        showToast(res.result || 'Erreur commande Airfree', true);
      }
    } catch (e) {
      showToast('Erreur : ' + e.message, true);
    }
    renderApp();
  }

  async function updateZoneParam(systemID, zoneID, paramsObj, labelMsg) {
    const sysId = parseInt(systemID, 10);
    const zId = parseInt(zoneID, 10);

    if (typeof paramsObj.mode !== 'undefined') {
      lockSystemPatch(sysId, { mode: parseInt(paramsObj.mode, 10) });
    }
    if (zId > 0) {
      lockSystemPatch(sysId, Object.assign({ zoneID: zId }, paramsObj));
    }

    try {
      const res = await apiCall('setZoneParam', {
        systemID: sysId,
        zoneID: zId,
        params: paramsObj
      });
      if (res.state === 'ok') {
        showToast(labelMsg || ('Système ' + sysId + ' mis à jour'));
        schedulePostCommandSync();
      } else {
        showToast(res.result || 'Erreur lors de la modification', true);
      }
    } catch (e) {
      showToast('Erreur : ' + e.message, true);
    }
    renderApp();
  }

  async function setGroupPowerAll(systemID, targetOn) {
    const sysId = parseInt(systemID, 10);
    const onVal = targetOn ? 1 : 0;

    lockSystemPatch(sysId, { groupOn: onVal });

    // Mise à jour locale stricte sur ce systemID uniquement
    state.systems.forEach(function (s) {
      if (parseInt(s.systemID, 10) === sysId) {
        s.anyOn = onVal === 1;
        s.zones.forEach(function (z) {
          if (z.available) z.on = onVal;
        });
      }
    });
    state.zones.forEach(function (z) {
      if (parseInt(z.systemID, 10) === sysId && z.available) {
        z.on = onVal;
      }
    });
    renderApp();

    try {
      const res = await apiCall('setGroupPower', { systemID: sysId, on: onVal });
      if (res.state === 'ok') {
        showToast('Groupe (id:' + sysId + ') mis sur ' + (onVal ? 'ON' : 'OFF'));
        schedulePostCommandSync();
      } else {
        showToast(res.result || 'Erreur commande groupe', true);
      }
    } catch (e) {
      showToast('Erreur groupe : ' + e.message, true);
    }
    renderApp();
  }

  async function setInstallationPowerAll(targetOn) {
    showToast((targetOn ? 'Allumage' : 'Arrêt') + ' général en cours...');
    try {
      const res = await apiCall('setAllPower', { on: targetOn });
      if (res.state === 'ok' && res.result) {
        state.systems = res.result.systems || state.systems;
        state.zones = res.result.zones || state.zones;
        showToast('Installation mise à jour (' + (targetOn ? 'ON' : 'OFF') + ')');
      }
    } catch (e) {
      showToast('Erreur : ' + e.message, true);
    }
    renderApp();
  }

  function getActiveInstallation() {
    const found = state.installations.find(function (i) { return i.id === state.activeInstallationId; });
    return found || state.installations[1] || { id: 'bureaux', name: 'Bureaux', location: 'Montpellier, Hérault', ip: state.ip, port: state.port };
  }

  function renderInstallationsView() {
    const cardsHtml = state.installations.map(function (inst, idx) {
      const isCurrent = inst.id === state.activeInstallationId;
      const isLocalConnected = isCurrent && state.online;
      const badgeHtml = isLocalConnected
        ? `<span class="az-sub-badge local-ok" title="Connecté en direct via API Locale port ${inst.port}">API Locale • ${inst.ip}</span>`
        : `<span class="az-sub-badge">Non abonné <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 15h9a5 5 0 0 0 1.7-.3"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg></span>`;

      return `
        <div class="az-install-card ${idx % 2 === 1 ? 'secondary' : ''} ${isCurrent ? 'active-install' : ''}"
             onclick="window.AirfreeApp.selectInstallation('${inst.id}')">
          <div class="az-install-top">
            ${badgeHtml}
          </div>
          <div class="az-install-bottom">
            <h3 class="az-install-name">${escapeHtml(inst.name)}</h3>
            <p class="az-install-loc">${escapeHtml(inst.location)}</p>
          </div>
          ${inst.type === 'house' ? svgHouseWatermark() : svgOfficeWatermark()}
        </div>
      `;
    }).join('');

    return `
      <div class="az-container wide">
        <h2 class="az-section-title">Mes installations</h2>
        <div class="az-installations-grid">
          ${cardsHtml}
        </div>

        <div class="az-config-card" style="max-width:640px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <strong style="font-size:15px;">Connexion directe passerelle Airfree (API Locale)</strong>
            <span style="font-size:12px;color:#0d7a5f;font-weight:600;">${state.ip}:${state.port}</span>
          </div>
          <p style="font-size:13px;color:#64748b;margin:0 0 12px;">
            Cliquez sur une installation ci-dessus pour piloter ses groupes et ses zones en temps réel via l'API locale Airfree (sans abonnement Cloud requis).
          </p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <button type="button" class="az-btn-primary" onclick="window.AirfreeApp.switchTab('zones')">
              Piloter "${getActiveInstallation().name}"
            </button>
            <button type="button" class="az-view-toggle-btn" onclick="window.AirfreeApp.switchTab('config')">
              Configurer l'IP (${state.ip})
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderZoneCard(z, groupMode) {
    if (z.hidden && !state.showHiddenZones) {
      return '';
    }
    const mode = groupMode || z.mode || 3;
    if (!z.available) {
      return `
        <div class="az-zone-card zone-unavailable" onclick="window.AirfreeApp.openZoneModal('${z.logicalId}')" title="Zone non connectée (${z.rawName})">
          <div class="az-zone-name">${z.name}</div>
          <div class="az-zone-unavail-label">Zone non disponible</div>
        </div>
      `;
    }

    const t = splitTemp(z.roomTemp);
    const isOn = parseInt(z.on, 10) === 1;
    const statusText = isOn ? `${ parseFloat(z.setpoint).toFixed(1) }°` : 'OFF';
    const showModeIcon = z.isMaster === 1 || isOn;

    return `
      <div class="az-zone-card ${isOn ? 'zone-on' : 'zone-off'} mode-${mode}"
           onclick="window.AirfreeApp.openZoneModal('${z.logicalId}')">
        <div class="az-zone-top-row">
          <div class="az-zone-name" title="Consigne: ${z.setpoint}°C | Système ${z.systemID} Zone ${z.zoneID}">
            ${escapeHtml(z.name)}
          </div>
          <div class="az-zone-status-left">
            ${showModeIcon ? svgModeIcon(mode, 15) : ''}
            <span>${statusText}</span>
          </div>
        </div>

        <div class="az-zone-bottom-row">
          <div class="az-zone-temp-wrap">
            <div class="az-temp-display">
              <span class="az-temp-int">${t.intPart}</span>
              <span class="az-temp-frac">
                <span>°</span>
                <span>${t.decPart}</span>
              </span>
            </div>
            <span class="az-humidity-display">${svgDroplet()} ${z.humidity} %</span>
          </div>
          <button type="button" class="az-power-btn"
                  title="${isOn ? 'Éteindre la zone' : 'Allumer la zone'}"
                  onclick="window.AirfreeApp.toggleZone(${z.systemID}, ${z.zoneID}, ${isOn ? 1 : 0}, event)">
            ${svgPowerIcon()}
          </button>
        </div>

        ${svgCardWatermark(mode)}
      </div>
    `;
  }

  function renderConsumptionView() {
    const availZones = state.zones.filter(function (z) { return z.available === 1; });
    const onZones = availZones.filter(function (z) { return z.on === 1; });
    const airDemandZones = availZones.filter(function (z) { return z.air_demand === 1; });
    const floorDemandZones = availZones.filter(function (z) { return z.floor_demand === 1; });

    const rowsHtml = state.zones.filter(function (z) { return !z.hidden || state.showHiddenZones; }).map(function (z) {
      return `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:10px 8px;font-weight:600;">${z.name} <span style="font-size:11px;color:#94a3b8;">(S${z.systemID}:Z${z.zoneID})</span></td>
          <td style="padding:10px 8px;">${z.available ? (z.roomTemp.toFixed(1) + ' °C') : '<span style="color:#b91c1c;font-size:12px;">Indisponible</span>'}</td>
          <td style="padding:10px 8px;">${z.setpoint.toFixed(1)} °C</td>
          <td style="padding:10px 8px;">${z.humidity} %</td>
          <td style="padding:10px 8px;">
            <span style="padding:3px 8px;border-radius:99px;font-size:11.5px;font-weight:600;background:${z.air_demand ? '#fef3c7' : '#f1f5f9'};color:${z.air_demand ? '#b45309' : '#64748b'};">
              ${z.air_demand ? 'Demande Active' : 'Repos'}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="az-config-card">
        <h3 style="margin:0 0 12px;font-size:16px;">État Énergétique & Demandes CVC en temps réel</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px;">
          <div style="background:#f8fafc;padding:12px;border-radius:12px;border:1px solid #e2e8f0;">
            <div style="font-size:12px;color:#64748b;">Zones allumées</div>
            <div style="font-size:22px;font-weight:800;color:#064838;">${onZones.length} / ${availZones.length}</div>
          </div>
          <div style="background:#f8fafc;padding:12px;border-radius:12px;border:1px solid #e2e8f0;">
            <div style="font-size:12px;color:#64748b;">Demande Air (Registres)</div>
            <div style="font-size:22px;font-weight:800;color:#d97706;">${airDemandZones.length} zone(s)</div>
          </div>
          <div style="background:#f8fafc;padding:12px;border-radius:12px;border:1px solid #e2e8f0;">
            <div style="font-size:12px;color:#64748b;">Demande Plancher</div>
            <div style="font-size:22px;font-weight:800;color:#0284c7;">${floorDemandZones.length} zone(s)</div>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left;">
            <thead>
              <tr style="border-bottom:2px solid #e2e8f0;color:#64748b;">
                <th style="padding:8px;">Zone</th>
                <th style="padding:8px;">Ambiante</th>
                <th style="padding:8px;">Consigne</th>
                <th style="padding:8px;">Humidité</th>
                <th style="padding:8px;">Registre / Demande</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderZonesView() {
    const inst = getActiveInstallation();
    const groupsHtml = state.systems.map(function (sys) {
      const isCollapsed = !!state.collapsedGroups[sys.systemID];
      const cards = sys.zones.map(function (z) { return renderZoneCard(z, sys.mode); }).join('');
      const inlineModes = [
        { id: 3, title: 'Chauffage' },
        { id: 2, title: 'Refroidissement' },
        { id: 5, title: 'Déshumidification' },
        { id: 4, title: 'Ventilation' }
      ];
      const modeBtnsHtml = inlineModes.map(function (m) {
        const isActive = parseInt(sys.mode, 10) === m.id;
        return `
          <button type="button" class="az-bar-mode-btn ${isActive ? 'active' : ''}"
                  title="${m.title} (${sys.groupName} id:${sys.systemID})"
                  onclick="event.stopPropagation(); window.AirfreeApp.changeZoneMode(${sys.systemID}, 0, ${m.id})">
            ${svgModeIcon(m.id, 16)}
          </button>
        `;
      }).join('');

      return `
        <div class="az-group-block">
          <div class="az-accordion-bar">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:1;">
              <div class="az-accordion-left" onclick="window.AirfreeApp.toggleGroupCollapse(${sys.systemID})">
                <span class="az-chevron ${isCollapsed ? 'collapsed' : ''}">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                </span>
                <span class="az-accordion-title">
                  ${sys.groupName} <span class="az-sys-id-tag">(id:${sys.systemID})</span>
                </span>
              </div>
              <div class="az-bar-modes">
                ${modeBtnsHtml}
              </div>
            </div>
            <div class="az-accordion-actions">
              <button type="button" class="az-btn-text-onoff ${!sys.anyOn ? 'active-state' : ''}"
                      onclick="window.AirfreeApp.setGroupPower(${sys.systemID}, 0)">OFF</button>
              <button type="button" class="az-btn-text-onoff ${sys.anyOn ? 'active-state' : ''}"
                      onclick="window.AirfreeApp.setGroupPower(${sys.systemID}, 1)">ON</button>
            </div>
          </div>
          ${isCollapsed ? '' : `<div class="az-zones-grid">${cards}</div>`}
        </div>
      `;
    }).join('');

    const nowHour = new Date().getHours();
    const h1 = String((nowHour + 1) % 24).padStart(2, '0') + ':00';
    const h2 = String((nowHour + 2) % 24).padStart(2, '0') + ':00';

    return `
      <div class="az-container">
        <!-- Barre supérieure Installation (Bureaux) -->
        <div class="az-accordion-bar">
          <div style="display:flex;align-items:center;gap:12px;flex:1;flex-wrap:wrap;">
            <span class="az-accordion-title">${inst.name}</span>
            <div class="az-conn-pill" onclick="window.AirfreeApp.switchTab('config')" title="Cliquer pour configurer l'IP Airfree">
              <span class="az-conn-dot ${state.online ? '' : 'offline'}"></span>
              <span>${state.ip}</span>
            </div>
          </div>
          <div class="az-accordion-actions">
            <button type="button" class="az-btn-text-onoff" onclick="window.AirfreeApp.setAllPower(0)">OFF</button>
            <button type="button" class="az-btn-text-onoff" onclick="window.AirfreeApp.setAllPower(1)">ON</button>
          </div>
        </div>

        <!-- En-tête Mes zones -->
        <div class="az-zones-header-row">
          <h2 class="az-zones-title">Mes zones</h2>
          <button type="button" class="az-dots-menu-btn" title="Afficher/Masquer les zones non utilisées & Rafraîchir"
                  onclick="window.AirfreeApp.toggleHiddenZones()">•••</button>
        </div>

        <!-- Filtres Chauffage et refroidissement / Consommation -->
        <div class="az-filter-pills">
          <button type="button" class="az-pill ${state.subFilter === 'hvac' ? 'active' : ''}"
                  onclick="window.AirfreeApp.setSubFilter('hvac')">
            Chauffage et refroidissement
          </button>
          <button type="button" class="az-pill ${state.subFilter === 'consumption' ? 'active' : ''}"
                  onclick="window.AirfreeApp.setSubFilter('consumption')">
            Consommation
            <span class="az-pill-notif-dot"></span>
          </button>
        </div>

        ${state.error ? `
          <div class="az-config-card" style="border-color:#fca5a5;background:#fef2f2;color:#991b1b;">
            <strong>Connexion Airfree (${escapeHtml(state.ip)}:${escapeHtml(state.port)}) :</strong> ${escapeHtml(state.error)}
            <div style="margin-top:8px;">
              <button type="button" class="az-view-toggle-btn" onclick="window.AirfreeApp.switchTab('config')">Vérifier l'adresse IP</button>
            </div>
          </div>
        ` : ''}

        ${state.subFilter === 'consumption' ? renderConsumptionView() : groupsHtml}
      </div>
    `;
  }

  function renderSchedulesView() {
    const items = state.schedules.map(function (s) {
      return `
        <div class="az-config-card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <div style="font-weight:700;font-size:15px;">${s.name}</div>
            <div style="font-size:13px;color:#0d7a5f;font-weight:600;margin-top:2px;">⏰ ${s.time} — ${s.group}</div>
            <div style="font-size:12.5px;color:#64748b;margin-top:2px;">${s.action}</div>
          </div>
          <label style="display:inline-flex;align-items:center;cursor:pointer;gap:6px;font-size:13px;font-weight:600;">
            <input type="checkbox" ${s.enabled ? 'checked' : ''} onchange="window.AirfreeApp.toggleSchedule(${s.id})" style="width:18px;height:18px;accent-color:#064838;" />
            Actif
          </label>
        </div>
      `;
    }).join('');

    return `
      <div class="az-container">
        <h2 class="az-section-title">Programmations horaires (Jeedom Cron & Scénarios)</h2>
        ${items}
      </div>
    `;
  }

  function renderRoutinesView() {
    return `
      <div class="az-container">
        <h2 class="az-section-title">Routines rapides & Scénarios</h2>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;">
          <div class="az-config-card" style="cursor:pointer;" onclick="window.AirfreeApp.setAllPower(1)">
            <div style="font-size:24px;margin-bottom:6px;">☀️</div>
            <div style="font-weight:700;font-size:15px;">Confort Bureaux (Tout ON)</div>
            <p style="font-size:12.5px;color:#64748b;margin:4px 0 0;">Allume toutes les zones disponibles des Groupes 1 et 2.</p>
          </div>
          <div class="az-config-card" style="cursor:pointer;" onclick="window.AirfreeApp.setAllPower(0)">
            <div style="font-size:24px;margin-bottom:6px;">🌙</div>
            <div style="font-weight:700;font-size:15px;">Départ / Extinction Totale</div>
            <p style="font-size:12.5px;color:#64748b;margin:4px 0 0;">Coupe immédiatement toutes les zones de l'installation.</p>
          </div>
          <div class="az-config-card" style="cursor:pointer;" onclick="window.AirfreeApp.applyEcoSetpoint(21.0)">
            <div style="font-size:24px;margin-bottom:6px;">🍃</div>
            <div style="font-weight:700;font-size:15px;">Consigne Éco 21.0°C</div>
            <p style="font-size:12.5px;color:#64748b;margin:4px 0 0;">Applique une consigne sobre de 21.0°C sur les zones maîtres.</p>
          </div>
        </div>
      </div>
    `;
  }

  function renderConfigView() {
    const inst = getActiveInstallation();
    const dev = state.deviceInfo || {
      alias: inst.alias || 'Dispositif_43D1',
      mac: inst.mac || '18:48:CA:8E:43:D1',
      firmware: inst.firmware || '4.16',
      ip: state.ip,
      wifi: inst.wifiSsid || 'LAN / Wi-Fi',
      quality: state.online ? 'Excellente' : 'Hors ligne',
      latencyMs: 0
    };

    const systemsBlocksHtml = state.systems.map(function (sys) {
      const visibleZones = sys.zones.filter(function (z) { return !z.hidden || state.showHiddenZones; });
      const zonesRowsHtml = visibleZones.map(function (z) {
        return `
          <div class="az-airtools-row zone-item clickable" onclick="window.AirfreeApp.openZoneModal('${z.logicalId}')">
            <span>${z.name}</span>
            <span class="az-airtools-val accent">
              <span style="font-size:12.5px;color:#64748b;">${z.available ? (z.roomTemp.toFixed(1) + '°C • ' + z.humidity + '%') : 'Indisponible'}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d7a5f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </span>
          </div>
        `;
      }).join('');

      return `
        <div class="az-airtools-list" style="margin-bottom:16px;">
          <div class="az-airtools-row clickable" onclick="window.AirfreeApp.switchTab('zones')">
            <span style="font-weight:600;">Système ${sys.systemID} (${sys.groupName})</span>
            <span class="az-airtools-val accent">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d7a5f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </span>
          </div>
          <div class="az-airtools-row sub-header">
            <span>Chauffage et refroidissement</span>
            <span style="font-size:12.5px;">Mode : ${MODE_META[sys.mode] ? MODE_META[sys.mode].label : sys.mode}</span>
          </div>
          ${zonesRowsHtml}
        </div>
      `;
    }).join('');

    return `
      <div class="az-container">
        <h2 class="az-section-title" style="font-size:16px;color:#4b5563;margin-top:8px;">Information sur le dispositif (${inst.name})</h2>

        <div class="az-airtools-list">
          <div class="az-airtools-row">
            <span>Alias</span>
            <span class="az-airtools-val accent">${dev.alias}</span>
          </div>
          <div class="az-airtools-row">
            <span>MAC</span>
            <span class="az-airtools-val">${dev.mac}</span>
          </div>
          <div class="az-airtools-row">
            <span>Firmware / API</span>
            <span class="az-airtools-val">
              <span>${dev.firmware}</span>
            </span>
          </div>
          <div class="az-airtools-row">
            <span>Adresse IP Wi-Fi / LAN</span>
            <span class="az-airtools-val">${state.ip}</span>
          </div>
          <div class="az-airtools-row">
            <div>
              <div>Wi-Fi / Réseau</div>
              <div style="font-size:12px;color:#6c737a;margin-top:2px;">${state.online ? 'Connecté en local (Port ' + state.port + ')' : 'Non joignable'}</div>
            </div>
            <span class="az-airtools-val">
              <span>${dev.wifi}</span>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="${state.online ? '#0d7a5f' : '#94a3b8'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
                <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                <line x1="12" y1="20" x2="12.01" y2="20"></line>
              </svg>
            </span>
          </div>
          <div class="az-airtools-row">
            <span style="display:inline-flex;align-items:center;gap:6px;">
              Qualité de connexion
              <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;border:1.5px solid #9ca3af;color:#9ca3af;font-size:11px;font-weight:700;" title="Latence mesurée vers l'API locale port 3000">i</span>
            </span>
            <span class="az-airtools-val">${dev.quality} ${dev.latencyMs ? '(' + dev.latencyMs + ' ms)' : ''}</span>
          </div>
          <div class="az-airtools-row clickable" onclick="window.AirfreeApp.toggleRawDiag()">
            <span>Diagnostic à distance (API Locale JSON)</span>
            <span class="az-airtools-val accent">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0d7a5f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </span>
          </div>
        </div>

        ${state.showRawDiag ? `
          <div class="az-config-card">
            <h3 style="margin:0 0 8px;font-size:15px;">Réponse brute JSON (/api/v1/hvac)</h3>
            <pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:10px;font-size:11.5px;overflow-x:auto;max-height:260px;">${JSON.stringify(state.systems, null, 2)}</pre>
          </div>
        ` : ''}

        <h2 class="az-section-title" style="font-size:16px;color:#4b5563;">Systèmes</h2>
        ${systemsBlocksHtml}

        <div class="az-config-card" style="margin-top:22px;">
          <h3 style="margin:0 0 14px;font-size:15.5px;">Réglages Réseau & Intégration Jeedom</h3>
          <div class="az-form-group">
            <label class="az-form-label">Installation active</label>
            <select id="az-cfg-inst" class="az-form-input" onchange="window.AirfreeApp.selectInstallation(this.value)">
              ${state.installations.map(function (i) {
                return `<option value="${i.id}" ${i.id === state.activeInstallationId ? 'selected' : ''}>${i.name} (${i.ip}:${i.port})</option>`;
              }).join('')}
            </select>
          </div>
          <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">
            <div class="az-form-group">
              <label class="az-form-label">Adresse IP locale</label>
              <input type="text" id="az-cfg-ip" class="az-form-input" value="${state.ip}" placeholder="192.168.0.61" />
            </div>
            <div class="az-form-group">
              <label class="az-form-label">Port TCP</label>
              <input type="number" id="az-cfg-port" class="az-form-input" value="${state.port}" placeholder="3000" />
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="az-form-group">
              <label class="az-form-label">IDs Systèmes (Groupes) à interroger (ex: 1,3)</label>
              <input type="text" id="az-cfg-systems" class="az-form-input" value="${state.systemsCsv}" placeholder="1,3" />
            </div>
            <div class="az-form-group">
              <label class="az-form-label">Nom du réseau Wi-Fi / LAN (affiché)</label>
              <input type="text" id="az-cfg-wifi" class="az-form-input" value="${dev.wifi || ''}" placeholder="ex: new, Livebox, LAN..." />
            </div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">
            <button type="button" class="az-btn-primary" onclick="window.AirfreeApp.saveConnectionSettings()">
              Enregistrer & Tester la connexion
            </button>
            <button type="button" class="az-view-toggle-btn" onclick="window.AirfreeApp.toggleHiddenZones()">
              ${state.showHiddenZones ? 'Masquer les zones ZONA/ZONE inutilisées' : 'Afficher toutes les zones brutes (ZONA 04, ZONE 01...)'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function renderZoneModal() {
    const z = state.selectedZone;
    if (!z) return '';

    const isOn = parseInt(z.on, 10) === 1;
    const modesToShow = [1, 2, 3, 4, 5, 7];

    const modeButtonsHtml = modesToShow.map(function (mId) {
      const m = MODE_META[mId];
      const active = parseInt(z.mode, 10) === mId;
      return `
        <button type="button" class="az-mode-btn ${active ? 'active' : ''}"
                onclick="window.AirfreeApp.changeZoneMode(${z.systemID}, ${z.zoneID}, ${mId})">
          ${svgModeIcon(mId, 18)}
          <span>${m.short}</span>
        </button>
      `;
    }).join('');

    const sleepValues = [
      { v: 0, l: 'Désactivé' },
      { v: 30, l: '30 min' },
      { v: 60, l: '60 min' },
      { v: 90, l: '90 min' }
    ];

    return `
      <div class="az-modal-backdrop open" onclick="window.AirfreeApp.closeModals(event)">
        <div class="az-modal-sheet" onclick="event.stopPropagation()">
          <div class="az-modal-header">
            <div>
              <h3 class="az-modal-title">${z.name}</h3>
              <div class="az-modal-subtitle">
                Système ${z.systemID} • Zone ${z.zoneID} ${z.isMaster ? '• Thermostat Maître' : '• Thermostat Zone'}
              </div>
            </div>
            <button type="button" class="az-modal-close" onclick="window.AirfreeApp.closeModals()">✕</button>
          </div>

          ${!z.available ? `
            <div style="background:#fef2f2;color:#991b1b;padding:14px;border-radius:12px;font-size:13.5px;margin-bottom:14px;">
              <strong>Zone non disponible :</strong> Aucune sonde active détectée sur cette zone (${z.rawName}, roomTemp = 0°C, humidité = 0%).
            </div>
          ` : ''}

          <!-- Cadran Thermostat -->
          <div class="az-thermostat-dial">
            <div class="az-thermostat-inner">
              <span class="az-dial-label">${isOn ? (MODE_META[z.mode] ? MODE_META[z.mode].label : 'Actif') : 'Zone Éteinte'}</span>
              <div class="az-dial-setpoint">${parseFloat(z.setpoint).toFixed(1)}°</div>
              <div class="az-dial-ambient">Ambiante : <strong>${parseFloat(z.roomTemp).toFixed(1)}°C</strong> • 💧 ${z.humidity}%</div>
            </div>
          </div>

          <!-- Boutons - / + Consigne (pas de 0.5°C entre minTemp et maxTemp) -->
          <div class="az-setpoint-Controls">
            <button type="button" class="az-step-btn" title="Diminuer de 0.5°C"
                    onclick="window.AirfreeApp.stepSetpoint(${z.systemID}, ${z.zoneID}, -0.5)">−</button>
            <button type="button" class="az-btn-primary" style="background:${isOn ? '#b91c1c' : '#064838'};min-width:130px;justify-content:center;"
                    onclick="window.AirfreeApp.toggleZone(${z.systemID}, ${z.zoneID}, ${isOn ? 1 : 0}, event)">
              ${svgPowerIcon()} ${isOn ? 'Éteindre (OFF)' : 'Allumer (ON)'}
            </button>
            <button type="button" class="az-step-btn" title="Augmenter de 0.5°C"
                    onclick="window.AirfreeApp.stepSetpoint(${z.systemID}, ${z.zoneID}, 0.5)">+</button>
          </div>

          <!-- Sélecteur de Mode CVC -->
          <div style="font-size:12.5px;font-weight:700;color:#475569;margin-bottom:4px;">Mode de fonctionnement CVC</div>
          <div class="az-modes-grid">
            ${modeButtonsHtml}
          </div>

          <!-- Minuterie Veille (Sleep) -->
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;">
            <span style="font-size:13px;font-weight:600;color:#334155;">⏲️ Minuterie Veille (Sleep)</span>
            <div style="display:flex;gap:6px;">
              ${sleepValues.map(function (s) {
                const active = parseInt(z.sleep || 0, 10) === s.v;
                return `<button type="button" class="az-view-toggle-btn ${active ? 'active' : ''}"
                          onclick="window.AirfreeApp.changeZoneSleep(${z.systemID}, ${z.zoneID}, ${s.v})">${s.l}</button>`;
              }).join('')}
            </div>
          </div>

          <!-- Infos techniques Home Assistant / Jeedom -->
          <div style="margin-top:14px;padding:10px 12px;background:#f8fafc;border-radius:10px;font-size:12px;color:#64748b;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <span>Plage : ${z.minTemp}°C – ${z.maxTemp}°C</span>
            <span>Demande Air : <strong>${z.air_demand ? 'OUI' : 'NON'}</strong></span>
            <span>Plancher : <strong>${z.floor_demand ? 'OUI' : 'NON'}</strong></span>
          </div>
        </div>
      </div>
    `;
  }

  function renderGroupModal() {
    const sys = state.selectedGroup;
    if (!sys) return '';

    const modesToShow = [1, 2, 3, 4, 5, 7];
    return `
      <div class="az-modal-backdrop open" onclick="window.AirfreeApp.closeModals(event)">
        <div class="az-modal-sheet" onclick="event.stopPropagation()">
          <div class="az-modal-header">
            <div>
              <h3 class="az-modal-title">${sys.groupName} (Système ${sys.systemID})</h3>
              <div class="az-modal-subtitle">Pilotage global du groupe (${sys.zones.length} zones)</div>
            </div>
            <button type="button" class="az-modal-close" onclick="window.AirfreeApp.closeModals()">✕</button>
          </div>

          <div style="display:flex;gap:10px;margin-bottom:18px;">
            <button type="button" class="az-btn-primary" style="flex:1;justify-content:center;"
                    onclick="window.AirfreeApp.setGroupPower(${sys.systemID}, 1); window.AirfreeApp.closeModals();">
              Tout allumer (ON)
            </button>
            <button type="button" class="az-btn-primary" style="flex:1;justify-content:center;background:#585b5e;"
                    onclick="window.AirfreeApp.setGroupPower(${sys.systemID}, 0); window.AirfreeApp.closeModals();">
              Tout éteindre (OFF)
            </button>
          </div>

          <div style="font-size:13px;font-weight:700;color:#475569;margin-bottom:6px;">Mode général du ${sys.groupName}</div>
          <div class="az-modes-grid">
            ${modesToShow.map(function (mId) {
              const m = MODE_META[mId];
              const active = parseInt(sys.mode, 10) === mId;
              return `
                <button type="button" class="az-mode-btn ${active ? 'active' : ''}"
                        onclick="window.AirfreeApp.changeZoneMode(${sys.systemID}, ${sys.masterZoneID || 1}, ${mId})">
                  ${svgModeIcon(mId, 18)}
                  <span>${m.label}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderApp() {
    const root = document.getElementById('airfree-app-root');
    if (!root) return;

    let mainViewHtml = '';
    if (state.activeTab === 'installations') {
      mainViewHtml = renderInstallationsView();
    } else if (state.activeTab === 'schedules') {
      mainViewHtml = renderSchedulesView();
    } else if (state.activeTab === 'routines') {
      mainViewHtml = renderRoutinesView();
    } else if (state.activeTab === 'config') {
      mainViewHtml = renderConfigView();
    } else {
      mainViewHtml = renderZonesView();
    }

    root.innerHTML = `
      <div class="az-app-wrapper ${state.mobilePreview ? 'az-mobile-preview' : ''}">
        <div id="az-toast" class="az-toast"></div>

        <!-- En-tête Airfree -->
        <header class="az-top-header">
          <div class="az-header-left">
            <button type="button" class="az-hamburger-btn" title="Mes installations"
                    onclick="window.AirfreeApp.switchTab(window.AirfreeApp.state.activeTab === 'installations' ? 'zones' : 'installations')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
          </div>

          <div class="az-brand-logo" onclick="window.AirfreeApp.switchTab('zones')">
            <span>Airfree - Respirez ! C'est Open-Source !</span>
          </div>

          <div class="az-header-right">
            <button type="button" class="az-view-toggle-btn ${state.mobilePreview ? 'active' : ''}"
                    onclick="window.AirfreeApp.toggleMobilePreview()"
                    title="Basculer l'aperçu Smartphone / Plein écran">
              📱 <span style="display:none;" class="az-hide-sm">Mobile</span>
            </button>
          </div>
        </header>

        <!-- Contenu principal -->
        <main>
          ${mainViewHtml}
        </main>

        <!-- Barre de navigation inférieure (Zones / Programmations / Routines / Configuration) -->
        <div class="az-bottom-nav-wrap">
          <nav class="az-bottom-nav">
            <button type="button" class="az-nav-item ${state.activeTab === 'zones' || state.activeTab === 'installations' ? 'active' : ''}"
                    onclick="window.AirfreeApp.switchTab('zones')">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                <rect x="3" y="14" width="7" height="7" rx="1"></rect>
              </svg>
              <span>Zones</span>
            </button>

            <button type="button" class="az-nav-item ${state.activeTab === 'schedules' ? 'active' : ''}"
                    onclick="window.AirfreeApp.switchTab('schedules')">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <span>Programmations</span>
            </button>

            <button type="button" class="az-nav-item ${state.activeTab === 'routines' ? 'active' : ''}"
                    onclick="window.AirfreeApp.switchTab('routines')">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>Routines</span>
            </button>

            <button type="button" class="az-nav-item ${state.activeTab === 'config' ? 'active' : ''}"
                    onclick="window.AirfreeApp.switchTab('config')">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" y1="21" x2="4" y2="14"></line>
                <line x1="4" y1="10" x2="4" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12" y2="3"></line>
                <line x1="20" y1="21" x2="20" y2="16"></line>
                <line x1="20" y1="12" x2="20" y2="3"></line>
                <line x1="1" y1="14" x2="7" y2="14"></line>
                <line x1="9" y1="8" x2="15" y2="8"></line>
                <line x1="17" y1="16" x2="23" y2="16"></line>
              </svg>
              <span>Configuration</span>
            </button>
          </nav>
        </div>

        ${renderZoneModal()}
      </div>
    `;
  }

  window.AirfreeApp = {
    state: state,
    _pollTimer: null,
    init: function () {
      loadAirfreeState(false);
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
      }
      // Rafraîchissement automatique toutes les 15 secondes tant que le composant est présent dans le DOM
      this._pollTimer = setInterval(function () {
        if (document.getElementById('airfree-app-root')) {
          loadAirfreeState(true);
        }
      }, 15000);
    },
    switchTab: function (tabName) {
      state.activeTab = tabName;
      renderApp();
    },
    setSubFilter: function (filter) {
      state.subFilter = filter;
      renderApp();
    },
    toggleMobilePreview: function () {
      state.mobilePreview = !state.mobilePreview;
      renderApp();
    },
    toggleInstallCollapse: function () {
      state.installCollapsed = !state.installCollapsed;
      renderApp();
    },
    toggleGroupCollapse: function (sysId) {
      state.collapsedGroups[sysId] = !state.collapsedGroups[sysId];
      renderApp();
    },
    toggleHiddenZones: function () {
      state.showHiddenZones = !state.showHiddenZones;
      showToast(state.showHiddenZones ? 'Zones non assignées affichées' : 'Zones non assignées masquées');
      renderApp();
    },
    toggleRawDiag: function () {
      state.showRawDiag = !state.showRawDiag;
      renderApp();
    },
    selectInstallation: async function (instId) {
      state.activeInstallationId = instId;
      const inst = getActiveInstallation();
      state.ip = inst.ip;
      state.port = inst.port;
      state.systemsCsv = inst.systems;
      state.activeTab = 'zones';
      await apiCall('saveConfig', { installationId: instId, ip: inst.ip, port: inst.port, systems: inst.systems });
      await loadAirfreeState(false);
    },
    toggleZone: toggleZonePower,
    setGroupPower: setGroupPowerAll,
    setAllPower: setInstallationPowerAll,
    openZoneModal: function (logicalId) {
      const z = state.zones.find(function (item) { return item.logicalId === logicalId; });
      if (z) {
        state.selectedZone = z;
        state.selectedGroup = null;
        renderApp();
      }
    },
    openGroupModal: function (systemID) {
      const s = state.systems.find(function (item) { return item.systemID === systemID; });
      if (s) {
        state.selectedGroup = s;
        state.selectedZone = null;
        renderApp();
      }
    },
    closeModals: function () {
      state.selectedZone = null;
      state.selectedGroup = null;
      renderApp();
    },
    stepSetpoint: function (systemID, zoneID, delta) {
      const z = state.zones.find(function (item) { return item.systemID === systemID && item.zoneID === zoneID; });
      if (!z) return;
      let nextVal = Math.round((parseFloat(z.setpoint) + delta) * 2) / 2;
      if (nextVal < z.minTemp) nextVal = z.minTemp;
      if (nextVal > z.maxTemp) nextVal = z.maxTemp;
      z.setpoint = nextVal;
      renderApp();
      updateZoneParam(systemID, zoneID, { setpoint: nextVal }, 'Consigne réglée à ' + nextVal.toFixed(1) + '°C');
    },
    changeZoneMode: function (systemID, zoneID, modeId) {
      const sysId = parseInt(systemID, 10);
      const zId = parseInt(zoneID, 10);
      const mId = parseInt(modeId, 10);
      // Mise à jour visuelle immédiate uniquement sur le systemID ciblé
      state.systems.forEach(function (s) {
        if (parseInt(s.systemID, 10) === sysId) {
          s.mode = mId;
          s.zones.forEach(function (z) { z.mode = mId; });
        }
      });
      state.zones.forEach(function (z) {
        if (parseInt(z.systemID, 10) === sysId) z.mode = mId;
      });
      renderApp();
      updateZoneParam(sysId, zId, { mode: mId }, 'Groupe (id:' + sysId + ') → Mode : ' + (MODE_META[mId] ? MODE_META[mId].label : mId));
    },
    changeZoneSleep: function (systemID, zoneID, sleepMin) {
      updateZoneParam(systemID, zoneID, { sleep: sleepMin }, 'Veille réglée sur ' + (sleepMin ? sleepMin + ' min' : 'Désactivé'));
    },
    applyEcoSetpoint: async function (temp) {
      for (const s of state.systems) {
        await updateZoneParam(s.systemID, s.masterZoneID || 1, { setpoint: temp }, 'Consigne Éco ' + temp + '°C appliquée');
      }
    },
    toggleSchedule: function (id) {
      const sc = state.schedules.find(function (x) { return x.id === id; });
      if (sc) sc.enabled = !sc.enabled;
      showToast('Programmation mise à jour');
      renderApp();
    },
    saveConnectionSettings: async function () {
      const ipEl = document.getElementById('az-cfg-ip');
      const portEl = document.getElementById('az-cfg-port');
      const sysEl = document.getElementById('az-cfg-systems');
      const wifiEl = document.getElementById('az-cfg-wifi');
      if (ipEl) state.ip = ipEl.value.trim();
      if (portEl) state.port = parseInt(portEl.value, 10) || 3000;
      if (sysEl) state.systemsCsv = sysEl.value.trim() || '1,3';
      const wifiVal = wifiEl ? wifiEl.value.trim() : '';

      showToast('Test de connexion à ' + state.ip + ':' + state.port + '...');
      await apiCall('saveConfig', {
        installationId: state.activeInstallationId,
        ip: state.ip,
        port: state.port,
        systems: state.systemsCsv,
        wifiSsid: wifiVal
      });
      await loadAirfreeState(false);
      if (state.online) {
        showToast('Connecté avec succès à ' + state.ip + ':' + state.port);
      } else {
        showToast('Échec de connexion à ' + state.ip + ':' + state.port, true);
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (document.getElementById('airfree-app-root')) {
        window.AirfreeApp.init();
      }
    });
  } else if (document.getElementById('airfree-app-root')) {
    window.AirfreeApp.init();
  }
})(window);
